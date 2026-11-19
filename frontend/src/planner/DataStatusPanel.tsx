import type { DataStatus } from './network';

const STATE_LABEL: Record<string, string> = {
  fresh: 'Updated today', cached: 'Cached copy', 'last-good': 'Last good copy', failed: 'Unavailable', manual: 'Curated',
};

const ago = (iso?: string) => {
  if (!iso) return '';
  const h = (Date.now() - Date.parse(iso)) / 3.6e6;
  return h < 1 ? 'less than an hour ago' : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
};
const ymd = (s?: string) => (s && s.length === 8 ? `${s.slice(6)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : s ?? '');

export function DataStatusPanel({ status, onClose }: { status: DataStatus; onClose: () => void }) {
  const feeds = status.sources.filter((s) => s.kind === 'gtfs' || s.kind === 'overpass');
  const curated = status.sources.filter((s) => s.kind === 'manual');
  return (
    <div className="status-panel" role="dialog" aria-label="Data sources">
      <div className="status-head">
        <div>
          <h2>Where this data comes from</h2>
          <p className="muted small">Rebuilt {ago(status.generatedAt)} · {status.network.stops.toLocaleString()} stops · {status.network.routes.toLocaleString()} routes · {status.network.trips.toLocaleString()} trips</p>
        </div>
        <button className="ghost" onClick={onClose}>Close</button>
      </div>

      <div className="section-title">Timetables</div>
      {feeds.map((s) => (
        <div key={s.id} className="src">
          <div className="src-top">
            <strong>{s.name}</strong>
            <span className={`state state-${s.state}`}>{STATE_LABEL[s.state] ?? s.state}</span>
          </div>
          <div className="muted small">
            {s.counts && Object.entries(s.counts).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(' · ')}
            {s.validTo && <> · valid {ymd(s.validFrom)} – {ymd(s.validTo)}</>}
            {s.fetchedAt && <> · fetched {ago(s.fetchedAt)}</>}
          </div>
          {s.warnings?.map((w, i) => <div key={i} className="src-warn">⚠ {w}</div>)}
          {s.homepage && <a className="small" href={s.homepage} target="_blank" rel="noreferrer">Source ↗</a>}
        </div>
      ))}

      <div className="section-title">Fares and estimates</div>
      {curated.map((s) => (
        <div key={s.id} className="src">
          <div className="src-top">
            <strong>{s.id.replace(/-/g, ' ')}</strong>
            <span className={`state ${s.approximate ? 'state-approx' : 'state-fresh'}`}>{s.approximate ? 'Approximate' : 'Verified'}</span>
          </div>
          {s.note && <div className="muted small">{s.note}</div>}
          {s.effectiveFrom && <div className="muted small">Effective from {s.effectiveFrom}</div>}
          {s.links?.map((l) => <a key={l} className="small src-link" href={l} target="_blank" rel="noreferrer">{new URL(l).hostname} ↗</a>)}
        </div>
      ))}

      {status.decisions.length > 0 && <>
        <div className="section-title">Automatic corrections</div>
        {status.decisions.map((d, i) => <div key={i} className="src small">✔ <b>{d.winner}</b> overrides <b>{d.loser}</b>: {d.reason}</div>)}
      </>}
      {status.changes.length > 0 && <>
        <div className="section-title">Changes since the previous update</div>
        <ul className="small changes">{status.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
      </>}
    </div>
  );
}
