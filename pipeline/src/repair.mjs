// Re-times trips whose published times are physically implausible.
// Example from the real TGSRTC feed: route 217C, where gaps between consecutive stops grow 1, 4, 7, 11 … 77 min,
// producing a "28-hour" city bus trip. We keep the first departure (the most reliable published number) and
// rebuild the rest from distance ÷ typical bus speed for that hour + a dwell per stop.
//
// IMPORTANT: retimeOffsets() is mirrored line-for-line in frontend/src/planner/timing.ts. The bundle does
// not store times for re-timed trips; the browser recomputes them. A parity test keeps both in sync.

/** Bus speed (km/h) at a given second-of-day, from the traffic profile. */
export function busKmphAt(sec, traffic) {
  const hour = Math.floor((((sec % 86400) + 86400) % 86400) / 3600);
  return traffic.carKmph[hour] * traffic.busKmphFactor;
}

/**
 * @param {number[]} kmC   cumulative distance in centi-km (integers, exactly as stored in the bundle)
 * @param {number} dep0    first departure, seconds after midnight
 * @returns {number[]}     [arr0, dep0, arr1, dep1, …] as offsets from dep0
 */
export function retimeOffsets(kmC, dep0, traffic) {
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

export const centiKm = (km) => km.map((k) => Math.round(k * 100));

export function averageKmph(trip) {
  const hours = (trip.arr[trip.arr.length - 1] - trip.dep[0]) / 3600;
  return hours > 0 ? trip.km[trip.km.length - 1] / hours : Infinity;
}

export function retimeTrip(trip, traffic) {
  const off = retimeOffsets(centiKm(trip.km), trip.dep[0], traffic);
  const d0 = trip.dep[0];
  trip.arr = trip.stopIds.map((_, i) => d0 + off[2 * i]);
  trip.dep = trip.stopIds.map((_, i) => d0 + off[2 * i + 1]);
  trip.flags.retimed = true;
}

/** Applies the source's repair policy. Returns how many trips were re-timed and why. */
export function repairFeed(feed, source, traffic) {
  const policy = source.repair;
  if (!policy?.retimeOutsideKmph) return { retimed: 0 };
  const [lo, hi] = policy.retimeOutsideKmph;
  let slow = 0, fast = 0, overnight = 0;
  for (const t of feed.trips) {
    const v = averageKmph(t);
    const tooLong = t.arr[t.arr.length - 1] > 48 * 3600;
    if (v < lo || v > hi || tooLong) {
      if (tooLong) overnight++; else if (v < lo) slow++; else fast++;
      retimeTrip(t, traffic);
    }
  }
  return { retimed: slow + fast + overnight, tooSlow: slow, tooFast: fast, beyond48h: overnight, of: feed.trips.length };
}
