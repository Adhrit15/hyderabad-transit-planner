package com.hydmetro.model;

import java.util.*;

/**
 * Directed graph over (station, line) nodes, stored as an ADJACENCY LIST: {@code adj.get(u)} holds
 * the edges leaving node u. A metro network is sparse (E ≈ 2V), so an adjacency list uses O(V+E)
 * memory, where an adjacency matrix would need O(V²).
 *
 * <p>Build it with {@link Builder}. The builder creates nodes on demand and adds transfer edges
 * between every pair of lines at an interchange.
 */
public final class Graph {
    public static final double EARTH_RADIUS_KM = 6371.0;

    private final List<Node> nodes;
    private final List<List<Edge>> adj;
    private final Map<String, Station> stations;          // insertion ordered
    private final Map<String, List<Node>> nodesByStation;
    private final Map<String, Line> lines;
    private final double transferMinutes;
    private final double maxSpeedKmph;
    private final int edgeCount;

    private Graph(Builder b) {
        this.nodes = List.copyOf(b.nodes);
        List<List<Edge>> a = new ArrayList<>();
        int count = 0;
        for (List<Edge> list : b.adj) { a.add(List.copyOf(list)); count += list.size(); }
        this.adj = List.copyOf(a);
        this.edgeCount = count;
        this.stations = Collections.unmodifiableMap(new LinkedHashMap<>(b.stations));
        Map<String, List<Node>> nbs = new HashMap<>();
        b.nodesByStation.forEach((k, v) -> nbs.put(k, List.copyOf(v)));
        this.nodesByStation = Collections.unmodifiableMap(nbs);
        this.lines = Collections.unmodifiableMap(new LinkedHashMap<>(b.lines));
        this.transferMinutes = b.transferMinutes;
        this.maxSpeedKmph = b.maxSpeedKmph;
    }

    public int nodeCount() { return nodes.size(); }
    public int edgeCount() { return edgeCount; }
    public Node node(int i) { return nodes.get(i); }
    public List<Node> nodes() { return nodes; }
    public List<Edge> edgesFrom(int u) { return adj.get(u); }
    public Collection<Station> stations() { return stations.values(); }
    public Collection<Line> lines() { return lines.values(); }
    public Line line(String id) { return lines.get(id); }
    public double transferMinutes() { return transferMinutes; }
    public double maxSpeedKmph() { return maxSpeedKmph; }
    public boolean hasStation(String id) { return stations.containsKey(id); }

    public Station station(String id) {
        Station s = stations.get(id);
        if (s == null) throw new UnknownStationException(id);
        return s;
    }

    /** All (station, line) nodes of a station: 1 for a normal station, 2+ for an interchange. */
    public List<Node> nodesOf(String stationId) {
        station(stationId); // validates
        return nodesByStation.get(stationId);
    }

