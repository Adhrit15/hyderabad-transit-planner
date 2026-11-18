package com.hydmetro.algo;

import com.hydmetro.fare.FareCalculator;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** Registry of the strategies the API exposes, keyed by mode id ("fastest", "astar", ...). */
public final class Strategies {
    private Strategies() { }

    public static Map<String, RouteStrategy> all(FareCalculator fares) {
        Map<String, RouteStrategy> m = new LinkedHashMap<>();
        for (RouteStrategy s : new RouteStrategy[]{
                new DijkstraStrategy(), new AStarStrategy(), new ZeroOneBfsStrategy(),
                new CheapestStrategy(fares), new ParetoStrategy()}) {
            m.put(s.id(), s);
        }
        return Collections.unmodifiableMap(m);
    }
}
