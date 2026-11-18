package com.hydmetro.algo;

import com.hydmetro.fare.FareCalculator;
import com.hydmetro.heap.BinaryMinHeap;
import com.hydmetro.model.Edge;
import com.hydmetro.model.Graph;
import com.hydmetro.model.Node;
import com.hydmetro.model.Station;

import java.util.Arrays;
import java.util.List;

/**
 * The lowest fare, with ties broken by time.
 *
 * <p>Fare = f(total km) where f is a non-decreasing STEP function, so:
 * <ol>
 *   <li>The minimum fare F* is f(minimum km). We find the minimum km with a Dijkstra on km.</li>
 *   <li>Every route whose km stays inside the same slab (≤ the slab's upper edge) also costs F*.
 *       Among those we want the FASTEST: a resource-constrained shortest path (minimise time with
 *       km ≤ cap), solved with {@link BiCriteriaLabelSetting} and a km cap.</li>
 * </ol>
 * Simply returning the shortest-km route would be WRONG: a slightly longer route in the same fare
 * slab may be much faster. The tests include exactly that case.
 */
public final class CheapestStrategy implements RouteStrategy {
    private final FareCalculator fares;

    public CheapestStrategy(FareCalculator fares) { this.fares = fares; }

    @Override public String id() { return "cheapest"; }
    @Override public String displayName() { return "Cheapest (fare slabs)"; }

    @Override
    public SearchResult search(Graph g, String fromId, String toId, SearchOptions opt) {
        List<Node> sources = g.nodesOf(fromId);
        Station target = g.station(toId);
        TraceEvent.Recorder rec = new TraceEvent.Recorder(opt.trace());

        // Phase 1: plain Dijkstra on km, to find the minimum distance (and hence the minimum fare).
        int n = g.nodeCount();
        double[] km = new double[n];
        Arrays.fill(km, Double.POSITIVE_INFINITY);
        BinaryMinHeap heap = new BinaryMinHeap(n);
        for (Node s : sources) { km[s.index()] = 0; heap.insert(s.index(), 0); }
        double minKm = Double.POSITIVE_INFINITY;
        int expanded = 0;
        while (!heap.isEmpty()) {
            int u = heap.extractMin();
            expanded++;
            if (g.node(u).station().equals(target)) { minKm = km[u]; break; }
            for (Edge e : g.edgesFrom(u)) {
                double nd = km[u] + e.km();
                if (nd < km[e.to()]) { km[e.to()] = nd; heap.insertOrDecrease(e.to(), nd); }
            }
        }
        if (Double.isInfinite(minKm)) return SearchResult.notFound(expanded, rec);

        // Phase 2: fastest route whose km stays within the cheapest slab.
        double cap = fares.slabUpperBoundKm(minKm);
        BiCriteriaLabelSetting.Result r = BiCriteriaLabelSetting.run(g, sources, target, Edge::km, cap, true, rec);
        if (r.front().isEmpty()) return SearchResult.notFound(expanded + r.expanded(), rec); // cannot happen
        Path p = Path.of(g, r.front().get(0).nodes());
        return new SearchResult(List.of(p), expanded + r.expanded(), rec.events());
    }
}
