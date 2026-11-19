// RAPTOR (Round-bAsed Public Transit Optimized Router, Delling, Pajor & Werneck 2012).
//
// Idea: instead of a priority queue over nodes, work in ROUNDS. After round k we know the earliest
// arrival at every stop using at most k vehicles. Round k scans every pattern that serves a stop
// improved in round k-1, "hops on" the earliest catchable trip and rides it to the end, recording
// arrivals. Then footpaths let you walk to nearby stops. The result is a Pareto set over
// (arrival time, number of rides) for free: one best journey per round count.
//
// Complexity per round is O(sum of pattern lengths + footpaths); with K rounds, O(K·(Σ|p| + F)).
// That is linear in the timetable, with no heap, which is why RAPTOR is used by real journey planners.
import type { Network } from './network';
import { arrAt, depAt } from './timing';

export interface Access { stop: number; sec: number; tag: number }  // tag: caller-defined (walk / auto …)
export interface RaptorQuery { departSec: number; dayBit: number; sources: Access[]; targets: Access[]; maxRounds?: number }

export type Step =
  | { kind: 'access'; stop: number; tag: number }
  | { kind: 'ride'; pattern: number; trip: number; boardPos: number; alightPos: number }
  | { kind: 'walk'; from: number; to: number; sec: number };

export interface RaptorJourney { rides: number; arrival: number; target: Access; steps: Step[] }

const INF = 2 ** 31 - 1;

export function raptor(net: Network, q: RaptorQuery): { journeys: RaptorJourney[]; scannedPatterns: number } {
  const K = q.maxRounds ?? 5;
  const n = net.n;
  const best = new Int32Array(n).fill(INF);
  const tau: Int32Array[] = [];                   // tau[k][s] earliest arrival with ≤ k rides (ride or walk)
  const tauRide: Int32Array[] = [];               // arrival at s in round k by riding (footpaths start from these)
  const rideLab: { p: number; t: number; b: number; a: number }[][] = [];
  const walkLab: Int32Array[] = [];               // -1, or the stop the final footpath started from
  const accessTag = new Int32Array(n).fill(-1);
  const targetEgress = new Map(q.targets.map((t) => [t.stop, t]));
  let bestTarget = INF;
  let scanned = 0;

  const newRound = () => {
    tau.push(new Int32Array(n).fill(INF)); tauRide.push(new Int32Array(n).fill(INF));
    rideLab.push(new Array(n)); walkLab.push(new Int32Array(n).fill(-1));
  };
  newRound();
  let marked = new Set<number>();
  for (const s of q.sources) {
    const t = q.departSec + s.sec;
    if (t < tau[0][s.stop]) { tau[0][s.stop] = t; best[s.stop] = t; accessTag[s.stop] = s.tag; marked.add(s.stop); }
  }
  const updateTarget = (k: number, s: number) => {
    const e = targetEgress.get(s);
    if (e && tau[k][s] + e.sec < bestTarget) bestTarget = tau[k][s] + e.sec;
  };
  for (const s of marked) updateTarget(0, s);

  const journeys: RaptorJourney[] = [];
  for (let k = 1; k <= K && marked.size; k++) {
    newRound();
    // Collect patterns to scan, starting from the earliest marked position in each.
    const queue = new Map<number, number>();
    for (const s of marked) for (const { pattern, pos } of net.stopPatterns[s]) {
      const cur = queue.get(pattern);
      if (cur === undefined || pos < cur) queue.set(pattern, pos);
    }
    const nowMarked = new Set<number>();
    for (const [pi, pos0] of queue) {
      scanned++;
      const p = net.patterns[pi];
      let trip = -1, boardPos = -1;
      for (let i = pos0; i < p.stops.length; i++) {
        const s = p.stops[i];
        if (trip >= 0) {
          const a = arrAt(net, pi, trip, i);
          if (a < best[s] && a < bestTarget) {
            tau[k][s] = a; tauRide[k][s] = a; best[s] = a;
            rideLab[k][s] = { p: pi, t: trip, b: boardPos, a: i };
            nowMarked.add(s);
          }
        }
        // Can we catch an earlier trip here? (needs to have arrived in the previous round)
        const prev = tau[k - 1][s];
        if (prev === INF) continue;
        const ready = prev + (k > 1 ? net.chg[s] : 0);
        if (trip >= 0 && depAt(net, pi, trip, i) <= ready) continue;
        const t = earliestTrip(net, pi, i, ready, q.dayBit, trip);
        if (t >= 0 && (trip < 0 || t !== trip)) { trip = t; boardPos = i; }
      }
    }
    // Footpaths: one walk after each ride (no chained walks), starting from the RIDE arrival.
    for (const s of [...nowMarked]) {
      for (const f of net.footpaths[s]) {
        const a = tauRide[k][s] + f.sec;
        if (a < best[f.to] && a < bestTarget) {
          tau[k][f.to] = a; best[f.to] = a; walkLab[k][f.to] = s;
          nowMarked.add(f.to);
        }
      }
    }
    for (const s of nowMarked) updateTarget(k, s);
    marked = nowMarked;

    // Best journey that uses exactly k rides (if it improves on fewer rides).
    let bestK: { stop: number; arr: number } | null = null;
    for (const [s, e] of targetEgress) {
      if (tau[k][s] === INF) continue;
      const arr = tau[k][s] + e.sec;
      if (!bestK || arr < bestK.arr) bestK = { stop: s, arr };
    }
    if (bestK && (!journeys.length || bestK.arr < journeys[journeys.length - 1].arrival)) {
      journeys.push({ rides: k, arrival: bestK.arr, target: targetEgress.get(bestK.stop)!, steps: reconstruct(k, bestK.stop) });
    }
  }
  return { journeys, scannedPatterns: scanned };

  function reconstruct(k: number, stop: number): Step[] {
    const steps: Step[] = [];
    let s = stop;
    for (let round = k; round > 0; round--) {
      const w = walkLab[round][s];
      if (w >= 0 && tau[round][s] < tauRide[round][s]) {
        steps.push({ kind: 'walk', from: w, to: s, sec: tau[round][s] - tauRide[round][w] });
        s = w;
      }
      const r = rideLab[round][s];
      if (!r) break;
      steps.push({ kind: 'ride', pattern: r.p, trip: r.t, boardPos: r.b, alightPos: r.a });
      s = net.patterns[r.p].stops[r.b];
    }
    steps.push({ kind: 'access', stop: s, tag: accessTag[s] });
    return steps.reverse();
  }
}

/**
 * Earliest trip of pattern pi departing position `pos` at or after `ready` that runs on `dayBit`.
 * Trips are FIFO within a pattern (the pipeline guarantees it), so departure times at any position are
 * sorted by trip index and binary search applies. Only trips before `upTo` can improve on the current one.
 */
export function earliestTrip(net: Network, pi: number, pos: number, ready: number, dayBit: number, upTo = -1): number {
  const p = net.patterns[pi];
  let lo = 0, hi = (upTo >= 0 ? upTo : p.start.length) - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (depAt(net, pi, mid, pos) >= ready) { ans = mid; hi = mid - 1; } else lo = mid + 1;
  }
  if (ans < 0) return -1;
  const end = upTo >= 0 ? upTo : p.start.length;
  for (let t = ans; t < end; t++) if (p.days[t] & dayBit) return t;
  return -1;
}
