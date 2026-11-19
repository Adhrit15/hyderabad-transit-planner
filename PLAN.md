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
  * `com.hydmetro.model`: `Station`, `Line`, `Node` (station × line), `Edge`, `Graph`, `GraphLoader`
  * `com.hydmetro.heap`: `BinaryMinHeap` (array plus an index map, so decrease-key runs in O(log n))
  * `com.hydmetro.algo`: `RouteStrategy` interface, plus `Dijkstra`, `AStar`, `ZeroOneBfs`,
    `Cheapest`, `Pareto` and `FloydWarshall` (FloydWarshall is used only by the tests)
  * `com.hydmetro.fare`: `FareCalculator` (distance slabs)
  * `com.hydmetro.api`: Spring Boot controllers, DTOs and the global error handler
  * `com.hydmetro.bench`: `Benchmark` main class (`./gradlew bench`)
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

---

# Phase 2: Hyderabad multimodal planner (bus + metro + MMTS + auto/cab)

## Goal
Point A → point B anywhere in Hyderabad, using any combination of walking, TGSRTC buses, metro,
MMTS, autos and cabs. Options are ranked by arrival time, cost, changes and walking. The data
refreshes itself every day from official open feeds. When a newer or more trusted source appears,
it overrides an older one, and every override is recorded.

## Architecture
```
 official feeds (GTFS)          curated sources (JSON/CSV)       OpenStreetMap (Overpass)
 TGSRTC · HMRL · MMTS           fares 2025 · auto/cab · traffic  auto/taxi stands
          │                               │                             │
          └──────────────► pipeline/ (Node, runs daily in GitHub Actions) ◄┘
                fetch (mirrors, retries, sha256) → snapshot (last-good kept)
                → validate (reject broken data) → normalise (canonical model + provenance)
                → select/merge (per-mode feed choice, attribute overrides, logged)
                → bundle  frontend/public/data/network.json + status.json
                                      │
                         GitHub Pages (static) · browser router (TypeScript)
                RAPTOR over patterns + walking footpaths + auto/cab first/last mile
```
* The scheduled job is the "update engine". If a critical source fails or validation rejects it,
  the job uses the last-good snapshot. If none exists, the job fails, and GitHub Pages keeps
  serving the previous site. Broken data is never published.

## Source registry (`pipeline/sources.json`)
Each source records `id, kind, covers[] (modes or attributes), urls[] (mirrors, in order), licence,
attribution, trust (0–100), critical`. Curated sources also record `effectiveFrom` and `approximate`.

## Merge rules (in order)
1. **Per mode, choose the feed:** among valid feeds covering a mode, prefer one whose calendar is
   active today, then the newest `feed_start_date`, then the highest trust. An expired feed is
   used only when nothing else exists, and every trip from it is flagged `stale`.
2. **Attribute overrides** (fares, coordinates): the most recent `effectiveFrom` wins; ties go to
   higher trust. Example: HMRL GTFS fares (₹10–60, 2017 chart) are overridden by the 2025 chart.
3. Every override and staleness flag is written to `status.json` and shown in the UI.

## Router data model (compact, columnar)
* stops: id, name, lat, lon, mode flags, minimum change time
* RAPTOR routes = trip patterns split so that no trip overtakes another (FIFO). Each has a stop
  sequence, cumulative km and trips (start time + timing profile index).
* Timing profiles hold per-stop arrival and departure offsets (44,892 TGSRTC trips → 7,414 profiles).
* Footpaths are computed in the browser with a grid index (≤ 500 m, 4.5 km/h × 1.3 detour).

## Milestones
P1 plan · P2 pipeline core and tests · P3 bundle and status · P4 RAPTOR and tests · P5 fares,
auto/cab and traffic · P6 planner UI · P7 scheduled workflow · P8 docs and report
