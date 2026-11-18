package com.hydmetro.algo;

import com.hydmetro.model.Graph;

/**
 * STRATEGY PATTERN: every route-finding algorithm implements this interface. The rest of the
 * application (the service, controllers and benchmark) depends only on the interface, so adding a
 * new mode means writing one class and registering it in {@link Strategies}.
 */
public interface RouteStrategy {

    /** The mode name used in the API, e.g. "fastest". */
    String id();

    /** Human-readable name, e.g. "Dijkstra (fastest)". */
    String displayName();

    /**
     * Finds route(s) between two STATIONS. The search may start on any line serving {@code fromStationId}
     * and may end on any line serving {@code toStationId}.
     *
     * @throws Graph.UnknownStationException if either id is not a station
     */
    SearchResult search(Graph graph, String fromStationId, String toStationId, SearchOptions options);
}