    /** Great-circle distance in km (the haversine formula). */
    public static double haversineKm(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1), dLng = Math.toRadians(lng2 - lng1);
        double h = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
    }

    public static double haversineKm(Station a, Station b) {
        return haversineKm(a.getLat(), a.getLng(), b.getLat(), b.getLng());
    }

    /** Thrown when a station id is not in the graph. The API layer maps it to HTTP 404. */
    public static class UnknownStationException extends RuntimeException {
        private final String stationId;
        public UnknownStationException(String id) { super("Unknown station: " + id); this.stationId = id; }
        public String stationId() { return stationId; }
    }

    // ------------------------------------------------------------------------------------------
    public static final class Builder {
        private final List<Node> nodes = new ArrayList<>();
        private final List<List<Edge>> adj = new ArrayList<>();
        private final Map<String, Station> stations = new LinkedHashMap<>();
        private final Map<String, List<String>> stationLines = new LinkedHashMap<>();
        private final Map<String, double[]> stationCoords = new HashMap<>();
        private final Map<String, String> stationNames = new HashMap<>();
        private final Map<String, Boolean> stationApprox = new HashMap<>();
        private final Map<String, List<Node>> nodesByStation = new HashMap<>();
        private final Map<String, Integer> nodeIndex = new HashMap<>();
        private final Map<String, Line> lines = new LinkedHashMap<>();
        private final List<double[]> pendingRides = new ArrayList<>();   // [fromIdx,toIdx,min,km] by key
        private final List<String[]> pendingRideKeys = new ArrayList<>();
        private double transferMinutes = 5.0;
        private double maxSpeedKmph = 80.0;

        public Builder transferMinutes(double m) {
            if (m < 0) throw new IllegalArgumentException("transferMinutes must be >= 0");
            this.transferMinutes = m; return this;
        }
        public Builder maxSpeedKmph(double v) {
            if (v <= 0) throw new IllegalArgumentException("maxSpeedKmph must be > 0");
            this.maxSpeedKmph = v; return this;
        }
        public Builder line(String id, String name, String color) { lines.put(id, new Line(id, name, color)); return this; }

        public Builder station(String id, String name, double lat, double lng) { return station(id, name, lat, lng, false); }

        public Builder station(String id, String name, double lat, double lng, boolean approximate) {
            stationNames.put(id, name);
            stationCoords.put(id, new double[]{lat, lng});
            stationApprox.put(id, approximate);
            stationLines.putIfAbsent(id, new ArrayList<>());
            return this;
        }

        /** Adds an undirected ride between neighbouring stations a and b on the given line. */
        public Builder ride(String a, String b, String lineId, double minutes, double km) {
            if (minutes < 0 || km < 0) throw new IllegalArgumentException("negative edge weight " + a + "-" + b);
            for (String s : new String[]{a, b}) {
                if (!stationNames.containsKey(s)) throw new UnknownStationException(s);
                List<String> ls = stationLines.get(s);
                if (!ls.contains(lineId)) ls.add(lineId);
            }
            lines.putIfAbsent(lineId, new Line(lineId, lineId, "#888888"));
            pendingRideKeys.add(new String[]{a, b, lineId});
            pendingRides.add(new double[]{minutes, km});
            return this;
        }

        public Graph build() {
            // 1. Freeze stations now that we know which lines serve them.
            stationLines.forEach((id, ls) -> {
                double[] c = stationCoords.get(id);
                stations.put(id, new Station(id, stationNames.get(id), c[0], c[1], stationApprox.get(id), ls));
            });
            // 2. One node per (station, line). A station with no lines still gets one "isolated"
            //    node so that it can be queried (it is simply unreachable).
            for (Station s : stations.values()) {
                List<String> ls = s.getLineIds().isEmpty() ? List.of("NONE") : s.getLineIds();
                for (String l : ls) node(s, l);
            }
            // 3. Ride edges, in both directions.
            for (int i = 0; i < pendingRideKeys.size(); i++) {
                String[] k = pendingRideKeys.get(i);
                double[] w = pendingRides.get(i);
                int u = nodeIndex.get(k[0] + "|" + k[2]), v = nodeIndex.get(k[1] + "|" + k[2]);
                adj.get(u).add(new Edge(u, v, w[0], w[1], Edge.Type.RIDE));
                adj.get(v).add(new Edge(v, u, w[0], w[1], Edge.Type.RIDE));
            }
            // 4. Transfer edges between every ordered pair of lines at the same station.
            for (List<Node> group : nodesByStation.values()) {
                for (Node x : group) for (Node y : group) {
                    if (x != y) adj.get(x.index()).add(new Edge(x.index(), y.index(), transferMinutes, 0, Edge.Type.TRANSFER));
                }
            }
            return new Graph(this);
        }

        private Node node(Station s, String lineId) {
            Node n = new Node(nodes.size(), s, lineId);
            nodes.add(n);
            adj.add(new ArrayList<>());
            nodeIndex.put(s.getId() + "|" + lineId, n.index());
            nodesByStation.computeIfAbsent(s.getId(), k -> new ArrayList<>()).add(n);
            return n;
        }
    }
}
