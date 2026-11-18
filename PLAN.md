# PLAN: Hyderabad Metro Route Planner

## Goal
A full-stack route planner for the Hyderabad Metro (Red, Blue and Green lines) that shows its
graph algorithms working: fastest, A*, fewest transfers, cheapest and Pareto. A search visualiser
animates them on a map. The project is also meant for learning, so REPORT.md explains every part.

## Architecture

```
frontend/  React + Vite + Leaflet  ──HTTP──▶  backend/  Spring Boot REST API
     │                                              │
     └─ src/engine/ (TypeScript port of the          └─ engine (plain Java, no libraries)
        engine, used when no backend URL is             graph, BinaryMinHeap, strategies
        configured, so the site can be hosted
        statically on GitHub Pages)
```

* **backend/** (Gradle, Java 17 target)
  * `in.metro.model`: `Station`, `Line`, `Node` (station × line), `Edge`, `Graph`, `GraphLoader`
  * `in.metro.heap`: `BinaryMinHeap` (array plus an index map, so decrease-key runs in O(log n))
  * `in.metro.algo`: `RouteStrategy` interface, plus `Dijkstra`, `AStar`, `ZeroOneBfs`,
    `Cheapest`, `Pareto` and `FloydWarshall` (FloydWarshall is used only by the tests)
  * `in.metro.fare`: `FareCalculator` (distance slabs)
  * `in.metro.api`: Spring Boot controllers, DTOs and the global error handler
  * `in.metro.bench`: `Benchmark` main class (`./gradlew bench`)
* **frontend/**: Vite + React + react-leaflet. It has a map, pickers, a route panel, a trace
  visualiser and a compare view.
* **.github/workflows/**: CI (Gradle test + frontend build) and a GitHub Pages deploy.

## Data model
* `stations.json`: `{id, name, lines:[{line, order}], lat, lng, approximate}`
* `edges.json`: `{from, to, line, km, minutes, approximate}` between neighbouring stations
  (undirected)
* `fares.json`: distance slabs `[{maxKm, fare}]`
* Graph nodes are `(stationId, line)` pairs. Ride edges link neighbouring nodes on the same line.
  Transfer edges link two nodes of the same station on different lines and cost
  `transferMinutes` (default 5).
  Each query adds a virtual SOURCE node, linked to every node of the origin station at cost 0,
  and a virtual TARGET node, reached from every node of the destination station at cost 0.

## Milestones (one commit each, roughly)
1. Scaffolding: PLAN, .gitignore, Gradle wrapper
2. Data: stations, edges, fares and DATA_SOURCES.md
3. Model, graph and loader
4. BinaryMinHeap and its tests
5. Dijkstra, A*, 0-1 BFS, Cheapest, Pareto, trace, and Floyd-Warshall tests
6. Benchmark
7. REST API, error handling and OpenAPI
8. Frontend: map, route, visualiser, compare
9. CI, Docker and Pages deploy
10. README and REPORT finalised
