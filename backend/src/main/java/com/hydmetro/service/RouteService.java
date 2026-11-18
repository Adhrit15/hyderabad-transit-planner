package com.hydmetro.service;

import com.hydmetro.algo.*;
import com.hydmetro.api.Dtos.*;
import com.hydmetro.fare.FareCalculator;
import com.hydmetro.model.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Application service: the glue between HTTP and the engine. It looks up the strategy, runs it,
 * times it, and turns a node-index {@link Path} into human-friendly legs and instructions.
 * The graph is immutable, so a single instance is safely shared by all request threads.
 */
@Service
public class RouteService {
    private final Graph graph;
    private final FareCalculator fares;
    private final Map<String, RouteStrategy> strategies;

    public RouteService(@Value("${metro.transfer-minutes:5}") double transferMinutes) {
        GraphLoader.MetroData data = GraphLoader.load(transferMinutes);
        this.graph = data.graph();
        this.fares = data.fares();
        this.strategies = Strategies.all(fares);
    }

    public Set<String> modes() { return strategies.keySet(); }

    public StationsResponse stations() {
        List<LineDto> lines = new ArrayList<>();
        for (Line l : graph.lines()) {
            String[] t = terminals(l.id());
            lines.add(new LineDto(l.id(), l.name(), l.color(), t[0], t[1]));
        }
        List<StationDto> st = graph.stations().stream()
                .map(s -> new StationDto(s.getId(), s.getName(), s.getLat(), s.getLng(), s.getLineIds(), s.isInterchange(), s.isApproximate()))
                .toList();
        return new StationsResponse(lines, st, graph.transferMinutes());
    }

    public RouteResponse route(String from, String to, String mode, boolean trace) {
        RouteStrategy s = strategy(mode);
        long t0 = System.nanoTime();
        SearchResult r = s.search(graph, from, to, new SearchOptions(trace));
        long micros = (System.nanoTime() - t0) / 1000;

        RouteResponse main = toResponse(s, from, to, r.best(), r.nodesExpanded(), micros, trace ? traceDtos(r.trace()) : null, null);
        if (r.paths().size() > 1) {   // Pareto: attach every non-dominated alternative
            List<RouteResponse> alts = r.paths().stream()
                    .map(p -> toResponse(s, from, to, p, r.nodesExpanded(), micros, null, null)).toList();
            main = toResponse(s, from, to, r.best(), r.nodesExpanded(), micros, main.trace(), alts);
        }
        return main;
    }

    public CompareResponse compare(String from, String to) {
        Station a = graph.station(from), b = graph.station(to);
        List<CompareRow> rows = new ArrayList<>();
        for (RouteStrategy s : strategies.values()) {
            long best = Long.MAX_VALUE;
            SearchResult r = null;
            for (int i = 0; i < 5; i++) {                 // best of 5 runs to reduce timer noise
                long t0 = System.nanoTime();
                r = s.search(graph, from, to, SearchOptions.DEFAULT);
                best = Math.min(best, (System.nanoTime() - t0) / 1000);
            }
            Path p = r.best();
            rows.add(new CompareRow(s.id(), s.displayName(), r.found(),
                    p == null ? 0 : round(p.minutes()), p == null ? 0 : round(p.km()),
                    p == null ? 0 : p.transfers(), p == null ? 0 : fares.fareFor(p.km()),
                    r.nodesExpanded(), best, p == null ? List.of() : stationNames(p)));
        }
        return new CompareResponse(ref(a), ref(b), rows);
    }

    // ------------------------------------------------------------------------------------------

    private RouteStrategy strategy(String mode) {
        RouteStrategy s = strategies.get(mode);
        if (s == null) throw new IllegalArgumentException("Unknown mode '" + mode + "'. Use one of " + strategies.keySet());
        return s;
    }

    private RouteResponse toResponse(RouteStrategy s, String from, String to, Path p, int expanded, long micros,
                                     List<TraceEventDto> trace, List<RouteResponse> alts) {
        StationRef f = ref(graph.station(from)), t = ref(graph.station(to));
        if (p == null) {
            return new RouteResponse(s.id(), s.displayName(), f, t, false, 0, 0, 0, 0, List.of(),
                    List.of("No route found between " + f.name() + " and " + t.name() + "."), expanded, micros, alts, trace);
        }
        List<LegDto> legs = legs(p);
        return new RouteResponse(s.id(), s.displayName(), f, t, true, round(p.minutes()), round(p.km()), p.transfers(),
                fares.fareFor(p.km()), legs, instructions(legs, f, t), expanded, micros, alts, trace);
    }

