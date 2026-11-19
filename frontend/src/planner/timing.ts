// Trip times. Mirrors pipeline/src/repair.mjs retimeOffsets() exactly (a parity test enforces this),
// so that re-timed trips can be shipped without per-stop times and rebuilt here identically.
import type { Network, Traffic } from './network';

export function busKmphAt(sec: number, traffic: Traffic) {
  const hour = Math.floor((((sec % 86400) + 86400) % 86400) / 3600);
  return traffic.carKmph[hour] * traffic.busKmphFactor;
}

export function retimeOffsets(kmC: ArrayLike<number>, dep0: number, traffic: Traffic): number[] {
  const out = [0, 0];
  let t = dep0;
  for (let i = 1; i < kmC.length; i++) {
    const segKm = (kmC[i] - kmC[i - 1]) / 100;
    const run = Math.max(30, Math.round((segKm / busKmphAt(t, traffic)) * 3600));
    const arr = t + run;
    const dep = i === kmC.length - 1 ? arr : arr + traffic.busDwellSec;
    out.push(arr - dep0, dep - dep0);
    t = dep;
  }
  return out;
}

const cache = new WeakMap<object, Map<number, ArrayLike<number>>>();

/** Offsets [arr0, dep0, arr1, dep1, …] relative to the trip's first departure. */
export function tripOffsets(net: Network, patternIdx: number, trip: number): ArrayLike<number> {
  const p = net.patterns[patternIdx];
  const prof = p.profile[trip];
  if (prof >= 0) return net.profiles[prof];
  let m = cache.get(p);
  if (!m) cache.set(p, (m = new Map()));
  let off = m.get(trip);
  if (!off) m.set(trip, (off = retimeOffsets(p.kmC, p.start[trip], net.traffic)));
  return off;
}

export const depAt = (net: Network, pi: number, trip: number, pos: number) => net.patterns[pi].start[trip] + tripOffsets(net, pi, trip)[2 * pos + 1];
export const arrAt = (net: Network, pi: number, trip: number, pos: number) => net.patterns[pi].start[trip] + tripOffsets(net, pi, trip)[2 * pos];
