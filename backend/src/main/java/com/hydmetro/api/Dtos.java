package com.hydmetro.api;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * DTOs (Data Transfer Objects) are the JSON shapes the API returns. They are kept separate from
 * the domain model, so internal classes can change without breaking API clients. The TypeScript
 * engine in frontend/src/engine produces exactly these shapes too.
 */
public final class Dtos {
    private Dtos() { }

    public record LineDto(String id, String name, String color, String from, String to) { }

    public record StationDto(String id, String name, double lat, double lng, List<String> lines,
                             boolean interchange, boolean approximate) { }

    public record StationsResponse(List<LineDto> lines, List<StationDto> stations, double transferMinutes) { }

    public record StationRef(String id, String name) { }

    public record LegDto(String line, String lineName, String color, String towards,
                         List<StationRef> stations, double minutes, double km) { }

    /** One step of the search. Stations are referenced by id; node = (station, line). */
    public record TraceEventDto(String type, String station, String line,
                                String fromStation, String fromLine, double cost, int frontier) { }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RouteResponse(String mode, String modeName, StationRef from, StationRef to, boolean found,
                                double totalMinutes, double km, int transfers, int fare,
                                List<LegDto> legs, List<String> instructions,
                                int nodesExpanded, long runtimeMicros,
                                List<RouteResponse> alternatives, List<TraceEventDto> trace) { }

    public record CompareRow(String mode, String modeName, boolean found, double totalMinutes, double km,
                             int transfers, int fare, int nodesExpanded, long runtimeMicros, List<String> path) { }

    public record CompareResponse(StationRef from, StationRef to, List<CompareRow> results) { }
}
