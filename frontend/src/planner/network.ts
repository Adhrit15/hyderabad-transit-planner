// Loads and decodes the bundle written by pipeline/src/bundle.mjs into fast, typed structures.
import { haversineKm } from '../engine/graph';

export type Mode = 'bus' | 'metro' | 'mmts';
export const MODE_BIT: Record<Mode, number> = { bus: 1, metro: 2, mmts: 4 };

export interface Slab { maxKm: number | null; fare: number }
export interface Fares {
  metro: { slabs: Slab[]; effectiveFrom: string; approximate: boolean; note: string };
  bus: { slabs: Slab[]; effectiveFrom: string; approximate: boolean; note: string };
  mmts: { slabs: Slab[]; effectiveFrom: string; approximate: boolean; note: string };
  auto: { baseFare: number; baseKm: number; perKm: number; nightMultiplier: number; nightHours: [number, number]; quotedAboveMeter: [number, number]; note: string };
  cab: { baseFare: number; perKm: number; perMin: number; minFare: number; surge: { hours: [number, number]; range: [number, number] }[]; note: string };
  shareAuto: { slabs: Slab[]; note: string };
}
export interface Traffic { roadCircuity: number; carKmph: number[]; busKmphFactor: number; busDwellSec: number; walkKmph: number; walkCircuity: number }

export interface Pattern {
  route: number; headsign: string;
  stops: Int32Array;       // stop indices along the pattern
  kmC: Int32Array;         // cumulative centi-km
  start: Int32Array;       // first departure of each trip (sorted, FIFO)
  profile: Int32Array;     // profile index, or -1 = recompute with retimeOffsets
  days: Uint8Array;        // weekday bitmask, bit 0 = Monday
  flags: Uint8Array;       // 1 = stale timetable, 2 = times estimated
}

export interface Network {
  generatedAt: string;
  n: number;
  stopName: string[]; lat: Float64Array; lon: Float64Array; mode: Uint8Array; chg: Int32Array;
  routes: { n: string; l: string; m: Mode; c: string | null; src: string }[];
  patterns: Pattern[];
  profiles: Int32Array[];
  stopPatterns: { pattern: number; pos: number }[][];   // which patterns serve each stop
  footpaths: { to: number; sec: number }[][];           // walking links ≤ FOOTPATH_M
  grid: Map<string, number[]>;
  fares: Fares; traffic: Traffic;
  autoPoints: [number, number, string, string][];
  attribution: string[];
}

const dd = (a: number[]) => { const out = new Int32Array(a.length); let acc = 0; for (let i = 0; i < a.length; i++) { acc += a[i]; out[i] = acc; } return out; };
export const FOOTPATH_M = 500;
const CELL = 0.005; // ≈ 550 m grid cells
const cellKey = (lat: number, lon: number) => `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeNetwork(raw: any): Network {
  const n = raw.stops.name.length;
  const latI = dd(raw.stops.lat), lonI = dd(raw.stops.lon);
  const lat = new Float64Array(n), lon = new Float64Array(n);
  for (let i = 0; i < n; i++) { lat[i] = latI[i] / 1e5; lon[i] = lonI[i] / 1e5; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patterns: Pattern[] = raw.patterns.map((p: any) => ({
    route: p.r, headsign: p.h, stops: Int32Array.from(p.s), kmC: dd(p.k), start: dd(p.t),
    profile: Int32Array.from(p.p), days: Uint8Array.from(p.d), flags: Uint8Array.from(p.f),
  }));
  const stopPatterns: Network['stopPatterns'] = Array.from({ length: n }, () => []);
  patterns.forEach((p, pi) => p.stops.forEach((s, pos) => stopPatterns[s].push({ pattern: pi, pos })));

  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const k = cellKey(lat[i], lon[i]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(i);
  }
  const net: Network = {
    generatedAt: raw.generatedAt, n, stopName: raw.stops.name, lat, lon, mode: Uint8Array.from(raw.stops.mode),
    chg: Int32Array.from(raw.stops.chg), routes: raw.routes, patterns, profiles: raw.profiles.map(dd),
    stopPatterns, footpaths: [], grid, fares: raw.fares, traffic: raw.traffic, autoPoints: raw.autoPoints, attribution: raw.attribution,
  };
  net.footpaths = Array.from({ length: n }, (_, i) =>
    stopsNear(net, lat[i], lon[i], FOOTPATH_M / 1000).filter((x) => x.stop !== i).map((x) => ({ to: x.stop, sec: walkSec(net, x.km) })));
  return net;
}

export function walkSec(net: Pick<Network, 'traffic'>, straightKm: number) {
  return Math.round((straightKm * net.traffic.walkCircuity / net.traffic.walkKmph) * 3600);
}

/** Stops within radiusKm (straight line), nearest first. */
export function stopsNear(net: Pick<Network, 'grid' | 'lat' | 'lon'>, lat: number, lon: number, radiusKm: number) {
  const r = Math.ceil(radiusKm / 0.55);
  const cy = Math.floor(lat / CELL), cx = Math.floor(lon / CELL);
  const out: { stop: number; km: number }[] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    for (const s of net.grid.get(`${cy + dy}:${cx + dx}`) ?? []) {
      const km = haversineKm({ lat, lng: lon }, { lat: net.lat[s], lng: net.lon[s] });
      if (km <= radiusKm) out.push({ stop: s, km });
    }
  }
  return out.sort((a, b) => a.km - b.km);
}

export async function loadNetwork(base = './data/'): Promise<{ net: Network; status: DataStatus }> {
  const [raw, status] = await Promise.all([
    fetch(`${base}network.json`).then((r) => { if (!r.ok) throw new Error(`network.json: HTTP ${r.status}`); return r.json(); }),
    fetch(`${base}status.json`).then((r) => r.json()),
  ]);
  return { net: decodeNetwork(raw), status };
}

export interface DataStatus {
  generatedAt: string;
  sources: { id: string; name: string; kind: string; state: string; fetchedAt?: string; validFrom?: string; validTo?: string; active?: boolean;
    counts?: Record<string, number>; warnings?: string[]; effectiveFrom?: string; approximate?: boolean; note?: string; links?: string[];
    attribution?: string; homepage?: string; repairs?: { retimed: number; of: number } }[];
  decisions: { kind: string; winner: string; loser: string; reason: string; attribute?: string; mode?: string }[];
  changes: string[];
  network: { stops: number; routes: number; trips: number; bundleGzipBytes: number };
}
