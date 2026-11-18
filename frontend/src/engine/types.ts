// JSON shapes returned by the Spring Boot API (backend/src/main/java/com/hydmetro/api/Dtos.java).
// The in-browser engine returns exactly the same shapes, so the UI does not care which one answered.

export type Mode = 'fastest' | 'astar' | 'fewest-transfers' | 'cheapest' | 'pareto';

export const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: 'fastest', label: 'Fastest', blurb: 'Dijkstra · min minutes' },
  { id: 'astar', label: 'A*', blurb: 'Dijkstra + haversine heuristic' },
  { id: 'fewest-transfers', label: 'Fewest changes', blurb: '0-1 BFS · transfer = 1' },
  { id: 'cheapest', label: 'Cheapest', blurb: 'Fare slabs, ties by time' },
  { id: 'pareto', label: 'Pareto', blurb: 'All best time/transfer trade-offs' },
];

export interface LineDto { id: string; name: string; color: string; from: string; to: string }
export interface StationDto {
  id: string; name: string; lat: number; lng: number; lines: string[]; interchange: boolean; approximate: boolean;
  /** position on each line, 1 = first terminal */
  order: Record<string, number>;
}
export interface StationsResponse { lines: LineDto[]; stations: StationDto[]; transferMinutes: number }
export interface StationRef { id: string; name: string }
export interface LegDto {
  line: string; lineName: string; color: string; towards: string; stations: StationRef[]; minutes: number; km: number;
}
export interface TraceEventDto {
  type: 'settle' | 'relax'; station: string; line: string; fromStation: string | null; fromLine: string | null;
  cost: number; frontier: number;
}
export interface RouteResponse {
  mode: Mode; modeName: string; from: StationRef; to: StationRef; found: boolean;
  totalMinutes: number; km: number; transfers: number; fare: number;
  legs: LegDto[]; instructions: string[]; nodesExpanded: number; runtimeMicros: number;
  alternatives?: RouteResponse[]; trace?: TraceEventDto[];
}
export interface CompareRow {
  mode: Mode; modeName: string; found: boolean; totalMinutes: number; km: number; transfers: number; fare: number;
  nodesExpanded: number; runtimeMicros: number; path: string[];
}
export interface CompareResponse { from: StationRef; to: StationRef; results: CompareRow[] }
