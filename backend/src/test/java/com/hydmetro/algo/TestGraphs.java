package com.hydmetro.algo;

import com.hydmetro.fare.FareCalculator;
import com.hydmetro.model.Edge;
import com.hydmetro.model.Graph;
import com.hydmetro.model.Node;

import java.util.*;

/** Hand-made and random graphs plus a brute-force path enumerator, used by the tests. */
final class TestGraphs {
    private TestGraphs() { }

    /**
     * The 5-station TOY GRAPH that REPORT.md works through by hand (transfer cost = 1 min).
     * <pre>
     *   Line R:  A --2-- B --3-- C --6-- E          (km: 2, 3, 3)
     *   Line G:          B --2-- D --2-- E          (km: 4, 3)
     *   F: an isolated station (no lines)
     * </pre>
     * A→E fastest: A-B(R) ⇒ B(G) ⇒ D ⇒ E = 2+1+2+2 = 7 min, 1 transfer, 9 km.
     * A→E fewest transfers: A-B-C-E on R = 11 min, 0 transfers, 8 km.
     */
    static Graph toy() {
        double d = 0.001; // stations about 100 m apart, so the A* heuristic is tiny and admissible
        return new Graph.Builder()
                .transferMinutes(1).maxSpeedKmph(80)
                .line("R", "Red", "#f00").line("G", "Green", "#0f0")
                .station("A", "A", 0, 0).station("B", "B", 0, d).station("C", "C", 0, 2 * d)
                .station("D", "D", d, 2 * d).station("E", "E", 0, 3 * d).station("F", "F", 5 * d, 5 * d)
                .ride("A", "B", "R", 2, 2).ride("B", "C", "R", 3, 3).ride("C", "E", "R", 6, 3)
                .ride("B", "D", "G", 2, 4).ride("D", "E", "G", 2, 3)
                .build();
    }

    /** ≤5 km ₹10, ≤10 km ₹20, more ₹30. Both A→E routes (8 km, 9 km) cost ₹20. */
    static FareCalculator toyFares() {
        return new FareCalculator(List.of(new FareCalculator.Slab(5, 10), new FareCalculator.Slab(10, 20),
                new FareCalculator.Slab(Double.POSITIVE_INFINITY, 30)));
    }

    /**
     * Random metro-like graph: {@code stations} random points, {@code lines} random simple paths
     * through them. Ride minutes are always ≥ straight-line km / 80 km/h, so the A* heuristic stays
     * admissible. Some stations may end up on no line (disconnected).
     */
    static Graph random(Random rnd, int stations, int lines, double transfer) {
        Graph.Builder b = new Graph.Builder().transferMinutes(transfer).maxSpeedKmph(80);
        double[][] pts = new double[stations][];
        for (int i = 0; i < stations; i++) {
            pts[i] = new double[]{17.3 + rnd.nextDouble() * 0.2, 78.3 + rnd.nextDouble() * 0.2};
            b.station("s" + i, "S" + i, pts[i][0], pts[i][1]);
        }
        for (int l = 0; l < lines; l++) {
            String line = "L" + l;
            b.line(line, line, "#000");
            List<Integer> order = new ArrayList<>();
            for (int i = 0; i < stations; i++) order.add(i);
            Collections.shuffle(order, rnd);
            int len = 2 + rnd.nextInt(Math.max(1, stations - 1));
            for (int k = 0; k + 1 < Math.min(len, stations); k++) {
                int a = order.get(k), c = order.get(k + 1);
                double straight = Graph.haversineKm(pts[a][0], pts[a][1], pts[c][0], pts[c][1]);
                double km = straight * (1 + rnd.nextDouble() * 0.5);
                double minutes = km / 40 * 60 + rnd.nextDouble() * 2;
                b.ride("s" + a, "s" + c, line, round(minutes), round(km));
            }
        }
        return b.build();
    }

    private static double round(double x) { return Math.round(x * 100) / 100.0; }

    /** All SIMPLE node paths from any node of {@code from} to any node of {@code to} (DFS). Small graphs only! */
    static List<Path> allSimplePaths(Graph g, String from, String to) {
        List<Path> out = new ArrayList<>();
        Set<String> targetIds = Set.of(to);
        for (Node s : g.nodesOf(from)) {
            dfs(g, s.index(), targetIds, new ArrayDeque<>(List.of(s.index())), new boolean[g.nodeCount()], out);
        }
        return out;
    }

    private static void dfs(Graph g, int u, Set<String> target, Deque<Integer> stack, boolean[] onPath, List<Path> out) {
        onPath[u] = true;
        if (target.contains(g.node(u).station().getId())) {
            out.add(Path.of(g, new ArrayList<>(stack)));
        } else {
            for (Edge e : g.edgesFrom(u)) {
                if (onPath[e.to()]) continue;
                stack.addLast(e.to());
                dfs(g, e.to(), target, stack, onPath, out);
                stack.removeLast();
            }
        }
        onPath[u] = false;
    }
}
