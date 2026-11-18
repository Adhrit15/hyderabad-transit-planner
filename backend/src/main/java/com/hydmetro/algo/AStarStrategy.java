package com.hydmetro.algo;

import com.hydmetro.model.Graph;
import com.hydmetro.model.Node;
import com.hydmetro.model.Station;

/**
 * A* search: Dijkstra plus a "sense of direction".
 *
 * <p>h(v) = haversine(v, target) / maxTrainSpeed, in minutes. This value is
 * <ul>
 *   <li><b>admissible</b>: a train can never cover the straight-line distance faster than at top
 *       speed, and the track is never shorter than the straight line, so h never overestimates;</li>
 *   <li><b>consistent</b>: for every edge u→v, h(u) ≤ w(u,v) + h(v), by the triangle inequality
 *       plus the same speed argument. Transfer edges keep the station, so h(u) = h(v) ≤ 5 + h(v).</li>
 * </ul>
 * Consistency means a node settled once never needs re-opening, so the BestFirstSearch loop stays
 * correct. A* then returns the same cost as Dijkstra while expanding fewer nodes.
 */
public final class AStarStrategy extends BestFirstSearch {
    @Override public String id() { return "astar"; }
    @Override public String displayName() { return "A* (haversine heuristic)"; }

    @Override
    protected double heuristic(Graph g, Node n, Station target) {
        double km = Graph.haversineKm(n.station(), target);
        return km / g.maxSpeedKmph() * 60.0;
    }
}
