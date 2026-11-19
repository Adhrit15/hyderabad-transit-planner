import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Pane, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import type { LegDto, LineDto, StationDto } from '../engine/types';
import type { TraceState } from './useTracePlayer';

interface Props {
  lines: LineDto[];
  stations: StationDto[];
  from: string;
  to: string;
  legs: LegDto[] | null;
  trace: TraceState | null;
  showRoute: boolean;
  onPick: (role: 'from' | 'to', id: string) => void;
}

// VITE_TILES=off builds a schematic map with no external tile requests (for sandboxed hosts).
const TILES = import.meta.env.VITE_TILES !== 'off';

const SEARCH = { settled: '#f59e0b', frontier: '#8b5cf6', current: '#111827', tree: '#f59e0b' };

function FitTo({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.flyToBounds(bounds, { padding: [48, 48], duration: 0.6, maxZoom: 14 });
  }, [bounds, map]);
  return null;
}

export function MetroMap({ lines, stations, from, to, legs, trace, showRoute, onPick }: Props) {
  const byId = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const pos = (id: string): LatLngExpression => { const s = byId.get(id)!; return [s.lat, s.lng]; };

  // Each line's polyline: its stations sorted by their position on that line.
  const linePaths = useMemo(() => lines.map((l) => ({
    line: l,
    points: stations.filter((s) => s.order[l.id] != null)
      .sort((a, b) => a.order[l.id] - b.order[l.id])
      .map((s) => [s.lat, s.lng] as [number, number]),
  })), [lines, stations]);

  const routeIds = useMemo(() => new Set(legs?.flatMap((l) => l.stations.map((s) => s.id)) ?? []), [legs]);
  const allBounds = useMemo<LatLngBoundsExpression | null>(
    () => (stations.length ? stations.map((s) => [s.lat, s.lng] as [number, number]) : null), [stations]);
  const routeBounds = useMemo<LatLngBoundsExpression | null>(
    () => (legs && legs.length ? legs.flatMap((l) => l.stations.map((s) => pos(s.id) as [number, number])) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [legs]);

  const dimLines = (showRoute && !!legs?.length) || !!trace;

  return (
    <MapContainer center={[17.42, 78.47]} zoom={12} className={TILES ? 'map' : 'map schematic'} zoomControl={false} preferCanvas={false}>
      {TILES && <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />}
      <FitTo bounds={routeBounds ?? allBounds} />

      <Pane name="lines" style={{ zIndex: 410 }}>
        {linePaths.map(({ line, points }) => (
          <Polyline key={line.id} positions={points}
            pathOptions={{ color: line.color, weight: 6, opacity: dimLines ? 0.28 : 0.9, lineCap: 'round', lineJoin: 'round' }} />
        ))}
      </Pane>

      {trace && (
        <Pane name="search" style={{ zIndex: 420 }}>
          {trace.treeEdges.map(([a, b], i) => (
            <Polyline key={i} positions={[pos(a), pos(b)]} pathOptions={{ color: SEARCH.tree, weight: 4, opacity: 0.85, dashArray: '2 6' }} />
          ))}
        </Pane>
      )}

      {showRoute && legs && (
        <Pane name="route" style={{ zIndex: 430 }}>
          {legs.map((leg, i) => (
            <Polyline key={`c${i}`} positions={leg.stations.map((s) => pos(s.id))}
              pathOptions={{ color: '#ffffff', weight: 14, opacity: 1, lineCap: 'round', lineJoin: 'round' }} />
          ))}
          {legs.map((leg, i) => (
            <Polyline key={`r${i}`} positions={leg.stations.map((s) => pos(s.id))}
              pathOptions={{ color: leg.color, weight: 8, opacity: 1, lineCap: 'round', lineJoin: 'round' }} />
          ))}
        </Pane>
      )}

      <Pane name="stations" style={{ zIndex: 440 }}>
        {stations.map((s) => {
          const isEnd = s.id === from || s.id === to;
          const settled = trace?.settledStations.has(s.id);
          const frontier = trace?.frontierStations.has(s.id);
          const current = trace?.current === s.id;
          const onRoute = showRoute && routeIds.has(s.id);
          const lineColor = lines.find((l) => l.id === s.lines[0])?.color ?? '#555';
          let fill = '#ffffff', stroke = s.interchange ? '#1f2937' : lineColor, radius = s.interchange ? 6.5 : 4.5, weight = 2.5;
          if (onRoute) { radius += 1; }
          if (frontier) { fill = SEARCH.frontier; stroke = '#ede9fe'; radius = 7; weight = 3; }
          if (settled) { fill = SEARCH.settled; stroke = '#78350f'; radius = 6.5; }
          if (current) { fill = SEARCH.current; stroke = '#fbbf24'; radius = 9; weight = 4; }
          if (isEnd) { fill = s.id === from ? '#059669' : '#dc2626'; stroke = '#ffffff'; radius = 10; weight = 3.5; }
          return (
            <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={radius}
              pathOptions={{ color: stroke, fillColor: fill, fillOpacity: 1, weight, opacity: !dimLines || onRoute || isEnd || settled || frontier || s.interchange ? 1 : 0.55 }}>
              <Tooltip direction="top" offset={[0, -6]} permanent={isEnd} className={isEnd ? 'tip-end' : ''}>
                {s.name}{s.interchange ? ' ⇄' : ''}
              </Tooltip>
              <Popup>
                <div className="popup">
                  <strong>{s.name}</strong>
                  <div className="popup-lines">
                    {s.lines.map((l) => { const ln = lines.find((x) => x.id === l)!; return <span key={l} style={{ background: ln.color }}>{ln.name}</span>; })}
                  </div>
                  <div className="popup-actions">
                    <button onClick={() => onPick('from', s.id)}>Start here</button>
                    <button onClick={() => onPick('to', s.id)}>Go here</button>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </Pane>
    </MapContainer>
  );
}
