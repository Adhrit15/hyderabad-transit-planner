import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { decodeNetwork, type Network } from './network';
import { earliestTrip, raptor } from './raptor';
import { retimeOffsets } from './timing';
import { autoFare, cabFare, slabFare } from './fares';
import { pareto, planJourneys, type Journey } from './plan';
// The pipeline's implementation, imported directly, so the two copies cannot drift apart.
// @ts-expect-error plain JS module without types
import { retimeOffsets as pipelineRetime } from '../../../pipeline/src/repair.mjs';

const traffic = { roadCircuity: 1.35, carKmph: Array.from({ length: 24 }, (_, h) => 14 + (h % 7) * 3), busKmphFactor: 0.75, busDwellSec: 25, walkKmph: 4.5, walkCircuity: 1.3 };

/** Builds a raw bundle (same shape as pipeline output, not delta-encoded beyond what decode expects). */
function rawNet(stops: [number, number][], patterns: { stops: number[]; starts: number[]; offsets: number[] | null; mode?: string }[]) {
  const enc = (a: number[]) => a.map((v, i) => (i ? v - a[i - 1] : v));
  const profiles: number[][] = [];
  return {
    generatedAt: 'test',
    stops: { name: stops.map((_, i) => `S${i}`), lat: enc(stops.map((s) => Math.round(s[0] * 1e5))), lon: enc(stops.map((s) => Math.round(s[1] * 1e5))),
      mode: stops.map(() => 1), chg: stops.map(() => 0) },
    routes: patterns.map((p, i) => ({ n: `R${i}`, l: '', m: p.mode ?? 'bus', c: null, src: 't' })),
    patterns: patterns.map((p, i) => {
      let prof = -1;
      if (p.offsets) { prof = profiles.length; profiles.push(p.offsets); }
      const kmC = p.stops.map((_, k) => k * 200);
      return { r: i, h: 'h', s: p.stops, k: enc(kmC), t: enc(p.starts), p: p.starts.map(() => prof), d: p.starts.map(() => 127), f: p.starts.map(() => (prof < 0 ? 2 : 0)) };
    }),
    profiles: profiles.map(enc),
    fares: {
      bus: { slabs: [{ maxKm: 6, fare: 15 }, { maxKm: null, fare: 30 }] }, metro: { slabs: [{ maxKm: null, fare: 20 }] }, mmts: { slabs: [{ maxKm: null, fare: 5 }] },
      auto: { baseFare: 30, baseKm: 1.6, perKm: 14, nightMultiplier: 1.5, nightHours: [23, 5], quotedAboveMeter: [1, 1.4] },
      cab: { baseFare: 50, perKm: 13, perMin: 1.5, minFare: 90, surge: [{ hours: [0, 23], range: [1, 1.5] }] }, shareAuto: { slabs: [{ maxKm: null, fare: 10 }] },
    },
    traffic, autoPoints: [], attribution: [],
  };
}

