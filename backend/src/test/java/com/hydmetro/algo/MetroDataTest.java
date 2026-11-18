package com.hydmetro.algo;

import com.hydmetro.model.Graph;
import com.hydmetro.model.GraphLoader;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Definition-of-done routes on the real Hyderabad data. */
class MetroDataTest {
    private static final GraphLoader.MetroData DATA = GraphLoader.loadDefault();
    private static final Graph G = DATA.graph();
    private static final Map<String, RouteStrategy> ALL = Strategies.all(DATA.fares());

    @Test
    void dataLoadsAllStationsAndInterchanges() {
        assertEquals(56, G.stations().size());
        assertEquals(59, G.nodeCount());                 // 56 + 3 interchange duplicates
        assertEquals(2, G.nodesOf("ameerpet").size());
        assertEquals(2, G.nodesOf("mg-bus-station").size());
        assertEquals(2, G.nodesOf("parade-ground").size());
    }

    @ParameterizedTest
    @CsvSource({"fastest", "astar", "fewest-transfers", "cheapest", "pareto"})
    void miyapurToLbNagarIsOneRedLineRide(String mode) {
        Path p = ALL.get(mode).search(G, "miyapur", "lb-nagar", SearchOptions.DEFAULT).best();
        assertNotNull(p);
        assertEquals(0, p.transfers());
        assertEquals(27, p.nodes().size());
        assertEquals(29.2, p.km(), 0.05);
        assertEquals(69, DATA.fares().fareFor(p.km()));
    }

    @ParameterizedTest
    @CsvSource({"fastest", "astar", "fewest-transfers", "cheapest", "pareto"})
    void raidurgToMgbsNeedsATransfer(String mode) {
        Path p = ALL.get(mode).search(G, "raidurg", "mg-bus-station", SearchOptions.DEFAULT).best();
        assertNotNull(p);
        assertTrue(p.transfers() >= 1, mode);
        assertTrue(p.minutes() > 20 && p.minutes() < 70, mode + " " + p.minutes());
    }

    @Test
    void aStarExpandsFewerNodesThanDijkstraOnLongTrip() {
        var d = ALL.get("fastest").search(G, "raidurg", "lb-nagar", SearchOptions.DEFAULT);
        var a = ALL.get("astar").search(G, "raidurg", "lb-nagar", SearchOptions.DEFAULT);
        assertEquals(d.best().minutes(), a.best().minutes(), 1e-9);
        assertTrue(a.nodesExpanded() < d.nodesExpanded(), a.nodesExpanded() + " vs " + d.nodesExpanded());
    }
}
