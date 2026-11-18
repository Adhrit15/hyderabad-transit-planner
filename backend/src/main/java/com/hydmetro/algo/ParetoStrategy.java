package com.hydmetro.algo;

import com.hydmetro.model.Edge;
import com.hydmetro.model.Graph;

import java.util.ArrayList;
import java.util.List;

/**
 * Every NON-DOMINATED route over (minutes, transfers). Example result:
 * "48 min with 1 change" and "55 min with 0 changes". Neither is better on both criteria, so the
 * rider chooses. Paths are returned fastest first, so best() equals the fastest route's time.
 */
public final class ParetoStrategy implements RouteStrategy {
    @Override public String id() { return "pareto"; }
    @Override public String displayName() { return "Pareto (time x transfers)"; }

    @Override
    public SearchResult search(Graph g, String fromId, String toId, SearchOptions opt) {
        var sources = g.nodesOf(fromId);
        var target = g.station(toId);
        TraceEvent.Recorder rec = new TraceEvent.Recorder(opt.trace());
        BiCriteriaLabelSetting.Result r = BiCriteriaLabelSetting.run(
                g, sources, target, (Edge e) -> e.isTransfer() ? 1 : 0, Double.POSITIVE_INFINITY, false, rec);
        List<Path> paths = new ArrayList<>();
        for (BiCriteriaLabelSetting.Label l : r.front()) paths.add(Path.of(g, l.nodes()));
        return new SearchResult(paths, r.expanded(), rec.events());
    }
}