    /** Splits the node path into legs: maximal runs of consecutive nodes on the same line. */
    List<LegDto> legs(Path p) {
        List<LegDto> legs = new ArrayList<>();
        List<Integer> nodes = p.nodes();
        int i = 0;
        while (i < nodes.size()) {
            String line = graph.node(nodes.get(i)).lineId();
            int j = i;
            double min = 0, km = 0;
            while (j + 1 < nodes.size() && graph.node(nodes.get(j + 1)).lineId().equals(line)
                    && !graph.node(nodes.get(j + 1)).station().equals(graph.node(nodes.get(j)).station())) {
                Edge e = edge(nodes.get(j), nodes.get(j + 1));
                min += e.minutes(); km += e.km();
                j++;
            }
            if (j > i || nodes.size() == 1) {
                List<StationRef> st = new ArrayList<>();
                for (int k = i; k <= j; k++) st.add(ref(graph.node(nodes.get(k)).station()));
                Line l = graph.line(line);
                legs.add(new LegDto(line, l == null ? line : l.name(), l == null ? "#888" : l.color(),
                        towards(line, graph.node(nodes.get(i)).station(), graph.node(nodes.get(j)).station()), st, round(min), round(km)));
            }
            i = j + 1;
        }
        return legs;
    }

    private List<String> instructions(List<LegDto> legs, StationRef from, StationRef to) {
        List<String> out = new ArrayList<>();
        if (from.id().equals(to.id())) { out.add("You are already at " + from.name() + "."); return out; }
        for (int k = 0; k < legs.size(); k++) {
            LegDto leg = legs.get(k);
            String first = leg.stations().get(0).name();
            int stops = leg.stations().size() - 1;
            if (k == 0) out.add("Board the " + leg.lineName() + " at " + first + " towards " + leg.towards() + ".");
            else out.add("Change at " + first + " → " + leg.lineName() + " towards " + leg.towards()
                    + " (≈" + fmt(graph.transferMinutes()) + " min walk + wait).");
            out.add("Ride " + stops + " stop" + (stops == 1 ? "" : "s") + " (" + fmt(leg.minutes()) + " min).");
        }
        out.add("Alight at " + to.name() + ".");
        return out;
    }

    private String towards(String lineId, Station a, Station b) {
        Integer oa = a.orderOn(lineId), ob = b.orderOn(lineId);
        String[] t = terminals(lineId);
        if (oa == null || ob == null || oa.equals(ob)) return t[1];
        return ob > oa ? t[1] : t[0];
    }

    /** [first terminal name, last terminal name] of a line, derived from station order. */
    private String[] terminals(String lineId) {
        Station first = null, last = null;
        for (Station s : graph.stations()) {
            Integer o = s.orderOn(lineId);
            if (o == null) continue;
            if (first == null || o < first.orderOn(lineId)) first = s;
            if (last == null || o > last.orderOn(lineId)) last = s;
        }
        return new String[]{first == null ? "" : first.getName(), last == null ? "" : last.getName()};
    }

    private Edge edge(int u, int v) {
        for (Edge e : graph.edgesFrom(u)) if (e.to() == v) return e;
        throw new IllegalStateException("missing edge");
    }

    private List<TraceEventDto> traceDtos(List<TraceEvent> events) {
        List<TraceEventDto> out = new ArrayList<>(events.size());
        for (TraceEvent e : events) {
            Node n = graph.node(e.node());
            Node f = e.from() < 0 ? null : graph.node(e.from());
            out.add(new TraceEventDto(e.kind().name().toLowerCase(Locale.ROOT), n.station().getId(), n.lineId(),
                    f == null ? null : f.station().getId(), f == null ? null : f.lineId(), round(e.cost()), e.frontier()));
        }
        return out;
    }

    private List<String> stationNames(Path p) {
        List<String> names = new ArrayList<>();
        for (int i : p.nodes()) {
            String n = graph.node(i).station().getName();
            if (names.isEmpty() || !names.get(names.size() - 1).equals(n)) names.add(n);
        }
        return names;
    }

    private static StationRef ref(Station s) { return new StationRef(s.getId(), s.getName()); }
    private static double round(double x) { return Math.round(x * 10) / 10.0; }
    private static String fmt(double x) { return x == Math.floor(x) ? String.valueOf((long) x) : String.valueOf(round(x)); }
}
