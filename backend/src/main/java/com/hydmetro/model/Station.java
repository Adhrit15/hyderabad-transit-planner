package com.hydmetro.model;

import java.util.List;
import java.util.Objects;

/**
 * A physical station. One station can be served by several lines (an interchange).
 * The graph does NOT use stations as nodes directly; see {@link Node}.
 */
public final class Station {
    private final String id;
    private final String name;
    private final double lat;
    private final double lng;
    private final boolean approximate;
    private final List<String> lineIds;

    public Station(String id, String name, double lat, double lng, boolean approximate, List<String> lineIds) {
        this.id = Objects.requireNonNull(id);
        this.name = Objects.requireNonNull(name);
        this.lat = lat;
        this.lng = lng;
        this.approximate = approximate;
        this.lineIds = List.copyOf(lineIds);
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public double getLat() { return lat; }
    public double getLng() { return lng; }
    public boolean isApproximate() { return approximate; }
    public List<String> getLineIds() { return lineIds; }
    public boolean isInterchange() { return lineIds.size() > 1; }

    @Override public boolean equals(Object o) { return o instanceof Station s && s.id.equals(id); }
    @Override public int hashCode() { return id.hashCode(); }
    @Override public String toString() { return name; }
}
