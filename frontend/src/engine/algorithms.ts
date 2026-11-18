// TypeScript port of backend/src/main/java/com/hydmetro/algo/*. Same algorithms, same results.
import { BinaryMinHeap } from './heap';
import { FareCalculator, Graph, haversineKm, type Node } from './graph';

export interface TraceEvent { kind: 'settle' | 'relax'; node: number; from: number; cost: number; frontier: number }
export interface Path { nodes: number[]; minutes: number; km: number; transfers: number }
export interface SearchResult { paths: Path[]; nodesExpanded: number; trace: TraceEvent[] }

class Recorder {
  events: TraceEvent[] = [];
  private on: boolean;
  constructor(on: boolean) { this.on = on; }
  settle(node: number, from: number, cost: number, frontier: number) { if (this.on) this.events.push({ kind: 'settle', node, from, cost, frontier }); }
  relax(node: number, from: number, cost: number, frontier: number) { if (this.on) this.events.push({ kind: 'relax', node, from, cost, frontier }); }
}

export function pathOf(g: Graph, nodes: number[]): Path {
  let minutes = 0, km = 0, transfers = 0;
  for (let i = 0; i + 1 < nodes.length; i++) {
    const e = g.adj[nodes[i]].filter((x) => x.to === nodes[i + 1]).sort((a, b) => a.minutes - b.minutes)[0];
    minutes += e.minutes; km += e.km; if (e.transfer) transfers++;
  }
  return { nodes, minutes, km, transfers };
}

function unwind(parent: Int32Array, end: number) {
  const out: number[] = [];
  for (let v = end; v !== -1; v = parent[v]) out.push(v);
  return out.reverse();
}

/** Dijkstra (h = 0) and A* (h = haversine / max speed). See BestFirstSearch.java. */
export function bestFirst(g: Graph, from: string, to: string, trace: boolean, useHeuristic: boolean): SearchResult {
  const sources = g.nodesOf(from), target = g.station(to);
  const h = (n: Node) => (useHeuristic ? (haversineKm(n.station, target) / g.maxSpeedKmph) * 60 : 0);
  const rec = new Recorder(trace);
  const N = g.nodes.length;
  const dist = new Float64Array(N).fill(Infinity), parent = new Int32Array(N).fill(-1);
  const settled = new Uint8Array(N);
  const heap = new BinaryMinHeap(N);
  for (const s of sources) { dist[s.index] = 0; heap.insertOrDecrease(s.index, h(s)); rec.relax(s.index, -1, 0, heap.size); }
  let expanded = 0;
  while (!heap.isEmpty()) {
    const u = heap.extractMin();
    settled[u] = 1; expanded++;
    rec.settle(u, parent[u], dist[u], heap.size);
    if (g.nodes[u].station === target) return { paths: [pathOf(g, unwind(parent, u))], nodesExpanded: expanded, trace: rec.events };
    for (const e of g.adj[u]) {
      if (settled[e.to]) continue;
      const nd = dist[u] + e.minutes;
      if (nd < dist[e.to]) {
        dist[e.to] = nd; parent[e.to] = u;
        heap.insertOrDecrease(e.to, nd + h(g.nodes[e.to]));
        rec.relax(e.to, u, nd, heap.size);
      }
    }
  }
  return { paths: [], nodesExpanded: expanded, trace: rec.events };
}

/** 0-1 BFS over (transfers, minutes). See ZeroOneBfsStrategy.java. */
export function zeroOneBfs(g: Graph, from: string, to: string, trace: boolean): SearchResult {
  const sources = g.nodesOf(from), target = g.station(to);
  const rec = new Recorder(trace);
  const N = g.nodes.length;
  const tr = new Float64Array(N).fill(Infinity), mins = new Float64Array(N).fill(Infinity), parent = new Int32Array(N).fill(-1);
  const deque: number[] = [];
  for (const s of sources) { tr[s.index] = 0; mins[s.index] = 0; deque.unshift(s.index); rec.relax(s.index, -1, 0, deque.length); }
  let expanded = 0;
  while (deque.length) {
    const u = deque.shift()!;
    expanded++;
    rec.settle(u, parent[u], tr[u], deque.length);
    for (const e of g.adj[u]) {
      const w = e.transfer ? 1 : 0, nt = tr[u] + w, nm = mins[u] + e.minutes;
      if (nt < tr[e.to] || (nt === tr[e.to] && nm < mins[e.to] - 1e-9)) {
        tr[e.to] = nt; mins[e.to] = nm; parent[e.to] = u;
        if (w === 0) deque.unshift(e.to); else deque.push(e.to);
        rec.relax(e.to, u, nt, deque.length);
      }
    }
  }
  let best = -1;
  for (const t of g.nodesOf(target.id)) {
    const i = t.index;
    if (tr[i] === Infinity) continue;
    if (best === -1 || tr[i] < tr[best] || (tr[i] === tr[best] && mins[i] < mins[best] - 1e-9)) best = i;
  }
  return { paths: best === -1 ? [] : [pathOf(g, unwind(parent, best))], nodesExpanded: expanded, trace: rec.events };
}

