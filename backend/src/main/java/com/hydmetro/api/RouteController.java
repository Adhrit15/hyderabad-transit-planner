package com.hydmetro.api;

import com.hydmetro.api.Dtos.*;
import com.hydmetro.service.RouteService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * REST controller. It is deliberately thin: it validates input and delegates to {@link RouteService}.
 * Errors propagate as exceptions to {@link GlobalExceptionHandler}, which picks the HTTP status.
 */
@RestController
@RequestMapping("/api")
@Validated
public class RouteController {
    private static final String ID = "^[a-z0-9-]{1,64}$";
    private final RouteService service;

    public RouteController(RouteService service) { this.service = service; }

    @GetMapping("/stations")
    @Operation(summary = "All lines and stations (with coordinates)")
    public StationsResponse stations() { return service.stations(); }

    @GetMapping("/route")
    @Operation(summary = "Find a route", description = "mode = fastest | astar | fewest-transfers | cheapest | pareto")
    public RouteResponse route(
            @RequestParam @NotBlank @Pattern(regexp = ID, message = "must be a station id like 'ameerpet'") String from,
            @RequestParam @NotBlank @Pattern(regexp = ID, message = "must be a station id like 'ameerpet'") String to,
            @Parameter(example = "fastest")
            @RequestParam(defaultValue = "fastest")
            @Pattern(regexp = "fastest|astar|fewest-transfers|cheapest|pareto",
                    message = "must be one of fastest, astar, fewest-transfers, cheapest, pareto") String mode,
            @RequestParam(defaultValue = "false") boolean trace) {
        return service.route(from, to, mode, trace);
    }

    @GetMapping("/compare")
    @Operation(summary = "Run every mode for the same query, with nodes expanded and runtime")
    public CompareResponse compare(
            @RequestParam @NotBlank @Pattern(regexp = ID) String from,
            @RequestParam @NotBlank @Pattern(regexp = ID) String to) {
        return service.compare(from, to);
    }
}
