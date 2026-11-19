// Quality gate. ERRORS reject the whole feed (the last-good snapshot is used instead).
// WARNINGS are published in status.json. Individually broken trips/stops are dropped and counted.
import { HYDERABAD_REGION } from './geo.mjs';

const inRegion = (s) => s.lat >= HYDERABAD_REGION.minLat && s.lat <= HYDERABAD_REGION.maxLat
  && s.lon >= HYDERABAD_REGION.minLon && s.lon <= HYDERABAD_REGION.maxLon;

/**
 * Mutates `feed` (drops bad stops/trips) and returns {errors, warnings, dropped}.
 * @param {{trips?: number}} previous counts from the last published run, to catch sudden shrinkage
 */
export function validateFeed(feed, previous = null) {
  const errors = [], warnings = [], dropped = { stopsOutsideRegion: 0, nonMonotonicTrips: 0, tripsOnDroppedStops: 0 };

  for (const [id, s] of feed.stops) if (!inRegion(s)) { feed.stops.delete(id); dropped.stopsOutsideRegion++; }

  const kept = [];
  for (const t of feed.trips) {
    if (t.stopIds.some((id) => !feed.stops.has(id))) { dropped.tripsOnDroppedStops++; continue; }
    let mono = true;
    for (let i = 0; i < t.arr.length; i++) {
      if (t.dep[i] < t.arr[i] || (i > 0 && t.arr[i] < t.dep[i - 1])) { mono = false; break; }
    }
    if (!mono) { dropped.nonMonotonicTrips++; continue; }
    kept.push(t);
  }
  feed.trips = kept;

  if (feed.stops.size === 0) errors.push('no usable stops');
  if (feed.trips.length === 0) errors.push('no usable trips');
  const total = feed.counts.trips;
  if (total > 0 && kept.length / total < 0.5) errors.push(`only ${kept.length}/${total} trips passed validation`);
  if (previous?.trips && kept.length < previous.trips * 0.6) {
    errors.push(`trip count fell from ${previous.trips} to ${kept.length} (>40% drop); refusing to publish without review`);
  }
  if (!feed.feed.active) warnings.push(`timetable expired on ${feed.feed.validTo}; using it as the last known schedule (marked stale)`);
  if (dropped.stopsOutsideRegion) warnings.push(`${dropped.stopsOutsideRegion} stops outside the Hyderabad region dropped`);
  if (dropped.nonMonotonicTrips) warnings.push(`${dropped.nonMonotonicTrips} trips with times going backwards dropped`);
  if (dropped.tripsOnDroppedStops) warnings.push(`${dropped.tripsOnDroppedStops} trips touching dropped stops removed`);
  return { errors, warnings, dropped };
}
