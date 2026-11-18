package com.hydmetro.algo;

import com.hydmetro.model.Edge;
import com.hydmetro.model.Graph;
import com.hydmetro.model.Node;
import com.hydmetro.model.Station;

import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Deque;
import java.util.List;

/**
 * Fewest line changes with 0-1 BFS. A transfer edge weighs 1 and a ride edge weighs 0.
 *
 * <p>When every weight is 0 or 1 we do not need a heap. A DEQUE is enough: a node reached through
 * a 0-edge goes to the FRONT (same distance as the current node), and through a 1-edge to the BACK
 * (distance + 1). The deque then stays sorted by distance, like a two-level priority queue, and
 * the whole search is O(V + E).
 *
 * <p>Tie-break by time: we compare labels lexicographically as (transfers, minutes) and re-push a
 * node whenever either part improves. This makes the algorithm <i>label-correcting</i>: a node may
 * be popped more than once. The transfer count is still exact, the minutes converge to the minimum
 * among routes with that transfer count, and on a metro-sized graph re-pops are rare (see the
 * benchmark). Exercise 6 in REPORT.md asks you to make this O((V+E) log V) with a heap instead.
 */
public final class ZeroOneBfsStrategy implements RouteStrategy {
    private static final double EPS = 1e-9;

    @Override public String id() { return "fewest-transfers"; }
    @Override public String displayName() { return "0-1 BFS (fewest transfers)"; }

    @Override
    public SearchResult search(Graph g, String fromId, String toId, SearchOptions opt) {
        List<Node> sources = g.nodesOf(fromId);
        Station target = g.station(toId);
        TraceEvent.Recorder rec = new TraceEvent.Recorder(opt.trace());

        int n = g.nodeCount();
        int[] transfers = new int[n];
        double[] minutes = new double[n];
        int[] parent = new int[n];
        Arrays.fill(transfers, Integer.MAX_VALUE);
        Arrays.fill(minutes, Double.POSITIVE_INFINITY);
        Arrays.fill(parent, -1);

        Deque<Integer> deque = new ArrayDeque<>();
        for (Node s : sources) {
            transfers[s.index()] = 0;
            minutes[s.index()] = 0;
            deque.addFirst(s.index());
            rec.relax(s.index(), -1, 0, deque.size());
        }

        int expanded = 0;
        while (!deque.isEmpty()) {
            int u = deque.pollFirst();
            expanded++;
            rec.settle(u, parent[u], transfers[u], deque.size());
            for (Edge e : g.edgesFrom(u)) {
                int v = e.to();
                int w = e.isTransfer() ? 1 : 0;
                int nt = transfers[u] + w;
                double nm = minutes[u] + e.minutes();
                boolean better = nt < transfers[v] || (nt == transfers[v] && nm < minutes[v] - EPS);
                if (better) {
                    transfers[v] = nt;
                    minutes[v] = nm;
                    parent[v] = u;
                    if (w == 0) deque.addFirst(v); else deque.addLast(v);
                    rec.relax(v, u, nt, deque.size());
                }
            }
        }

        // Pick the best node of the target station: fewest transfers, then fewest minutes.
        int best = -1;
        for (Node t : g.nodesOf(target.getId())) {
            int i = t.index();
            if (transfers[i] == Integer.MAX_VALUE) continue;
            if (best == -1 || transfers[i] < transfers[best]
                    || (transfers[i] == transfers[best] && minutes[i] < minutes[best] - EPS)) best = i;
        }
        if (best == -1) return SearchResult.notFound(expanded, rec);
        return new SearchResult(List.of(Path.of(g, Path.unwind(parent, best))), expanded, rec.events());
    }
}
