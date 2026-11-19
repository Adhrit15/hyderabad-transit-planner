// Turns an Overpass response into a compact, searchable list of named places:
//   [name, lat, lon, kind]   kind ∈ area | hospital | education | shopping | office | leisure | worship | transport | landmark | civic
// Duplicates (same name within 300 m, e.g. a building and its campus) are merged.
import { haversineKm } from './geo.mjs';

export function placeKind(t) {
  if (t.place) return 'area';
  if (t.aeroway || t.railway || t.amenity === 'bus_station') return 'transport';
  if (t.amenity === 'hospital') return 'hospital';
  if (['university', 'college', 'school'].includes(t.amenity)) return 'education';
  if (t.amenity === 'place_of_worship') return 'worship';
  if (t.shop || t.amenity === 'marketplace' || t.amenity === 'cinema') return 'shopping';
  if (t.office || t.landuse === 'commercial') return 'office';
  if (t.leisure) return 'leisure';
  if (t.tourism || t.historic) return 'landmark';
  return 'civic';
}

const round5 = (x) => Math.round(x * 1e5) / 1e5;

export function extractPlaces(overpassJson) {
  const out = [];
  const byName = new Map();
  for (const e of overpassJson.elements ?? []) {
    const name = (e.tags?.['name:en'] || e.tags?.name || '').trim();
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (!name || name.length < 3 || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = name.toLowerCase();
    const same = byName.get(key) ?? [];
    if (same.some((p) => haversineKm(p[1], p[2], lat, lon) < 0.3)) continue;
    const row = [name, round5(lat), round5(lon), placeKind(e.tags)];
    same.push(row); byName.set(key, same); out.push(row);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}
