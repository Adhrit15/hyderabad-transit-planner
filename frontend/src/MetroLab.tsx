import { useCallback, useEffect, useState } from 'react';
import { api, backendLabel } from './api';
import { MODES, type CompareResponse, type Mode, type RouteResponse, type StationsResponse } from './engine/types';
import { StationPicker } from './components/StationPicker';
import { MetroMap } from './components/MetroMap';
import { RoutePanel } from './components/RoutePanel';
import { ComparePanel } from './components/ComparePanel';
import { VisualiserControls } from './components/VisualiserControls';
import { useTracePlayer } from './components/useTracePlayer';

// Set VITE_REPO_URL at build time (the Pages workflow does it automatically) to show a source link.
const REPO_URL = import.meta.env.VITE_REPO_URL as string | undefined;

function readUrl() {
  const p = new URLSearchParams(window.location.hash.replace(/^#\??/, ''));
  return {
    from: p.get('from') ?? 'raidurg',
    to: p.get('to') ?? 'mg-bus-station',
    mode: (MODES.some((m) => m.id === p.get('mode')) ? p.get('mode') : 'fastest') as Mode,
  };
}

export default function App() {
  const initial = readUrl();
  const [meta, setMeta] = useState<StationsResponse | null>(null);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [tab, setTab] = useState<'route' | 'compare'>('route');
  const [showSearch, setShowSearch] = useState(false);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [compare, setCompare] = useState<CompareResponse | null>(null);
  const [alt, setAlt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const player = useTracePlayer(route?.trace && showSearch ? route.trace : EMPTY);

  useEffect(() => { api.stations().then(setMeta).catch((e) => setError(String(e.message ?? e))); }, []);

  const find = useCallback(async (m: Mode = mode, f = from, t = to) => {
    setLoading(true); setError(null);
    try {
      const [r, c] = await Promise.all([api.route(f, t, m, true), api.compare(f, t)]);
      setRoute(r); setCompare(c); setAlt(0);
      window.history.replaceState(null, '', `#from=${f}&to=${t}&mode=${m}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [mode, from, to]);

  // Compute the default route once stations are loaded, so visitors see something immediately.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (meta) find(); }, [meta]);

  // Shared links (#from=..&to=..&mode=..) pasted into an open tab only change the hash.
  useEffect(() => {
    const onHash = () => { const u = readUrl(); setFrom(u.from); setTo(u.to); setMode(u.mode); find(u.mode, u.from, u.to); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [find]);

  const visualise = (m: Mode) => { setMode(m); setShowSearch(true); setTab('route'); find(m); };
  const swap = () => { setFrom(to); setTo(from); };
  const pick = (role: 'from' | 'to', id: string) => {
    if (role === 'from') { setFrom(id); find(mode, id, to); } else { setTo(id); find(mode, from, id); }
  };

  const shownRoute = route?.alternatives ? route.alternatives[alt] ?? route : route;
  const visualising = showSearch && !!route?.trace?.length;

  return (
    <div className="app">
      <aside className="panel">
        <header className="brand">
          <div className="logo" aria-hidden>
            <span style={{ background: '#e53935' }} /><span style={{ background: '#1e88e5' }} /><span style={{ background: '#43a047' }} />
          </div>
          <div>
            <h1>Hyderabad Metro Route Planner</h1>
            <p>Dijkstra · A* · 0-1 BFS · Pareto: watch them search, step by step</p>
          </div>
        </header>

        {meta && (
          <form className="card query" onSubmit={(e) => { e.preventDefault(); find(); }}>
            <div className="pickers">
              <StationPicker label="From" value={from} stations={meta.stations} lines={meta.lines} onChange={setFrom} accent="#059669" />
              <button type="button" className="swap" onClick={swap} aria-label="Swap from and to" title="Swap">⇅</button>
              <StationPicker label="To" value={to} stations={meta.stations} lines={meta.lines} onChange={setTo} accent="#dc2626" />
            </div>
            <div className="modes" role="radiogroup" aria-label="Routing mode">
              {MODES.map((m) => (
                <button type="button" key={m.id} role="radio" aria-checked={mode === m.id}
                  className={`mode ${mode === m.id ? 'on' : ''}`} onClick={() => { setMode(m.id); find(m.id); }} title={m.blurb}>
                  <strong>{m.label}</strong><span>{m.blurb}</span>
                </button>
              ))}
            </div>
            <div className="actions">
              <label className="toggle">
                <input type="checkbox" checked={showSearch} onChange={(e) => setShowSearch(e.target.checked)} />
                <span className="track"><span className="thumb" /></span>
                Show search
              </label>
              <button type="submit" className="primary" disabled={loading || from === '' || to === ''}>
                {loading ? 'Searching…' : 'Find route'}
              </button>
            </div>
          </form>
        )}

        {error && <div className="card error" role="alert">⚠️ {error}</div>}

        {visualising && <VisualiserControls player={player} total={route!.trace!.length} />}

        {route && (
          <>
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'route'} className={tab === 'route' ? 'on' : ''} onClick={() => setTab('route')}>Route</button>
              <button role="tab" aria-selected={tab === 'compare'} className={tab === 'compare' ? 'on' : ''} onClick={() => setTab('compare')}>Compare algorithms</button>
            </div>
            {tab === 'route' && meta && (
              <RoutePanel route={route} selectedAlt={alt} onSelectAlt={setAlt} transferMinutes={meta.transferMinutes} />
            )}
            {tab === 'compare' && compare && <ComparePanel data={compare} onVisualise={visualise} />}
          </>
        )}

        <footer className="foot">
          <span>Engine: {backendLabel}</span>
          <span>Station order & fares (May 2025) verified · coordinates & segment times approximate</span>
          {REPO_URL && <a href={REPO_URL} target="_blank" rel="noreferrer">Source code & learning report ↗</a>}
        </footer>
      </aside>

      <main className="map-wrap">
        {meta && (
          <MetroMap
            lines={meta.lines}
            stations={meta.stations}
            from={from}
            to={to}
            legs={shownRoute?.found ? shownRoute.legs : null}
            trace={visualising ? player.state : null}
            showRoute={!visualising || player.done}
            onPick={pick}
          />
        )}
        <div className="map-legend">
          {meta?.lines.map((l) => (
            <span key={l.id}><i style={{ background: l.color }} />{l.name}</span>
          ))}
        </div>
      </main>
    </div>
  );
}

const EMPTY: never[] = [];
