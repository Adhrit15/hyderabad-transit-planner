import type { CompareResponse, Mode } from '../engine/types';

interface Props {
  data: CompareResponse;
  onVisualise: (mode: Mode) => void;
}

export function ComparePanel({ data, onVisualise }: Props) {
  const max = Math.max(...data.results.map((r) => r.nodesExpanded), 1);
  const dij = data.results.find((r) => r.mode === 'fastest');
  const astar = data.results.find((r) => r.mode === 'astar');
  const saved = dij && astar && dij.nodesExpanded > 0 ? Math.round((1 - astar.nodesExpanded / dij.nodesExpanded) * 100) : 0;

  return (
    <div className="compare">
      {dij && astar && (
        <div className="card headline">
          <div className="section-title">Dijkstra vs A*</div>
          <div className="duel">
            <div><strong>{dij.nodesExpanded}</strong><span>nodes · Dijkstra</span></div>
            <div className="vs">vs</div>
            <div><strong>{astar.nodesExpanded}</strong><span>nodes · A*</span></div>
          </div>
          <p className="muted small">
            Both find the same {dij.totalMinutes}-minute route. A*'s haversine heuristic steers it toward {data.to.name},
            so it settles <b>{saved}% fewer</b> nodes. On a small, linear metro the saving is modest. On a large grid it
            is about 21% (see the benchmark in the README).
          </p>
          <div className="duel-actions">
            <button className="ghost" onClick={() => onVisualise('fastest')}>▶ Watch Dijkstra</button>
            <button className="ghost" onClick={() => onVisualise('astar')}>▶ Watch A*</button>
          </div>
        </div>
      )}

      <div className="section-title">All modes · {data.from.name} → {data.to.name}</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Mode</th><th>Time</th><th>Changes</th><th>Fare</th><th>Nodes expanded</th><th>µs</th></tr>
          </thead>
          <tbody>
            {data.results.map((r) => (
              <tr key={r.mode}>
                <td>{r.modeName}</td>
                <td>{r.found ? `${r.totalMinutes} min` : '—'}</td>
                <td>{r.found ? r.transfers : '—'}</td>
                <td>{r.found ? `₹${r.fare}` : '—'}</td>
                <td>
                  <div className="bar"><span style={{ width: `${(r.nodesExpanded / max) * 100}%` }} /></div>
                  {r.nodesExpanded}
                </td>
                <td>{r.runtimeMicros}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Runtime is the best of 5 runs. On a 59-node graph every mode finishes in microseconds, so “nodes expanded” is the fairer measure of work.</p>
    </div>
  );
}
