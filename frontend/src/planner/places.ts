// Place search: every stop/station name from the network (grouped by name), plus an explicit
// address lookup through OpenStreetMap Nominatim. Nominatim is called only when the user presses
// "Search address", because its usage policy forbids search-as-you-type.
import { haversineKm } from '../engine/graph';
import type { Network } from './network';
import type { Point } from './plan';

export interface Place extends Point { kind: 'metro' | 'mmts' | 'bus' | 'address' | 'location' | 'map'; detail?: string }

/**
 * One place per cluster of same-named stops within ~400 m (e.g. both sides of a road). Stops that share a
 * name but are far apart stay separate. A cluster containing a station sits on the station.
 */
export function buildPlaceIndex(net: Network): Place[] {
  const byName = new Map<string, number[]>();
  for (let i = 0; i < net.n; i++) {
    const key = net.stopName[i].trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(i);
  }
  const out: Place[] = [];
  for (const ids of byName.values()) {
    // stations first so they anchor their cluster
    ids.sort((a, b) => (net.mode[b] & 6) - (net.mode[a] & 6));
    const clusters: { anchor: number; mode: number; n: number }[] = [];
    for (const i of ids) {
      const c = clusters.find((c) => haversineKm({ lat: net.lat[c.anchor], lng: net.lon[c.anchor] }, { lat: net.lat[i], lng: net.lon[i] }) < 0.4);
      if (c) { c.mode |= net.mode[i]; c.n++; } else clusters.push({ anchor: i, mode: net.mode[i], n: 1 });
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
  return out;
}

export function searchPlaces(index: Place[], q: string, limit = 12): Place[] {
  const s = q.trim().toLowerCase();
  if (!s) return index.filter((p) => p.kind !== 'bus').sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  const rank = (p: Place) => {
    const n = p.name.toLowerCase();
    const base = n === s ? 0 : n.startsWith(s) ? 1 : n.split(/[\s-]+/).some((w) => w.startsWith(s)) ? 2 : n.includes(s) ? 3 : 9;
    return base * 10 + (p.kind === 'metro' ? 0 : p.kind === 'mmts' ? 1 : 2);
  };
  return index.map((p) => ({ p, r: rank(p) })).filter((x) => x.r < 90).sort((a, b) => a.r - b.r || a.p.name.length - b.p.name.length)
    .slice(0, limit).map((x) => x.p);
}

export async function geocode(q: string): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q, format: 'jsonv2', limit: '6', viewbox: '78.15,17.70,78.75,17.15', bounded: '1', countrycodes: 'in',
  })}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Address search failed (HTTP ${res.status})`);
  const rows: { display_name: string; lat: string; lon: string; name?: string }[] = await res.json();
  return rows.map((r) => ({ name: r.name || r.display_name.split(',')[0], detail: r.display_name.split(',').slice(1, 3).join(',').trim(), lat: +r.lat, lon: +r.lon, kind: 'address' }));
}
