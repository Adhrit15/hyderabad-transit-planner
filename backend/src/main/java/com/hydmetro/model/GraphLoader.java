package com.hydmetro.model;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hydmetro.fare.FareCalculator;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;

/** Reads data/stations.json, data/edges.json and data/fares.json from the classpath. */
public final class GraphLoader {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private GraphLoader() { }

    /** Everything the engine needs, loaded from JSON. */
    public record MetroData(Graph graph, FareCalculator fares) { }

    public static MetroData loadDefault() { return load(null); }

    /** @param transferMinutesOverride null means use the value in stations.json */
    public static MetroData load(Double transferMinutesOverride) {
        JsonNode st = read("data/stations.json");
        JsonNode ed = read("data/edges.json");
        JsonNode fa = read("data/fares.json");

        Graph.Builder b = new Graph.Builder()
                .transferMinutes(transferMinutesOverride != null ? transferMinutesOverride : st.path("transferMinutes").asDouble(5))
                .maxSpeedKmph(st.path("maxTrainSpeedKmph").asDouble(80));
        for (JsonNode l : st.get("lines")) b.line(l.get("id").asText(), l.get("name").asText(), l.get("color").asText());
        for (JsonNode s : st.get("stations")) {
            b.station(s.get("id").asText(), s.get("name").asText(), s.get("lat").asDouble(), s.get("lng").asDouble(),
                    s.path("approximate").asBoolean(false));
            for (JsonNode lo : s.path("lines")) b.order(s.get("id").asText(), lo.get("line").asText(), lo.get("order").asInt());
        }
        for (JsonNode e : ed.get("edges")) {
            b.ride(e.get("from").asText(), e.get("to").asText(), e.get("line").asText(),
                    e.get("minutes").asDouble(), e.get("km").asDouble());
        }

        List<FareCalculator.Slab> slabs = new ArrayList<>();
        for (JsonNode s : fa.get("slabs")) {
            double max = s.get("maxKm").isNull() ? Double.POSITIVE_INFINITY : s.get("maxKm").asDouble();
            slabs.add(new FareCalculator.Slab(max, s.get("fare").asInt()));
        }
        return new MetroData(b.build(), new FareCalculator(slabs));
    }

    private static JsonNode read(String path) {
        try (InputStream in = GraphLoader.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) throw new IllegalStateException("Missing resource " + path);
            return MAPPER.readTree(in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