interface Label { node: number; time: number; sec: number; parent: Label | null; dead: boolean }

/** Bi-criteria label-setting. See BiCriteriaLabelSetting.java. */
function labelSetting(g: Graph, sources: Node[], targetId: string, secondary: (e: Graph['adj'][number][number]) => number,
  cap: number, stopAtFirst: boolean, rec: Recorder) {
  const EPS = 1e-9;
  const at: Label[][] = g.nodes.map(() => []);
  const pq: Label[] = []; // binary heap ordered by (time, sec)
  const less = (a: Label, b: Label) => a.time < b.time || (a.time === b.time && a.sec < b.sec);
  const push = (l: Label) => {
    pq.push(l);
    let i = pq.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!less(pq[i], pq[p])) break; [pq[i], pq[p]] = [pq[p], pq[i]]; i = p; }
  };
  const pop = (): Label => {
    const top = pq[0], last = pq.pop()!;
    if (pq.length) {
      pq[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let s = i;
        if (l < pq.length && less(pq[l], pq[s])) s = l;
        if (r < pq.length && less(pq[r], pq[s])) s = r;
        if (s === i) break; [pq[i], pq[s]] = [pq[s], pq[i]]; i = s;
      }
    }
    return top;
  };
  for (const s of sources) { const l: Label = { node: s.index, time: 0, sec: 0, parent: null, dead: false }; at[s.index].push(l); push(l); rec.relax(s.index, -1, 0, pq.length); }
  const front: Label[] = [];
  let bestSec = Infinity, expanded = 0;
  while (pq.length) {
    const cur = pop();
    if (cur.dead) continue;
    expanded++;
    rec.settle(cur.node, cur.parent ? cur.parent.node : -1, cur.time, pq.length);
    if (g.nodes[cur.node].station.id === targetId) {
      if (cur.sec < bestSec - EPS) { front.push(cur); bestSec = cur.sec; if (stopAtFirst) break; }
      continue;
    }
    for (const e of g.adj[cur.node]) {
      const nt = cur.time + e.minutes, ns = cur.sec + secondary(e);
      if (ns > cap + EPS || ns >= bestSec - EPS) continue;
      const here = at[e.to];
      if (here.some((o) => !o.dead && o.time <= nt + EPS && o.sec <= ns + EPS)) continue;
      for (let k = here.length - 1; k >= 0; k--) {
        const o = here[k];
        if (nt <= o.time + EPS && ns <= o.sec + EPS) { o.dead = true; here.splice(k, 1); }
      }
      const nl: Label = { node: e.to, time: nt, sec: ns, parent: cur, dead: false };
      here.push(nl); push(nl); rec.relax(e.to, cur.node, nt, pq.length);
    }
  }
  const nodesOfLabel = (l: Label) => { const out: number[] = []; for (let x: Label | null = l; x; x = x.parent) out.push(x.node); return out.reverse(); };
  return { front: front.map(nodesOfLabel), expanded };
}

/** Lowest fare, ties by time. See CheapestStrategy.java. */
export function cheapest(g: Graph, fares: FareCalculator, from: string, to: string, trace: boolean): SearchResult {
  const sources = g.nodesOf(from), target = g.station(to);
  const rec = new Recorder(trace);
  const N = g.nodes.length;
  const km = new Float64Array(N).fill(Infinity);
  const heap = new BinaryMinHeap(N);
  for (const s of sources) { km[s.index] = 0; heap.insertOrDecrease(s.index, 0); }
  let minKm = Infinity, expanded = 0;
  while (!heap.isEmpty()) {
    const u = heap.extractMin(); expanded++;
    if (g.nodes[u].station === target) { minKm = km[u]; break; }
    for (const e of g.adj[u]) { const nd = km[u] + e.km; if (nd < km[e.to]) { km[e.to] = nd; heap.insertOrDecrease(e.to, nd); } }
  }
  if (minKm === Infinity) return { paths: [], nodesExpanded: expanded, trace: rec.events };
  const r = labelSetting(g, sources, target.id, (e) => e.km, fares.slabUpperBoundKm(minKm), true, rec);
  return { paths: r.front.map((n) => pathOf(g, n)), nodesExpanded: expanded + r.expanded, trace: rec.events };
}

/** Pareto front over (minutes, transfers). See ParetoStrategy.java. */
export function pareto(g: Graph, from: string, to: string, trace: boolean): SearchResult {
  const sources = g.nodesOf(from), target = g.station(to);
  const rec = new Recorder(trace);
  const r = labelSetting(g, sources, target.id, (e) => (e.transfer ? 1 : 0), Infinity, false, rec);
  return { paths: r.front.map((n) => pathOf(g, n)), nodesExpanded: r.expanded, trace: rec.events };
}
