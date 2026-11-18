package com.hydmetro.algo;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * One step of a search, recorded so the frontend can replay the algorithm.
 * SETTLE: a node was taken out of the priority queue and its cost is now final (or, for
 * label-setting, a label was expanded). RELAX: a better cost to {@code node} was found via {@code from}.
 *
 * @param frontier size of the priority queue / deque right after this event
 */
public record TraceEvent(Kind kind, int node, int from, double cost, int frontier) {
    public enum Kind { SETTLE, RELAX }

    /** Collects events only when tracing is on, so normal queries pay ~nothing. */
    static final class Recorder {
        private final List<TraceEvent> events;

        Recorder(boolean enabled) { this.events = enabled ? new ArrayList<>() : null; }

        void settle(int node, int from, double cost, int frontier) {
            if (events != null) events.add(new TraceEvent(Kind.SETTLE, node, from, cost, frontier));
        }

        void relax(int node, int from, double cost, int frontier) {
            if (events != null) events.add(new TraceEvent(Kind.RELAX, node, from, cost, frontier));
        }

        List<TraceEvent> events() { return events == null ? List.of() : Collections.unmodifiableList(events); }
    }
}
