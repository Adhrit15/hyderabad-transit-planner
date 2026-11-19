export function haversineKm(lat1, lon1, lat2, lon2) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** GTFS time "HH:MM:SS" (HH may exceed 23) → seconds after midnight of the service day. */
export function timeToSec(t) {
  if (!t) return NaN;
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

/** "YYYYMMDD" → Date at UTC midnight. */
export function parseYmd(s) {
  return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
}

export const HYDERABAD_REGION = { minLat: 16.0, maxLat: 18.8, minLon: 77.3, maxLon: 80.1 };
