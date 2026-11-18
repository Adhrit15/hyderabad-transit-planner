// Data source switch: if VITE_API_URL is set (e.g. http://localhost:8080), the app calls the
// Spring Boot backend. Otherwise it runs the TypeScript port of the engine in the browser, which is
// how the static GitHub Pages demo works with no server at all.
import { localEngine } from './engine/service';
import type { CompareResponse, Mode, RouteResponse, StationsResponse } from './engine/types';

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');

export const backendLabel = API ? `Java API · ${API}` : 'In-browser engine (TypeScript port)';

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.detail ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  stations: (): Promise<StationsResponse> => (API ? get('/api/stations', {}) : Promise.resolve(localEngine.stations())),
  route: (from: string, to: string, mode: Mode, trace: boolean): Promise<RouteResponse> =>
    API ? get('/api/route', { from, to, mode, trace: String(trace) }) : Promise.resolve(localEngine.route(from, to, mode, trace)),
  compare: (from: string, to: string): Promise<CompareResponse> =>
    API ? get('/api/compare', { from, to }) : Promise.resolve(localEngine.compare(from, to)),
};
