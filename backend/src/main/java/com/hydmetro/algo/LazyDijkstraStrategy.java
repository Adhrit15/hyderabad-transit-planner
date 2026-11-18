package com.hydmetro.algo;

import com.hydmetro.model.Edge;
import com.hydmetro.model.Graph;
import com.hydmetro.model.Node;
import com.hydmetro.model.Station;

import java.util.Arrays;
import java.util.List;
import java.util.PriorityQueue;

/**
 * Dijkstra written with java.util.PriorityQueue and LAZY DELETION. PriorityQueue cannot decrease
 * a key, so we push a fresh (dist, node) entry on every improvement and skip stale entries on poll.
 * The heap may hold up to E entries, so a search is O(E log E). Used as a baseline in the
 * benchmark and tests. The API does not expose it.
 */
public final class LazyDijkstraStrategy implements RouteStrategy {
    @Override public String id() { return "fastest-lazy"; }
    @Override public String displayName() { return "Dijkstra (PriorityQueue, lazy deletion)"; }

    @Override
    public SearchResult search(Graph g, String fromId, String toId, SearchOptions opt) {
        List<Node> sources = g.nodesOf(fromId);
        Station target = g.station(toId);
        TraceEvent.Recorder rec = new TraceEvent.Recorder(opt.trace());
        int n = g.nodeCount();
        double[] dist = new double[n];
        int[] parent = new int[n];
        Arrays.fill(dist, Double.POSITIVE_INFINITY);
        Arrays.fill(parent, -1);
        PriorityQueue<double[]> pq = new PriorityQueue<>((a, b) -> Double.compare(a[0], b[0]));
        for (Node s : sources) { dist[s.index()] = 0; pq.add(new double[]{0, s.index()}); }
        int expanded = 0;
        while (!pq.isEmpty()) {
            double[] top = pq.poll();
            int u = (int) top[1];
            if (top[0] > dist[u]) continue;            // stale entry: a shorter one was already processed
            expanded++;
            rec.settle(u, parent[u], dist[u], pq.size());
            if (g.node(u).station().equals(target)) {
                return new SearchResult(List.of(Path.of(g, Path.unwind(parent, u))), expanded, rec.events());
            }
            for (Edge e : g.edgesFrom(u)) {
                double nd = dist[u] + e.minutes();
                if (nd < dist[e.to()]) {
                    dist[e.to()] = nd;
                    parent[e.to()] = u;
                    pq.add(new double[]{nd, e.to()});
                    rec.relax(e.to(), u, nd, pq.size());
                }
            }
        }
        return SearchResult.notFound(expanded, rec);
    }
}
