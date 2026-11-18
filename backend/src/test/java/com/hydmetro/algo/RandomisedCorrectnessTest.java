package com.hydmetro.algo;

import com.hydmetro.fare.FareCalculator;
import com.hydmetro.model.Graph;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Differential testing: every fast algorithm is checked against a slow but obviously correct
 * reference on hundreds of random graphs. The seed is in every assertion message, so a failure can
 * be reproduced.
 */
class RandomisedCorrectnessTest {
    private static final double EPS = 1e-6;
    private static final FareCalculator FARES = new FareCalculator(List.of(
            new FareCalculator.Slab(2, 11), new FareCalculator.Slab(4, 17), new FareCalculator.Slab(6, 28),
            new FareCalculator.Slab(9, 37), new FareCalculator.Slab(12, 47), new FareCalculator.Slab(Double.POSITIVE_INFINITY, 69)));

    @RepeatedTest(40)
    void dijkstraAndAStarMatchFloydWarshall() {
        long seed = new Random().nextLong();
        Random rnd = new Random(seed);
        Graph g = TestGraphs.random(rnd, 25, 4, 1 + rnd.nextInt(6));
        FloydWarshall fw = new FloydWarshall(g);
        RouteStrategy dij = new DijkstraStrategy(), astar = new AStarStrategy(), lazy = new LazyDijkstraStrategy();
        for (int q = 0; q < 30; q++) {
            String a = "s" + rnd.nextInt(25), b = "s" + rnd.nextInt(25);
            double expected = fw.minutes(a, b);
            SearchResult d = dij.search(g, a, b, SearchOptions.DEFAULT);
            SearchResult s = astar.search(g, a, b, SearchOptions.DEFAULT);
            SearchResult l = lazy.search(g, a, b, SearchOptions.DEFAULT);
            if (Double.isInfinite(expected)) {
                assertFalse(d.found(), "seed=" + seed);
                assertFalse(s.found(), "seed=" + seed);
                continue;
            }
            assertEquals(expected, d.best().minutes(), EPS, "dijkstra seed=" + seed + " " + a + "->" + b);
            assertEquals(expected, s.best().minutes(), EPS, "astar seed=" + seed + " " + a + "->" + b);
            assertEquals(expected, l.best().minutes(), EPS, "lazy seed=" + seed);
            assertTrue(s.nodesExpanded() <= d.nodesExpanded(), "A* must not expand more than Dijkstra, seed=" + seed);
        }
    }

    /** Small graphs, so that enumerating every simple path stays feasible. */
    @RepeatedTest(40)
    void labelAlgorithmsMatchBruteForce() {
        long seed = new Random().nextLong();
        Random rnd = new Random(seed);
        Graph g = TestGraphs.random(rnd, 8, 3, 1 + rnd.nextInt(4));
        for (int q = 0; q < 10; q++) {
            String a = "s" + rnd.nextInt(8), b = "s" + rnd.nextInt(8);
            List<Path> all = TestGraphs.allSimplePaths(g, a, b);
            String ctx = "seed=" + seed + " " + a + "->" + b;

            SearchResult zob = new ZeroOneBfsStrategy().search(g, a, b, SearchOptions.DEFAULT);
            SearchResult cheap = new CheapestStrategy(FARES).search(g, a, b, SearchOptions.DEFAULT);
            SearchResult par = new ParetoStrategy().search(g, a, b, SearchOptions.DEFAULT);
            if (all.isEmpty()) {
                assertFalse(zob.found(), ctx); assertFalse(cheap.found(), ctx); assertFalse(par.found(), ctx);
                continue;
            }

            // 0-1 BFS: lexicographic minimum of (transfers, minutes)
            Path bestLex = all.stream().min(Comparator.comparingInt(Path::transfers).thenComparingDouble(Path::minutes)).orElseThrow();
            assertEquals(bestLex.transfers(), zob.best().transfers(), ctx);
            assertEquals(bestLex.minutes(), zob.best().minutes(), EPS, ctx);

            // Cheapest: min fare, then min minutes
            int minFare = all.stream().mapToInt(p -> FARES.fareFor(p.km())).min().orElseThrow();
            double minTimeAtFare = all.stream().filter(p -> FARES.fareFor(p.km()) == minFare).mapToDouble(Path::minutes).min().orElseThrow();
            assertEquals(minFare, FARES.fareFor(cheap.best().km()), ctx);
            assertEquals(minTimeAtFare, cheap.best().minutes(), EPS, ctx);

            // Pareto: same set of non-dominated (minutes, transfers) values
            assertEquals(paretoValues(all), paretoValues(par.paths()), ctx);
        }
    }

    private static Set<String> paretoValues(List<Path> paths) {
        Set<String> out = new TreeSet<>();
        for (Path p : paths) {
            boolean dominated = false;
            for (Path o : paths) {
                boolean le = o.minutes() <= p.minutes() + EPS && o.transfers() <= p.transfers();
                boolean lt = o.minutes() < p.minutes() - EPS || o.transfers() < p.transfers();
                if (le && lt) { dominated = true; break; }
            }
            if (!dominated) out.add(String.format(Locale.ROOT, "%.4f/%d", p.minutes(), p.transfers()));
        }
        return out;
    }

    @Test
    void floydWarshallSanityOnToy() {
        assertEquals(7, new FloydWarshall(TestGraphs.toy()).minutes("A", "E"), EPS);
    }
}
