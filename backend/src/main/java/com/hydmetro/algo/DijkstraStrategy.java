package com.hydmetro.algo;

import com.hydmetro.model.Graph;
import com.hydmetro.model.Node;
import com.hydmetro.model.Station;

/**
 * Dijkstra's algorithm: the fastest route by minutes, using {@link com.hydmetro.heap.BinaryMinHeap}
 * with decrease-key. The algorithm itself is in {@link BestFirstSearch#search}. Dijkstra is the
 * special case where the heuristic is 0.
 * Time O((V + E) log V), space O(V).
 */
public final class DijkstraStrategy extends BestFirstSearch {
    @Override public String id() { return "fastest"; }
    @Override public String displayName() { return "Dijkstra (fastest)"; }

    @Override
    protected double heuristic(Graph g, Node n, Station target) { return 0; }
}
