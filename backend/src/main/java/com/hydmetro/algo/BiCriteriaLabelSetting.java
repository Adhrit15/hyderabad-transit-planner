package com.hydmetro.algo;

import com.hydmetro.model.Edge;
import com.hydmetro.model.Graph;
import com.hydmetro.model.Node;
import com.hydmetro.model.Station;

import java.util.*;
import java.util.function.ToDoubleFunction;

/**
 * Multi-criteria LABEL-SETTING search over two costs: minutes (primary) and a secondary cost
 * (km for Cheapest, transfers for Pareto).
 *
 * <p>Plain Dijkstra keeps ONE number per node. With two criteria there is no single best value:
 * a route that is faster but has more transfers is neither better nor worse. So each node keeps a
 * SET of labels (time, secondary), none of which DOMINATES another. Label A dominates B when A is
 * ≤ on both criteria. We pop labels in increasing time. A new label is discarded when an existing
 * label at the same node dominates it, and any labels it dominates are deleted.
 *
 * <p>Labels popped at the target, in time order, form the PARETO FRONT. Each next one must have a
 * strictly smaller secondary cost, otherwise an earlier (faster) one dominates it.
 */
final class BiCriteriaLabelSetting {
    private static final double EPS = 1e-9;

    static final class Label {
        final int node; final double time; final double sec; final Label parent;
        boolean dead;
        Label(int node, double time, double sec, Label parent) { this.node = node; this.time = time; this.sec = sec; this.parent = parent; }
        List<Integer> nodes() {
            LinkedList<Integer> out = new LinkedList<>();
            for (Label l = this; l != null; l = l.parent) out.addFirst(l.node);
            return out;
        }
    }

    record Result(List<Label> front, int expanded) { }

    /**
     * @param secondary  secondary cost of an edge
     * @param secCap     labels whose secondary cost exceeds this are pruned (resource constraint)
     * @param stopAtFirst return as soon as the first (fastest) target label is popped
     */
    static Result run(Graph g, List<Node> sources, Station target, ToDoubleFunction<Edge> secondary,
                      double secCap, boolean stopAtFirst, TraceEvent.Recorder rec) {
        List<List<Label>> labelsAt = new ArrayList<>(g.nodeCount());
        for (int i = 0; i < g.nodeCount(); i++) labelsAt.add(new ArrayList<>());
        PriorityQueue<Label> pq = new PriorityQueue<>(
                Comparator.comparingDouble((Label l) -> l.time).thenComparingDouble(l -> l.sec));

        for (Node s : sources) {
            Label l = new Label(s.index(), 0, 0, null);
            labelsAt.get(s.index()).add(l);
            pq.add(l);
            rec.relax(s.index(), -1, 0, pq.size());
        }

        List<Label> front = new ArrayList<>();
        double bestTargetSec = Double.POSITIVE_INFINITY;
        int expanded = 0;
        while (!pq.isEmpty()) {
            Label cur = pq.poll();
            if (cur.dead) continue;                       // was dominated after being queued
            expanded++;
            rec.settle(cur.node, cur.parent == null ? -1 : cur.parent.node, cur.time, pq.size());

            if (g.node(cur.node).station().equals(target)) {
                if (cur.sec < bestTargetSec - EPS) {      // not dominated by a faster target label
                    front.add(cur);
                    bestTargetSec = cur.sec;
                    if (stopAtFirst) break;
                }
                continue;                                  // never route THROUGH the destination
            }
            for (Edge e : g.edgesFrom(cur.node)) {
                double nt = cur.time + e.minutes();
                double ns = cur.sec + secondary.applyAsDouble(e);
                if (ns > secCap + EPS) continue;                 // violates the resource cap
                if (ns >= bestTargetSec - EPS) continue;         // a found target label dominates it
                List<Label> here = labelsAt.get(e.to());
                boolean dominated = false;
                for (Label o : here) {
                    if (!o.dead && o.time <= nt + EPS && o.sec <= ns + EPS) { dominated = true; break; }
                }
                if (dominated) continue;
                here.removeIf(o -> {                             // delete labels the new one dominates
                    boolean d = nt <= o.time + EPS && ns <= o.sec + EPS;
                    if (d) o.dead = true;
                    return d;
                });
                Label nl = new Label(e.to(), nt, ns, cur);
                here.add(nl);
                pq.add(nl);
                rec.relax(e.to(), cur.node, nt, pq.size());
            }
        }
        return new Result(front, expanded);
    }

    private BiCriteriaLabelSetting() { }
}
