package com.hydmetro.bench;

import com.hydmetro.algo.*;
import com.hydmetro.model.Graph;
import com.hydmetro.model.GraphLoader;
import com.hydmetro.model.Station;

import java.util.*;

/**
 * Run with {@code ./gradlew bench}. Prints two tables:
 * 1. 100 random queries per strategy on the real metro graph: average nodes expanded and runtime.
 * 2. Dijkstra with our BinaryMinHeap vs java.util.PriorityQueue (lazy deletion) on a large synthetic
 *    grid "metro" (the real graph has only 59 nodes, too small to show a difference between heaps).
 * Every query is repeated after a JIT warm-up. The numbers are indicative, not rigorous (use JMH for that).
 */
public final class Benchmark {
    private static final int QUERIES = 100;

    public static void main(String[] args) {
        GraphLoader.MetroData data = GraphLoader.loadDefault();
        Graph g = data.graph();
        List<String> ids = g.stations().stream().map(Station::getId).toList();
        Random rnd = new Random(42);
        List<String[]> queries = new ArrayList<>();
        for (int i = 0; i < QUERIES; i++) queries.add(new String[]{ids.get(rnd.nextInt(ids.size())), ids.get(rnd.nextInt(ids.size()))});

        Map<String, RouteStrategy> strategies = new LinkedHashMap<>(Strategies.all(data.fares()));
        strategies.put("fastest-lazy", new LazyDijkstraStrategy());

        System.out.printf("%nMetro graph: %d stations, %d nodes, %d directed edges, %d random queries (seed 42)%n",
                g.stations().size(), g.nodeCount(), g.edgeCount(), QUERIES);
        System.out.println("| Strategy | avg nodes expanded | avg us/query | total ms |");
        System.out.println("|---|---:|---:|---:|");
        for (RouteStrategy s : strategies.values()) {
            for (int w = 0; w < 50; w++) for (String[] q : queries) s.search(g, q[0], q[1], SearchOptions.DEFAULT); // warm-up
            long expanded = 0;
            long t0 = System.nanoTime();
            for (String[] q : queries) expanded += s.search(g, q[0], q[1], SearchOptions.DEFAULT).nodesExpanded();
            long ns = System.nanoTime() - t0;
            System.out.printf(Locale.ROOT, "| %s | %.1f | %.1f | %.2f |%n", s.displayName(), expanded / (double) QUERIES,
                    ns / 1e3 / QUERIES, ns / 1e6);
        }

        heapBenchmark();
    }

    private static void heapBenchmark() {
        int side = 120;               // 120×120 grid = 14,400 stations, every station an interchange
        Graph big = grid(side, new Random(7));
        Random rnd = new Random(1);
        int q = 200;
        String[][] qs = new String[q][];
        for (int i = 0; i < q; i++) qs[i] = new String[]{"g" + rnd.nextInt(side * side), "g" + rnd.nextInt(side * side)};

        System.out.printf("%nHeap comparison on a %dx%d grid (%d nodes, %d edges), %d queries%n",
                side, side, big.nodeCount(), big.edgeCount(), q);
        System.out.println("| Dijkstra variant | avg ms/query | avg nodes expanded |");
        System.out.println("|---|---:|---:|");
        for (RouteStrategy s : List.of(new DijkstraStrategy(), new LazyDijkstraStrategy(), new AStarStrategy())) {
            for (int w = 0; w < 3; w++) for (String[] x : qs) s.search(big, x[0], x[1], SearchOptions.DEFAULT);
            long exp = 0, t0 = System.nanoTime();
            for (String[] x : qs) exp += s.search(big, x[0], x[1], SearchOptions.DEFAULT).nodesExpanded();
            long ns = System.nanoTime() - t0;
            System.out.printf(Locale.ROOT, "| %s | %.3f | %.0f |%n", s.displayName(), ns / 1e6 / q, exp / (double) q);
        }
    }

    /** Each row and each column is a "line"; segments 0.5–1.5 km apart, 40 km/h average + dwell. */
    static Graph grid(int side, Random rnd) {
        Graph.Builder b = new Graph.Builder().transferMinutes(3).maxSpeedKmph(80);
        double step = 0.009; // ~1 km in degrees latitude
        for (int r = 0; r < side; r++)
            for (int c = 0; c < side; c++)
                b.station("g" + (r * side + c), "G" + r + "," + c, 17 + r * step, 78 + c * step);
        for (int r = 0; r < side; r++)
            for (int c = 0; c < side; c++) {
                int id = r * side + c;
                if (c + 1 < side) { double km = 1.0 + rnd.nextDouble(); b.ride("g" + id, "g" + (id + 1), "row" + r, km * 1.5 + 0.3, km); }
                if (r + 1 < side) { double km = 1.0 + rnd.nextDouble(); b.ride("g" + id, "g" + (id + side), "col" + c, km * 1.5 + 0.3, km); }
            }
        return b.build();
    }

    private Benchmark() { }
}
