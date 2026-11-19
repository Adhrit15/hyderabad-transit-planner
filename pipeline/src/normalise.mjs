// GTFS tables → canonical feed: platform stops collapsed to stations, trips with ordered stop ids,
// arrival/departure seconds, cumulative km and a weekday mask. Nothing is dropped here except
// structurally impossible rows; quality decisions happen in validate.mjs and repair.mjs.
import { haversineKm, parseYmd, timeToSec } from './geo.mjs';

const MODE_BY_ROUTE_TYPE = { 0: 'metro', 1: 'metro', 2: 'mmts', 3: 'bus' };
const CIRCUITY = { bus: 1.3, metro: 1.1, mmts: 1.15 };
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/**
 * @param {object} g     tables from gtfs.mjs
 * @param {object} source registry entry
 * @param {object[]} patches manual/patches.json entries for this source
 * @param {Date} today
 */
export function normaliseGtfs(g, source, patches = [], today = new Date()) {
  const log = { applied: [], obsolete: [] };

  // --- calendar → weekday mask, with reviewed patches ------------------------------------
  const services = new Map();
  for (const c of g.calendar) {
    services.set(c.service_id, { days: DAY_KEYS.map((k) => +c[k] || 0), start: c.start_date, end: c.end_date });
  }
  for (const p of patches.filter((x) => x.type === 'calendar-days')) {
    const s = services.get(p.serviceId);
    if (s && JSON.stringify(s.days) === JSON.stringify(p.when.days)) { s.days = [...p.set.days]; log.applied.push(p.id); }
    else log.obsolete.push(p.id);
  }

  // --- stops: map platforms (location_type 0 with parent) onto their parent station ------
  const raw = new Map(g.stops.map((s) => [s.stop_id, s]));
  const stationOf = (id) => {
    const s = raw.get(id);
    return s && s.parent_station && raw.has(s.parent_station) ? s.parent_station : id;
  };
  const stops = new Map();
  for (const s of g.stops) {
    const id = stationOf(s.stop_id);
    if (stops.has(id)) continue;
    const st = raw.get(id);
    const lat = +st.stop_lat, lon = +st.stop_lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    stops.set(id, { id, name: titleCase(st.stop_name), lat, lon });
  }

  const routes = new Map(g.routes.map((r) => [r.route_id, {
    id: r.route_id,
    short: r.route_short_name || r.route_long_name || r.route_id,
    long: r.route_long_name || '',
    color: r.route_color ? `#${r.route_color}` : null,
    mode: MODE_BY_ROUTE_TYPE[+r.route_type] ?? 'bus',
  }]));

  // --- stop_times grouped by trip ---------------------------------------------------------
  const byTrip = new Map();
  for (const st of g.stop_times) {
    let a = byTrip.get(st.trip_id);
    if (!a) byTrip.set(st.trip_id, (a = []));
    a.push(st);
  }

  const trips = [];
  let droppedStructural = 0;
  for (const t of g.trips) {
    const route = routes.get(t.route_id);
    const svc = services.get(t.service_id);
    const sts = byTrip.get(t.trip_id);
    if (!route || !svc || !sts || sts.length < 2) { droppedStructural++; continue; }
    sts.sort((a, b) => +a.stop_sequence - +b.stop_sequence);
    const stopIds = [], arr = [], dep = [];
    let ok = true;
    for (const st of sts) {
      const sid = stationOf(st.stop_id);
      if (!stops.has(sid)) { ok = false; break; }
      if (stopIds.length && stopIds[stopIds.length - 1] === sid) continue; // consecutive duplicate stop
      const a = timeToSec(st.arrival_time || st.departure_time), d = timeToSec(st.departure_time || st.arrival_time);
      stopIds.push(sid); arr.push(a); dep.push(d);
    }
    if (!ok || stopIds.length < 2 || arr.some((x) => !Number.isFinite(x))) { droppedStructural++; continue; }

    const km = [0];
    const circ = CIRCUITY[route.mode] ?? 1.3;
    for (let i = 1; i < stopIds.length; i++) {
      const a = stops.get(stopIds[i - 1]), b = stops.get(stopIds[i]);
      km.push(km[i - 1] + haversineKm(a.lat, a.lon, b.lat, b.lon) * circ);
    }
    trips.push({
      id: t.trip_id, routeId: t.route_id, mode: route.mode,
      headsign: titleCase(t.trip_headsign || t.trip_short_name || route.long || ''),
      days: svc.days, stopIds, arr, dep, km, flags: { retimed: false, stale: false },
    });
  }

  const fi = g.feed_info[0] ?? {};
  const starts = g.calendar.map((c) => c.start_date).filter(Boolean).sort();
  const ends = g.calendar.map((c) => c.end_date).filter(Boolean).sort();
  const validFrom = fi.feed_start_date || starts[0] || null;
  const validTo = fi.feed_end_date || ends[ends.length - 1] || null;
  const active = !validTo || parseYmd(validTo) >= new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (!active) for (const t of trips) t.flags.stale = true;

  return {
    sourceId: source.id, stops, routes, trips,
    feed: { version: fi.feed_version || null, validFrom, validTo, active },
    fares: metroZoneFares(g),
    counts: { stops: stops.size, routes: routes.size, trips: trips.length, droppedStructural },
    patchLog: log,
  };
}

/** HMRL publishes fares as origin/destination zone pairs; we keep them so the merge step can compare against newer charts. */
function metroZoneFares(g) {
  if (!g.fare_attributes.length) return null;
  const price = new Map(g.fare_attributes.map((f) => [f.fare_id, +f.price]));
  const prices = [...price.values()];
  return { min: Math.min(...prices), max: Math.max(...prices), pairs: g.fare_rules.length };
}

function titleCase(s) {
  if (!s) return s;
  if (s !== s.toUpperCase()) return s.trim();
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).trim();
}
