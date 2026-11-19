// Place search has three layers:
//   1. LOCAL, instant, works offline: every stop/station, plus ~8,500 named places from OpenStreetMap
//      (areas, malls, hospitals, colleges, offices, parks…) bundled by the pipeline as data/places.json.
//   2. LIVE suggestions while typing from Photon (photon.komoot.io), a free OpenStreetMap geocoder built
//      for autocomplete. No API key. Covers smaller places and street addresses.
//   3. On request: Nominatim (OpenStreetMap's main geocoder), for anything still not found. Its usage
//      policy forbids search-as-you-type, so it runs only when the user asks.
// Layers 2 and 3 need the network; in sandboxed hosts they fail quietly and layer 1 still works.
import { haversineKm } from '../engine/graph';
import type { Landmark, Network } from './network';
import type { Point } from './plan';

export type PlaceKind = 'metro' | 'mmts' | 'bus' | 'area' | 'landmark' | 'address' | 'location' | 'map';
export interface Place extends Point { kind: PlaceKind; detail?: string; icon?: string }

const LANDMARK_LABEL: Record<string, [string, string]> = {
  area: ['Area', '🏘'], hospital: ['Hospital', '🏥'], education: ['College / school', '🎓'], shopping: ['Mall / market', '🛍'],
  office: ['Office / IT park', '🏢'], leisure: ['Park / stadium', '🌳'], worship: ['Place of worship', '🛕'],
  transport: ['Station / airport', '🚉'], landmark: ['Landmark', '📍'], civic: ['Public office', '🏛'],
};

/**
 * One place per cluster of same-named stops within ~400 m (e.g. both sides of a road). Stops that share a
 * name but are far apart stay separate. A cluster containing a station sits on the station.
 */
export function buildPlaceIndex(net: Network, landmarks: Landmark[] = []): Place[] {
  const byName = new Map<string, number[]>();
  for (let i = 0; i < net.n; i++) {
    const key = net.stopName[i].trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(i);
  }
  const out: Place[] = [];
  for (const ids of byName.values()) {
    ids.sort((a, b) => (net.mode[b] & 6) - (net.mode[a] & 6)); // stations anchor their cluster
    const clusters: { anchor: number; mode: number }[] = [];
    for (const i of ids) {
      const c = clusters.find((c) => haversineKm({ lat: net.lat[c.anchor], lng: net.lon[c.anchor] }, { lat: net.lat[i], lng: net.lon[i] }) < 0.4);
      if (c) c.mode |= net.mode[i]; else clusters.push({ anchor: i, mode: net.mode[i] });
    }
    for (const c of clusters) {
      out.push({
        name: net.stopName[c.anchor].trim(), lat: net.lat[c.anchor], lon: net.lon[c.anchor],
        kind: c.mode & 2 ? 'metro' : c.mode & 4 ? 'mmts' : 'bus',
        detail: [c.mode & 2 && 'Metro', c.mode & 4 && 'MMTS', c.mode & 1 && 'Bus stop'].filter(Boolean).join(' · ')
          + (clusters.length > 1 ? ` · ${net.lat[c.anchor].toFixed(3)}, ${net.lon[c.anchor].toFixed(3)}` : ''),
      });
    }
  }
  for (const [name, lat, lon, k] of landmarks) {
    const [label, icon] = LANDMARK_LABEL[k] ?? LANDMARK_LABEL.landmark;
    out.push({ name, lat, lon, kind: k === 'area' ? 'area' : 'landmark', detail: label, icon });
  }
  return out;
}

const KIND_RANK: Record<PlaceKind, number> = { metro: 0, area: 1, mmts: 2, landmark: 3, bus: 4, address: 5, location: 6, map: 7 };
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Every word typed must appear in the name; whole-name and word-start matches rank first. */
export function searchPlaces(index: Place[], q: string, limit = 12): Place[] {
  const s = norm(q);
  if (!s) return index.filter((p) => p.kind === 'metro' || p.kind === 'mmts').sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  const words = s.split(' ');
  const scored: { p: Place; r: number }[] = [];
  for (const p of index) {
    const n = norm(p.name);
    if (!words.every((w) => n.includes(w))) continue;
    const nw = n.split(' ');
    const base = n === s ? 0 : n.startsWith(s) ? 1 : words.every((w) => nw.some((x) => x.startsWith(w))) ? 2 : 3;
    scored.push({ p, r: base * 10 + KIND_RANK[p.kind] });
  }
  return scored.sort((a, b) => a.r - b.r || a.p.name.length - b.p.name.length).slice(0, limit).map((x) => x.p);
}

const BBOX = { minLon: 78.15, minLat: 17.15, maxLon: 78.75, maxLat: 17.7 };

/** Live autocomplete (Photon). Debounce the caller; pass an AbortSignal to cancel stale requests. */
export async function photonSearch(q: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `https://photon.komoot.io/api/?${new URLSearchParams({
    q, limit: '7', lat: '17.40', lon: '78.47', bbox: `${BBOX.minLon},${BBOX.minLat},${BBOX.maxLon},${BBOX.maxLat}`,
  })}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
  const body: { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[] } = await res.json();
  return body.features.map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    const name = p.name || [p.housenumber, p.street].filter(Boolean).join(' ') || p.district || p.city || 'Unnamed place';
    const detail = [p.street !== name ? p.street : null, p.district ?? p.locality, p.city].filter(Boolean).join(', ');
    return { name, lat, lon, kind: 'address' as const, detail, icon: '🔎' };
  }).filter((p) => p.lat >= BBOX.minLat && p.lat <= BBOX.maxLat && p.lon >= BBOX.minLon && p.lon <= BBOX.maxLon);
}

/** Deeper one-off search (Nominatim). Only on an explicit user action. */
export async function geocode(q: string): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q, format: 'jsonv2', limit: '6', viewbox: `${BBOX.minLon},${BBOX.maxLat},${BBOX.maxLon},${BBOX.minLat}`, bounded: '1', countrycodes: 'in',
  })}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Address search failed (HTTP ${res.status})`);
  const rows: { display_name: string; lat: string; lon: string; name?: string }[] = await res.json();
  return rows.map((r) => ({ name: r.name || r.display_name.split(',')[0], detail: r.display_name.split(',').slice(1, 3).join(',').trim(), lat: +r.lat, lon: +r.lon, kind: 'address', icon: '📍' }));
}

/**
 * Drops live results that duplicate a local place (same name within 300 m), and collapses live results
 * that repeat each other (a road comes back once per mapped segment).
 */
export function mergeResults(local: Place[], live: Place[]): Place[] {
  const near = (a: Place, b: Place, km: number) => haversineKm({ lat: a.lat, lng: a.lon }, { lat: b.lat, lng: b.lon }) < km;
  const extra: Place[] = [];
  for (const l of live) {
    if (local.some((p) => norm(p.name) === norm(l.name) && near(p, l, 0.3))) continue;
    if (extra.some((p) => norm(p.name) === norm(l.name) && near(p, l, 1))) continue;
    extra.push(l);
  }
  return [...local, ...extra];
}
