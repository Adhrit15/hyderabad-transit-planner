// Fare and road-time models. Every estimate here comes from pipeline/manual/*.json, so it can be
// corrected by editing data, not code.
import type { Fares, Slab, Traffic } from './network';

export function slabFare(slabs: Slab[], km: number) {
  if (km <= 1e-9) return 0;
  for (const s of slabs) if (s.maxKm === null || km <= s.maxKm + 1e-9) return s.fare;
  return slabs[slabs.length - 1].fare;
}

const hourOf = (sec: number) => Math.floor((((sec % 86400) + 86400) % 86400) / 3600);
const inNight = (h: number, [from, to]: [number, number]) => (from > to ? h >= from || h < to : h >= from && h < to);

/** Road distance and drive time between two points at a given time of day. */
export function roadEstimate(straightKm: number, departSec: number, traffic: Traffic) {
  const km = straightKm * traffic.roadCircuity;
  const kmph = traffic.carKmph[hourOf(departSec)];
  return { km, sec: Math.round((km / kmph) * 3600) };
}

/** Government meter fare, plus the range drivers typically quote. */
export function autoFare(km: number, departSec: number, f: Fares['auto']) {
  let meter = f.baseFare + Math.max(0, km - f.baseKm) * f.perKm;
  if (inNight(hourOf(departSec), f.nightHours)) meter *= f.nightMultiplier;
  meter = Math.round(meter);
  return { meter, min: meter, max: Math.round(meter * f.quotedAboveMeter[1]) };
}

/** App-cab estimate as a range: the surge band for that hour. */
export function cabFare(km: number, sec: number, departSec: number, f: Fares['cab']) {
  const base = Math.max(f.minFare, f.baseFare + km * f.perKm + (sec / 60) * f.perMin);
  const h = hourOf(departSec);
  const band = f.surge.find((s) => h >= s.hours[0] && h <= s.hours[1])?.range ?? [1, 1.3];
  return { min: Math.round(base * band[0] / 5) * 5, max: Math.round(base * band[1] / 5) * 5 };
}
