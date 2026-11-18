// In-browser equivalent of RouteService.java. It produces identical JSON shapes.
import { bestFirst, cheapest, pareto, zeroOneBfs, type Path, type SearchResult } from './algorithms';
import { loadMetro, type Graph, type Station } from './graph';
import type { CompareResponse, LegDto, Mode, RouteResponse, StationRef, StationsResponse, TraceEventDto } from './types';
import { MODES } from './types';

const NAMES: Record<Mode, string> = {
  fastest: 'Dijkstra (fastest)', astar: 'A* (haversine heuristic)', 'fewest-transfers': '0-1 BFS (fewest transfers)',
  cheapest: 'Cheapest (fare slabs)', pareto: 'Pareto (time x transfers)',
};

const { graph: g, fares, lineMeta } = loadMetro();
const round = (x: number) => Math.round(x * 10) / 10;
const ref = (s: Station): StationRef => ({ id: s.id, name: s.name });

function run(mode: Mode, from: string, to: string, trace: boolean): SearchResult {
  switch (mode) {
    case 'fastest': return bestFirst(g, from, to, trace, false);
    case 'astar': return bestFirst(g, from, to, trace, true);
    case 'fewest-transfers': return zeroOneBfs(g, from, to, trace);
    case 'cheapest': return cheapest(g, fares, from, to, trace);
    case 'pareto': return pareto(g, from, to, trace);
  }
}

function terminals(line: string): [string, string] {
  const m = lineMeta.find((l) => l.id === line)!;
  return [m.from, m.to];
}

function towards(line: string, a: Station, b: Station) {
  const [first, last] = terminals(line);
  const oa = a.order[line], ob = b.order[line];
  return ob > oa ? last : oa > ob ? first : last;
}

export function legsOf(graph: Graph, p: Path): LegDto[] {
  const legs: LegDto[] = [];
  let i = 0;
  while (i < p.nodes.length) {
    const line = graph.nodes[p.nodes[i]].line;
    let j = i, min = 0, km = 0;
    while (j + 1 < p.nodes.length && graph.nodes[p.nodes[j + 1]].line === line
      && graph.nodes[p.nodes[j + 1]].station !== graph.nodes[p.nodes[j]].station) {
      const e = graph.adj[p.nodes[j]].find((x) => x.to === p.nodes[j + 1])!;
      min += e.minutes; km += e.km; j++;
    }
    if (j > i || p.nodes.length === 1) {
      const l = graph.lines.get(line)!;
      legs.push({
        line, lineName: l.name, color: l.color,
        towards: towards(line, graph.nodes[p.nodes[i]].station, graph.nodes[p.nodes[j]].station),
        stations: p.nodes.slice(i, j + 1).map((n) => ref(graph.nodes[n].station)), minutes: round(min), km: round(km),
      });
    }
    i = j + 1;
  }
  return legs;
}

function instructions(legs: LegDto[], from: StationRef, to: StationRef): string[] {
  if (from.id === to.id) return [`You are already at ${from.name}.`];
  const out: string[] = [];
  legs.forEach((leg, k) => {
    const stops = leg.stations.length - 1;
    out.push(k === 0
      ? `Board the ${leg.lineName} at ${leg.stations[0].name} towards ${leg.towards}.`
      : `Change at ${leg.stations[0].name} → ${leg.lineName} towards ${leg.towards} (≈${g.transferMinutes} min walk + wait).`);
    out.push(`Ride ${stops} stop${stops === 1 ? '' : 's'} (${leg.minutes} min).`);
  });
  out.push(`Alight at ${to.name}.`);
  return out;
}

function toResponse(mode: Mode, from: string, to: string, p: Path | undefined, expanded: number, micros: number): RouteResponse {
  const f = ref(g.station(from)), t = ref(g.station(to));
  const base = { mode, modeName: NAMES[mode], from: f, to: t, nodesExpanded: expanded, runtimeMicros: micros };
  if (!p) return { ...base, found: false, totalMinutes: 0, km: 0, transfers: 0, fare: 0, legs: [], instructions: [`No route found between ${f.name} and ${t.name}.`] };
  const legs = legsOf(g, p);
  return { ...base, found: true, totalMinutes: round(p.minutes), km: round(p.km), transfers: p.transfers, fare: fares.fareFor(p.km), legs, instructions: instructions(legs, f, t) };
}

export const localEngine = {
  stations(): StationsResponse {
    return {
      transferMinutes: g.transferMinutes,
      lines: lineMeta.map((l) => ({ id: l.id, name: l.name, color: l.color, from: l.from, to: l.to })),
      stations: [...g.stations.values()].map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, lines: s.lines, interchange: s.lines.length > 1, approximate: s.approximate, order: s.order })),
    };
  },

  route(from: string, to: string, mode: Mode, trace: boolean): RouteResponse {
    const t0 = performance.now();
    const r = run(mode, from, to, trace);
    const micros = Math.round((performance.now() - t0) * 1000);
    const res = toResponse(mode, from, to, r.paths[0], r.nodesExpanded, micros);
    if (r.paths.length > 1) res.alternatives = r.paths.map((p) => toResponse(mode, from, to, p, r.nodesExpanded, micros));
    if (trace) {
      res.trace = r.trace.map((e): TraceEventDto => {
        const n = g.nodes[e.node], fr = e.from < 0 ? null : g.nodes[e.from];
        return { type: e.kind, station: n.station.id, line: n.line, fromStation: fr?.station.id ?? null, fromLine: fr?.line ?? null, cost: round(e.cost), frontier: e.frontier };
      });
    }
    return res;
  },

  compare(from: string, to: string): CompareResponse {
    const results = MODES.map(({ id }) => {
      let best = Infinity, r!: SearchResult;
      for (let i = 0; i < 5; i++) { const t0 = performance.now(); r = run(id, from, to, false); best = Math.min(best, performance.now() - t0); }
      const p = r.paths[0];
      const names: string[] = [];
      for (const n of p?.nodes ?? []) { const nm = g.nodes[n].station.name; if (names[names.length - 1] !== nm) names.push(nm); }
      return {
        mode: id, modeName: NAMES[id], found: !!p, totalMinutes: p ? round(p.minutes) : 0, km: p ? round(p.km) : 0,
        transfers: p?.transfers ?? 0, fare: p ? fares.fareFor(p.km) : 0, nodesExpanded: r.nodesExpanded,
        runtimeMicros: Math.round(best * 1000), path: names,
      };
    });
    return { from: ref(g.station(from)), to: ref(g.station(to)), results };
  },
};
