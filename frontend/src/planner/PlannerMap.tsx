import { useEffect } from 'react';
import { CircleMarker, MapContainer, Pane, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import type { Journey } from './plan';
import type { Place } from './places';

const TILES = import.meta.env.VITE_TILES !== 'off';

function Fit({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => { if (bounds) map.flyToBounds(bounds, { padding: [56, 56], duration: 0.6, maxZoom: 15 }); }, [bounds, map]);
  return null;
}

function ClickToPick({ onPick }: { onPick: ((lat: number, lon: number) => void) | null }) {
  useMapEvents({ click: (e) => onPick?.(e.latlng.lat, e.latlng.lng) });
  return null;
}

export function PlannerMap({ from, to, journey, onMapPick, picking }: {
  from: Place | null; to: Place | null; journey: Journey | null;
  onMapPick: ((lat: number, lon: number) => void) | null; picking: boolean;
}) {
  const pts: [number, number][] = [];
  if (journey) for (const l of journey.legs) { pts.push([l.from.lat, l.from.lon]); for (const s of l.stops ?? []) pts.push([s.lat, s.lon]); pts.push([l.to.lat, l.to.lon]); }
  else { if (from) pts.push([from.lat, from.lon]); if (to) pts.push([to.lat, to.lon]); }
  const bounds = pts.length >= 2 ? (pts as LatLngBoundsExpression) : null;

  return (
    <MapContainer center={[17.405, 78.47]} zoom={12} className={`map ${TILES ? '' : 'schematic'} ${picking ? 'picking' : ''}`} zoomControl={false}>
      {TILES && <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />}
      <Fit bounds={bounds} />
      <ClickToPick onPick={onMapPick} />
      <Pane name="journey" style={{ zIndex: 430 }}>
        {journey?.legs.map((l, i) => {
          const line: LatLngExpression[] = l.stops?.length ? l.stops.map((s) => [s.lat, s.lon]) : [[l.from.lat, l.from.lon], [l.to.lat, l.to.lon]];
          const transit = l.kind === 'bus' || l.kind === 'metro' || l.kind === 'mmts';
          return (
            <span key={i}>
              {transit && <Polyline positions={line} pathOptions={{ color: '#fff', weight: 11, opacity: 1 }} />}
              <Polyline positions={line} pathOptions={{
                color: l.kind === 'walk' ? '#475569' : l.color, weight: transit ? 6 : 4, opacity: 0.95,
                dashArray: transit ? undefined : l.kind === 'walk' ? '2 8' : '10 8', lineCap: 'round',
              }} />
              {transit && l.stops?.map((s, k) => (
                <CircleMarker key={k} center={[s.lat, s.lon]} radius={k === 0 || k === l.stops!.length - 1 ? 5 : 2.5}
                  pathOptions={{ color: l.color, fillColor: '#fff', fillOpacity: 1, weight: 2 }}>
                  <Tooltip direction="top">{s.name}</Tooltip>
                </CircleMarker>
              ))}
            </span>
          );
        })}
      </Pane>
      <Pane name="ends" style={{ zIndex: 440 }}>
        {from && <CircleMarker center={[from.lat, from.lon]} radius={10} pathOptions={{ color: '#fff', weight: 3, fillColor: '#059669', fillOpacity: 1 }}><Tooltip permanent direction="top" className="tip-end">{from.name}</Tooltip></CircleMarker>}
        {to && <CircleMarker center={[to.lat, to.lon]} radius={10} pathOptions={{ color: '#fff', weight: 3, fillColor: '#dc2626', fillOpacity: 1 }}><Tooltip permanent direction="top" className="tip-end">{to.name}</Tooltip></CircleMarker>}
      </Pane>
    </MapContainer>
  );
}
