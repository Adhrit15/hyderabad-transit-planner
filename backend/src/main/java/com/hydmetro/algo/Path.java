package com.hydmetro.algo;

import com.hydmetro.model.Edge;
import com.hydmetro.model.Graph;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * A route as a sequence of node indices, with its totals. The totals are always recomputed from
 * the graph's edges ({@link #of}), so every strategy reports costs the same way. This keeps the
 * strategies honest and comparable.
 */
public record Path(List<Integer> nodes, double minutes, double km, int transfers) {

    public static Path of(Graph g, List<Integer> nodes) {
        double min = 0, km = 0;
        int transfers = 0;
        for (int i = 0; i + 1 < nodes.size(); i++) {
            Edge best = null;
            for (Edge e : g.edgesFrom(nodes.get(i))) {
                if (e.to() == nodes.get(i + 1) && (best == null || e.minutes() < best.minutes())) best = e;
            }
            if (best == null) throw new IllegalStateException("no edge " + nodes.get(i) + "->" + nodes.get(i + 1));
            min += best.minutes();
            km += best.km();
            if (best.isTransfer()) transfers++;
        }
        return new Path(List.copyOf(nodes), min, km, transfers);
    }

    /** Walks a parent[] array back from {@code end} and returns the path in forward order. */
    static List<Integer> unwind(int[] parent, int end) {
        List<Integer> out = new ArrayList<>();
        for (int v = end; v != -1; v = parent[v]) out.add(v);
        Collections.reverse(out);
        return out;
    }
}