/** Independent check: time-dependent Dijkstra over stops (exact on FIFO timetables with no footpaths). */
function bruteEarliest(net: Network, src: number, dst: number, t0: number) {
  const best = new Array(net.n).fill(Infinity);
  best[src] = t0;
  const done = new Set<number>();
  for (;;) {
    let u = -1;
    for (let i = 0; i < net.n; i++) if (!done.has(i) && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i;
    if (u < 0) break;
    done.add(u);
    for (const { pattern, pos } of net.stopPatterns[u]) {
      const t = earliestTrip(net, pattern, pos, best[u], 127);
      if (t < 0) continue;
      const p = net.patterns[pattern];
      const off = p.profile[t] >= 0 ? net.profiles[p.profile[t]] : retimeOffsets(p.kmC, p.start[t], net.traffic);
      for (let i = pos + 1; i < p.stops.length; i++) best[p.stops[i]] = Math.min(best[p.stops[i]], p.start[t] + off[2 * i]);
    }
  }
  return best[dst];
}

describe('RAPTOR', () => {
  it('finds a one-change journey and reconstructs it', () => {
    // S0 -A-> S1 -A-> S2 ; S1 -B-> S3. Stops 3 km apart, so there are no footpaths.
    const net = decodeNetwork(rawNet([[17.30, 78.30], [17.33, 78.30], [17.36, 78.30], [17.33, 78.33]], [
      { stops: [0, 1, 2], starts: [3600, 7200], offsets: [0, 0, 600, 600, 1200, 1200] },
      { stops: [1, 3], starts: [3000, 4500, 9000], offsets: [0, 0, 900, 900] },
    ]));
    const r = raptor(net, { departSec: 3500, dayBit: 1, sources: [{ stop: 0, sec: 0, tag: 0 }], targets: [{ stop: 3, sec: 0, tag: 0 }] });
    expect(r.journeys).toHaveLength(1);
    const j = r.journeys[0];
    expect(j.rides).toBe(2);
    expect(j.arrival).toBe(4500 + 900);      // 1st bus 3600 → S1 at 4200, then 4500 → S3 at 5400
    expect(j.steps.map((s) => s.kind)).toEqual(['access', 'ride', 'ride']);
  });

  it('returns a Pareto set over rides: slower direct trip and faster trip with a change', () => {
    const net = decodeNetwork(rawNet([[17.30, 78.30], [17.33, 78.30], [17.36, 78.30]], [
      { stops: [0, 2], starts: [3600], offsets: [0, 0, 5000, 5000] },          // direct, slow
      { stops: [0, 1], starts: [3600], offsets: [0, 0, 600, 600] },
      { stops: [1, 2], starts: [4300], offsets: [0, 0, 600, 600] },
    ]));
    const r = raptor(net, { departSec: 3600, dayBit: 1, sources: [{ stop: 0, sec: 0, tag: 0 }], targets: [{ stop: 2, sec: 0, tag: 0 }] });
    expect(r.journeys.map((j) => [j.rides, j.arrival])).toEqual([[1, 8600], [2, 4900]]);
  });

  it('respects the weekday mask', () => {
    const raw = rawNet([[17.30, 78.30], [17.33, 78.30]], [{ stops: [0, 1], starts: [3600, 7200], offsets: [0, 0, 600, 600] }]);
    raw.patterns[0].d = [1, 127];                    // first trip Mondays only
    const net = decodeNetwork(raw);
    const tue = raptor(net, { departSec: 0, dayBit: 2, sources: [{ stop: 0, sec: 0, tag: 0 }], targets: [{ stop: 1, sec: 0, tag: 0 }] });
    expect(tue.journeys[0].arrival).toBe(7800);
  });

  it('matches time-dependent Dijkstra on 200 random timetables', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let rep = 0; rep < 200; rep++) {
      const N = 8;
      const stops: [number, number][] = Array.from({ length: N }, (_, i) => [17 + i * 0.03, 78 + (i % 3) * 0.03]);
      const pats = Array.from({ length: 6 }, () => {
        const len = 2 + Math.floor(rnd() * 4);
        const order = [...Array(N).keys()].sort(() => rnd() - 0.5).slice(0, len);
        const offsets = [0, 0];
        let t = 0;
        for (let k = 1; k < len; k++) { t += 120 + Math.floor(rnd() * 900); offsets.push(t, t + 30 * (k < len - 1 ? 1 : 0)); t += 30 * (k < len - 1 ? 1 : 0); }
        const starts = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => Math.floor(rnd() * 20000)).sort((a, b) => a - b);
        return { stops: order, starts, offsets: rnd() < 0.3 ? null : offsets };
      });
      const net = decodeNetwork(rawNet(stops, pats));
      for (let q = 0; q < 5; q++) {
        const a = Math.floor(rnd() * N), b = Math.floor(rnd() * N), t0 = Math.floor(rnd() * 10000);
        if (a === b) continue;
        const r = raptor(net, { departSec: t0, dayBit: 1, sources: [{ stop: a, sec: 0, tag: 0 }], targets: [{ stop: b, sec: 0, tag: 0 }], maxRounds: 10 });
        const got = r.journeys.length ? Math.min(...r.journeys.map((j) => j.arrival)) : Infinity;
        expect(got, `rep ${rep} q ${q}`).toBe(bruteEarliest(net, a, b, t0));
      }
    }
  });
});

