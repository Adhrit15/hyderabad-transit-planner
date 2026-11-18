package com.hydmetro.algo;

import com.hydmetro.model.Edge;
import com.hydmetro.model.Graph;
import com.hydmetro.model.Node;

import java.util.Arrays;

/**
 * Floyd–Warshall all-pairs shortest paths. It is O(V³), too slow for a live query but trivial to
 * get right, which makes it a good reference implementation (a "test oracle").
 *
 * <p>Recurrence: d_k[i][j] = min(d_{k-1}[i][j], d_{k-1}[i][k] + d_{k-1}[k][j]).
 * After processing intermediate vertex k, d[i][j] is the shortest i→j path that uses only
 * vertices 0..k in between.
 */
final class FloydWarshall {
    private final double[][] d;
    private final Graph g;

    FloydWarshall(Graph g) {
        this.g = g;
        int n = g.nodeCount();
        d = new double[n][n];
        for (double[] row : d) Arrays.fill(row, Double.POSITIVE_INFINITY);
        for (int i = 0; i < n; i++) {
            d[i][i] = 0;
            for (Edge e : g.edgesFrom(i)) d[i][e.to()] = Math.min(d[i][e.to()], e.minutes());
        }
        for (int k = 0; k < n; k++)
            for (int i = 0; i < n; i++) {
                if (d[i][k] == Double.POSITIVE_INFINITY) continue;
                for (int j = 0; j < n; j++) {
                    double via = d[i][k] + d[k][j];
                    if (via < d[i][j]) d[i][j] = via;
                }
            }
    }

    /** Station-to-station minutes = min over all (line) nodes of both stations. */
    double minutes(String from, String to) {
        double best = Double.POSITIVE_INFINITY;
        for (Node a : g.nodesOf(from)) for (Node b : g.nodesOf(to)) best = Math.min(best, d[a.index()][b.index()]);
        return best;
    }
}
