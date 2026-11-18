package com.hydmetro.algo;

import java.util.List;

/**
 * @param paths         best path first; empty if the destination is unreachable. Pareto may return several.
 * @param nodesExpanded number of queue pops (node settlements / label expansions), a hardware-independent measure of work
 * @param trace         recorded events, empty unless tracing was requested
 */
public record SearchResult(List<Path> paths, int nodesExpanded, List<TraceEvent> trace) {

    public boolean found() { return !paths.isEmpty(); }

    public Path best() { return paths.isEmpty() ? null : paths.get(0); }

    static SearchResult notFound(int expanded, TraceEvent.Recorder rec) {
        return new SearchResult(List.of(), expanded, rec.events());
    }
}
