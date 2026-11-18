package com.hydmetro.algo;

import com.hydmetro.heap.BinaryMinHeap;
import com.hydmetro.model.Edge;
import com.hydmetro.model.Graph;
import com.hydmetro.model.Node;
import com.hydmetro.model.Station;

import java.util.Arrays;
import java.util.List;

/**
 * Shared core of Dijkstra and A* (TEMPLATE METHOD pattern): the two algorithms are identical except
 * for the heap priority. Dijkstra orders the heap by g(v), the best known time from the start. A*
 * orders it by f(v) = g(v) + h(v), where h(v) is a lower bound on the remaining time.
 * With h ≡ 0, A* IS Dijkstra.
 */
abstract class BestFirstSearch implements RouteStrategy {

    /** Lower bound on the minutes from {@code n} to {@code target}. Must be admissible and consistent. */
    protected abstract double heuristic(Graph g, Node n, Station target);

    @Override
    public SearchResult search(Graph g, String fromId, String toId, SearchOptions opt) {
        List<Node> sources = g.nodesOf(fromId);   // validates both ids (404 if unknown)
        Station target = g.station(toId);
        TraceEvent.Recorder rec = new TraceEvent.Recorder(opt.trace());

        int n = g.nodeCount();
        double[] dist = new double[n];            // g(v): best known minutes from the start
        int[] parent = new int[n];
        boolean[] settled = new boolean[n];
        Arrays.fill(dist, Double.POSITIVE_INFINITY);
        Arrays.fill(parent, -1);
        BinaryMinHeap heap = new BinaryMinHeap(n);

        // Multi-source start: you may board any line at the origin station for free.
        for (Node s : sources) {
            dist[s.index()] = 0;
            heap.insert(s.index(), heuristic(g, s, target));
            rec.relax(s.index(), -1, 0, heap.size());
        }

        int expanded = 0;
        while (!heap.isEmpty()) {
            int u = heap.extractMin();
            settled[u] = true;
            expanded++;
            rec.settle(u, parent[u], dist[u], heap.size());

            // Stop as soon as ANY node of the target station is settled. Its dist is final.
            if (g.node(u).station().equals(target)) {
                return new SearchResult(List.of(Path.of(g, Path.unwind(parent, u))), expanded, rec.events());
            }
            for (Edge e : g.edgesFrom(u)) {           // RELAX each outgoing edge
                int v = e.to();
                if (settled[v]) continue;
                double nd = dist[u] + e.minutes();
                if (nd < dist[v]) {
                    dist[v] = nd;
                    parent[v] = u;
                    heap.insertOrDecrease(v, nd + heuristic(g, g.node(v), target));
                    rec.relax(v, u, nd, heap.size());
                }
            }
        }
        return SearchResult.notFound(expanded, rec);
    }
}
