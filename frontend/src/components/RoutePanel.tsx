import type { RouteResponse } from '../engine/types';

interface Props {
  route: RouteResponse;
  selectedAlt: number;
  onSelectAlt: (i: number) => void;
  transferMinutes: number;
}

export function RoutePanel({ route, selectedAlt, onSelectAlt, transferMinutes }: Props) {
  const alts = route.alternatives;
  const r = alts ? alts[selectedAlt] ?? route : route;

  if (!r.found) {
    return <div className="card empty">🚫 {r.instructions[0]}</div>;
  }

  return (
    <div className="route">
      {alts && alts.length > 1 && (
        <div className="alts">
          <div className="section-title">Pareto front · {alts.length} non-dominated routes</div>
          <div className="alt-list">
            {alts.map((a, i) => (
              <button key={i} className={`alt ${i === selectedAlt ? 'on' : ''}`} onClick={() => onSelectAlt(i)}>
                <strong>{a.totalMinutes} min</strong>
                <span>{a.transfers} change{a.transfers === 1 ? '' : 's'} · ₹{a.fare}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="stats">
        <Stat value={`${r.totalMinutes}`} unit="min" label="Travel time" />
        <Stat value={`₹${r.fare}`} label="Fare" />
        <Stat value={`${r.transfers}`} label={r.transfers === 1 ? 'Change' : 'Changes'} />
        <Stat value={`${r.km}`} unit="km" label="Distance" />
      </div>

      <ol className="timeline">
        {r.legs.map((leg, i) => (
          <li key={i}>
            {i > 0 && (
              <div className="transfer">⇄ Change at <b>{leg.stations[0].name}</b> · ~{transferMinutes} min walk + wait</div>
            )}
            <div className="leg" style={{ ['--c' as string]: leg.color }}>
              <div className="leg-head">
                <span className="pill" style={{ background: leg.color }}>{leg.lineName}</span>
                <span className="muted">towards {leg.towards}</span>
                <span className="leg-time">{leg.minutes} min</span>
              </div>
              <div className="leg-stops">
                <b>{leg.stations[0].name}</b>
                {leg.stations.length > 2 && (
                  <details>
                    <summary>{leg.stations.length - 2} intermediate stop{leg.stations.length === 3 ? '' : 's'}</summary>
                    <ul>{leg.stations.slice(1, -1).map((s) => <li key={s.id}>{s.name}</li>)}</ul>
                  </details>
                )}
                <b>{leg.stations[leg.stations.length - 1].name}</b>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <details className="instructions">
        <summary>Step-by-step instructions</summary>
        <ol>{r.instructions.map((s, i) => <li key={i}>{s}</li>)}</ol>
      </details>

      <div className="algo-meta">
        <span>{route.modeName}</span>
        <span>{route.nodesExpanded} nodes expanded</span>
        <span>{route.runtimeMicros} µs</span>
      </div>
    </div>
  );
}

function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}{unit && <small> {unit}</small>}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