describe('timing parity with the pipeline', () => {
  it('retimeOffsets is identical in TS and in pipeline/src/repair.mjs', () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 300; i++) {
      const kmC = [0];
      for (let k = 0; k < 2 + Math.floor(rnd() * 30); k++) kmC.push(kmC[kmC.length - 1] + Math.floor(rnd() * 300));
      const dep0 = Math.floor(rnd() * 100000);
      expect(retimeOffsets(kmC, dep0, traffic)).toEqual(pipelineRetime(kmC, dep0, traffic));
    }
  });
});

describe('fares', () => {
  it('slab, auto meter (with night surcharge) and cab range', () => {
    expect(slabFare([{ maxKm: 2, fare: 11 }, { maxKm: null, fare: 69 }], 2)).toBe(11);
    expect(slabFare([{ maxKm: 2, fare: 11 }, { maxKm: null, fare: 69 }], 2.01)).toBe(69);
    const f = { baseFare: 30, baseKm: 1.6, perKm: 14, nightMultiplier: 1.5, nightHours: [23, 5] as [number, number], quotedAboveMeter: [1, 1.4] as [number, number], note: '' };
    expect(autoFare(1, 12 * 3600, f).meter).toBe(30);
    expect(autoFare(3.6, 12 * 3600, f).meter).toBe(58);
    expect(autoFare(3.6, 23.5 * 3600, f).meter).toBe(87);
    const c = cabFare(10, 1800, 9 * 3600, { baseFare: 50, perKm: 13, perMin: 1.5, minFare: 90, surge: [{ hours: [8, 10], range: [1.2, 1.8] }], note: '' });
    expect(c.min).toBeLessThan(c.max);
  });

  it('pareto keeps trade-offs and drops dominated journeys', () => {
    const j = (arr: number, cost: number, tr = 0, walk = 0) => ({ arriveSec: arr, cost: { min: cost, max: cost }, transfers: tr, walkSec: walk }) as Journey;
    const a = j(100, 50), b = j(200, 10), c = j(250, 60);
    expect(pareto([a, b, c])).toEqual([a, b]);
  });
});

// Real-data smoke test: runs only after `npm run data` has produced the bundle.
const bundle = new URL('../../public/data/network.json', import.meta.url);
describe.runIf(existsSync(bundle))('real Hyderabad network', () => {
  const net = decodeNetwork(JSON.parse(readFileSync(bundle, 'utf8')));
  const P = (lat: number, lon: number, name: string) => ({ lat, lon, name });
  it.each([
    ['Miyapur → Charminar', P(17.4968, 78.3727, 'Miyapur'), P(17.3616, 78.4747, 'Charminar')],
    ['Raidurg → MGBS', P(17.4412, 78.3777, 'Raidurg'), P(17.3784, 78.4840, 'MGBS')],
    ['Secunderabad → HITEC City', P(17.4337, 78.5016, 'Secunderabad'), P(17.4474, 78.3762, 'HITEC City')],
  ])('%s at 9:00 on a Wednesday has transit and road options', (_n, a, b) => {
    const r = planJourneys(net, a, b, 9 * 3600, 1 << 2);
    expect(r.journeys.some((j) => j.legs.some((l) => ['bus', 'metro', 'mmts'].includes(l.kind)))).toBe(true);
    expect(r.journeys.some((j) => j.legs[0].kind === 'cab')).toBe(true);
    for (const j of r.journeys) {
      expect(j.arriveSec).toBeGreaterThan(9 * 3600 - 3600);
      for (let i = 1; i < j.legs.length; i++) expect(j.legs[i].depSec).toBeGreaterThanOrEqual(j.legs[i - 1].arrSec - 1);
    }
    expect(r.stats.ms).toBeLessThan(3000);
  });
});
