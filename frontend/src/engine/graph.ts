// (station, line) graph built from the same JSON the Java backend uses.
import stationsJson from '../../../backend/src/main/resources/data/stations.json';
import edgesJson from '../../../backend/src/main/resources/data/edges.json';
import faresJson from '../../../backend/src/main/resources/data/fares.json';

export interface Station {
  id: string; name: string; lat: number; lng: number; approximate: boolean;
  lines: string[]; order: Record<string, number>;
}
export interface Node { index: number; station: Station; line: string }
export interface Edge { from: number; to: number; minutes: number; km: number; transfer: boolean }
export interface Line { id: string; name: string; color: string }

export class Graph {
  nodes: Node[] = [];
  adj: Edge[][] = [];
  stations = new Map<string, Station>();
  nodesByStation = new Map<string, Node[]>();
  lines = new Map<string, Line>();
  transferMinutes: number;
  maxSpeedKmph: number;

  constructor(transferMinutes: number, maxSpeedKmph: number) {
    this.transferMinutes = transferMinutes;
    this.maxSpeedKmph = maxSpeedKmph;
  }

  station(id: string): Station {
    const s = this.stations.get(id);
    if (!s) throw new UnknownStationError(id);
    return s;
  }

  nodesOf(id: string): Node[] { this.station(id); return this.nodesByStation.get(id)!; }
}

export class UnknownStationError extends Error {
  constructor(id: string) { super(`Unknown station: ${id}`); }
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export interface Slab { maxKm: number; fare: number }

export class FareCalculator {
  slabs: Slab[];
  constructor(slabs: Slab[]) { this.slabs = [...slabs].sort((a, b) => a.maxKm - b.maxKm); }
  private slabFor(km: number) { return this.slabs.find((s) => km <= s.maxKm + 1e-9) ?? this.slabs[this.slabs.length - 1]; }
  fareFor(km: number) { return km <= 1e-9 ? 0 : this.slabFor(km).fare; }
  slabUpperBoundKm(km: number) { return this.slabFor(km).maxKm; }
}

export function loadMetro(transferOverride?: number) {
  const g = new Graph(transferOverride ?? stationsJson.transferMinutes, stationsJson.maxTrainSpeedKmph);
  for (const l of stationsJson.lines) g.lines.set(l.id, { id: l.id, name: l.name, color: l.color });
  for (const s of stationsJson.stations) {
    const order: Record<string, number> = {};
    for (const lo of s.lines) order[lo.line] = lo.order;
    g.stations.set(s.id, { id: s.id, name: s.name, lat: s.lat, lng: s.lng, approximate: s.approximate, lines: s.lines.map((x) => x.line), order });
  }
  // One node per (station, line)
  const idx = new Map<string, number>();
  for (const s of g.stations.values()) {
    for (const line of s.lines) {
      const n: Node = { index: g.nodes.length, station: s, line };
      idx.set(`${s.id}|${line}`, n.index);
      g.nodes.push(n); g.adj.push([]);
      if (!g.nodesByStation.has(s.id)) g.nodesByStation.set(s.id, []);
      g.nodesByStation.get(s.id)!.push(n);
    }
  }
  for (const e of edgesJson.edges) {
    const u = idx.get(`${e.from}|${e.line}`)!, v = idx.get(`${e.to}|${e.line}`)!;
    g.adj[u].push({ from: u, to: v, minutes: e.minutes, km: e.km, transfer: false });
    g.adj[v].push({ from: v, to: u, minutes: e.minutes, km: e.km, transfer: false });
  }
  for (const group of g.nodesByStation.values()) {
    for (const x of group) for (const y of group) {
      if (x !== y) g.adj[x.index].push({ from: x.index, to: y.index, minutes: g.transferMinutes, km: 0, transfer: true });
    }
  }
  const fares = new FareCalculator(faresJson.slabs.map((s) => ({ maxKm: s.maxKm ?? Infinity, fare: s.fare })));
  return { graph: g, fares, lineMeta: stationsJson.lines };
}
