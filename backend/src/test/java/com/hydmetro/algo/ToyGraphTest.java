package com.hydmetro.algo;

import com.hydmetro.fare.FareCalculator;
import com.hydmetro.model.Graph;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;

/** Known answers on the 5-station toy graph (worked through by hand in REPORT.md §4). */
class ToyGraphTest {
    private static final double EPS = 1e-9;
    private final Graph g = TestGraphs.toy();
    private final FareCalculator fares = TestGraphs.toyFares();

    static Stream<RouteStrategy> allStrategies() {
        return Stream.of(new DijkstraStrategy(), new AStarStrategy(), new LazyDijkstraStrategy(),
                new ZeroOneBfsStrategy(), new CheapestStrategy(TestGraphs.toyFares()), new ParetoStrategy());
    }

    private List<String> stationsOf(Path p) {
        return p.nodes().stream().map(i -> g.node(i).station().getId() + g.node(i).lineId()).toList();
    }

    @Test
    void dijkstraFindsFastestRouteWithTransfer() {
        Path p = new DijkstraStrategy().search(g, "A", "E", SearchOptions.DEFAULT).best();
        assertEquals(7, p.minutes(), EPS);
        assertEquals(1, p.transfers());
        assertEquals(List.of("AR", "BR", "BG", "DG", "EG"), stationsOf(p));
    }

    @Test
    void aStarMatchesDijkstra() {
        SearchResult a = new AStarStrategy().search(g, "A", "E", SearchOptions.DEFAULT);
        assertEquals(7, a.best().minutes(), EPS);
    }

    @Test
    void zeroOneBfsPrefersNoTransfer() {
        Path p = new ZeroOneBfsStrategy().search(g, "A", "E", SearchOptions.DEFAULT).best();
        assertEquals(0, p.transfers());
        assertEquals(11, p.minutes(), EPS);
    }

    @Test
    void cheapestBreaksFareTieByTimeNotByDistance() {
        // R route: 8 km (shortest!) 11 min; G route: 9 km, 7 min. Both cost ₹20, so pick the faster.
        Path p = new CheapestStrategy(fares).search(g, "A", "E", SearchOptions.DEFAULT).best();
        assertEquals(20, fares.fareFor(p.km()));
        assertEquals(7, p.minutes(), EPS);
    }

    @Test
    void cheapestPrefersLowerSlabWhenItExists() {
        FareCalculator tight = new FareCalculator(List.of(new FareCalculator.Slab(8, 15),
                new FareCalculator.Slab(Double.POSITIVE_INFINITY, 20)));
        Path p = new CheapestStrategy(tight).search(g, "A", "E", SearchOptions.DEFAULT).best();
        assertEquals(8, p.km(), EPS);
        assertEquals(15, tight.fareFor(p.km()));
    }

    @Test
    void paretoReturnsBothTradeOffs() {
        List<Path> front = new ParetoStrategy().search(g, "A", "E", SearchOptions.DEFAULT).paths();
        assertEquals(2, front.size());
        assertEquals(7, front.get(0).minutes(), EPS);
        assertEquals(1, front.get(0).transfers());
        assertEquals(11, front.get(1).minutes(), EPS);
        assertEquals(0, front.get(1).transfers());
    }

    @ParameterizedTest
    @MethodSource("allStrategies")
    void sameSourceAndDestinationIsZeroCost(RouteStrategy s) {
        SearchResult r = s.search(g, "B", "B", SearchOptions.DEFAULT);
        assertTrue(r.found());
        assertEquals(0, r.best().minutes(), EPS);
        assertEquals(1, r.best().nodes().size());
    }

    @ParameterizedTest
    @MethodSource("allStrategies")
    void unknownStationThrows(RouteStrategy s) {
        assertThrows(Graph.UnknownStationException.class, () -> s.search(g, "A", "Z", SearchOptions.DEFAULT));
        assertThrows(Graph.UnknownStationException.class, () -> s.search(g, "Z", "A", SearchOptions.DEFAULT));
    }

    @ParameterizedTest
    @MethodSource("allStrategies")
    void disconnectedStationIsNotFound(RouteStrategy s) {
        assertFalse(s.search(g, "A", "F", SearchOptions.DEFAULT).found());
        assertFalse(s.search(g, "F", "A", SearchOptions.DEFAULT).found());
    }

    @ParameterizedTest
    @MethodSource("allStrategies")
    void traceIsRecordedOnlyWhenAsked(RouteStrategy s) {
        assertTrue(s.search(g, "A", "E", SearchOptions.DEFAULT).trace().isEmpty());
        SearchResult traced = s.search(g, "A", "E", SearchOptions.WITH_TRACE);
        assertFalse(traced.trace().isEmpty());
        long settles = traced.trace().stream().filter(t -> t.kind() == TraceEvent.Kind.SETTLE).count();
        assertEquals(traced.nodesExpanded() > 0, settles > 0);
    }

    @Test
    void transferEdgesExistOnlyAtInterchange() {
        assertEquals(2, g.nodesOf("B").size());
        assertEquals(2, g.nodesOf("E").size());
        assertEquals(1, g.nodesOf("A").size());
    }
}
