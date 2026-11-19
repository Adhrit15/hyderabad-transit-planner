import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadNetwork, type DataStatus, type Network } from './network';
import { istNow, planJourneys, type Journey } from './plan';
import { buildPlaceIndex, type Place } from './places';
import { PlaceInput } from './PlaceInput';
import { PlannerMap } from './PlannerMap';
import { JourneyCard } from './JourneyCard';
import { DataStatusPanel } from './DataStatusPanel';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const toHHMM = (s: number) => `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;

function encodePlace(p: Place) { return `${p.lat.toFixed(5)},${p.lon.toFixed(5)},${encodeURIComponent(p.name)}`; }
function decodePlace(s: string | null): Place | null {
  if (!s) return null;
  const [lat, lon, ...name] = s.split(',');
  return Number.isFinite(+lat) && Number.isFinite(+lon) ? { lat: +lat, lon: +lon, name: decodeURIComponent(name.join(',')) || 'Pinned place', kind: 'map' } : null;
}
function readHash() {
  const p = new URLSearchParams(window.location.hash.replace(/^#(plan)?[&?]?/, ''));
  return { from: decodePlace(p.get('f')), to: decodePlace(p.get('t')) };
}

export default function PlannerApp() {
  const [net, setNet] = useState<Network | null>(null);
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const init = readHash();
  const [from, setFrom] = useState<Place | null>(init.from);
  const [to, setTo] = useState<Place | null>(init.to);
  const now = istNow();
  const [leaveNow, setLeaveNow] = useState(true);
  const [time, setTime] = useState(toHHMM(now.sec));
  const [day, setDay] = useState(Math.log2(now.dayBit));
  const [journeys, setJourneys] = useState<Journey[] | null>(null);
  const [stats, setStats] = useState<{ ms: number } | null>(null);
  const [sel, setSel] = useState(0);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    loadNetwork().then(({ net, status }) => { setNet(net); setStatus(status); })
      .catch((e) => setLoadErr(`Could not load the transit data (${e.message}). Run "npm run data" locally, or try again later.`));
  }, []);
  const index = useMemo(() => (net ? buildPlaceIndex(net) : []), [net]);

  // Sensible demo trip on first visit, so the page opens in a working state.
  useEffect(() => {
    if (!index.length || from || to) return;
    const find = (n: string) => index.find((p) => p.name.toLowerCase() === n.toLowerCase());
    setFrom(find('Miyapur') ?? null);
    setTo(index.find((p) => p.name.toLowerCase().startsWith('charminar')) ?? null);
  }, [index, from, to]);

  const plan = useCallback(() => {
    if (!net || !from || !to) return;
    const t = leaveNow ? istNow() : { sec: +time.slice(0, 2) * 3600 + +time.slice(3, 5) * 60, dayBit: 1 << day };
    const r = planJourneys(net, from, to, t.sec, t.dayBit);
    setJourneys(r.journeys); setStats(r.stats);
    const fastest = r.journeys.findIndex((j) => j.tags.includes('Fastest'));
    setSel(Math.max(0, fastest));
    window.history.replaceState(null, '', `#plan&f=${encodePlace(from)}&t=${encodePlace(to)}`);
  }, [net, from, to, leaveNow, time, day]);

  useEffect(() => { plan(); }, [plan]);

  const onMapPick = picking ? (lat: number, lon: number) => {
    const p: Place = { lat, lon, name: `Pinned ${lat.toFixed(4)}, ${lon.toFixed(4)}`, kind: 'map' };
    if (picking === 'from') setFrom(p); else setTo(p);
    setPicking(null);
  } : null;

  const swap = () => { setFrom(to); setTo(from); };
  const current = journeys?.[sel] ?? null;

  return (
    <div className="app planner">
      <aside className="panel">
        <header className="brand">
          <div className="logo" aria-hidden><span style={{ background: '#e53935' }} /><span style={{ background: '#b45309' }} /><span style={{ background: '#7c3aed' }} /></div>
          <div>
            <h1>Hyderabad Transit Planner</h1>
            <p>Buses, metro, MMTS, autos and cabs in one search, rebuilt daily from official open data</p>
          </div>
        </header>

        {loadErr && <div className="card error" role="alert">⚠️ {loadErr}</div>}
        {!net && !loadErr && <div className="card loading">Loading 5,000+ stops and 47,000 daily trips…</div>}

        {net && (
          <form className="card query" onSubmit={(e) => { e.preventDefault(); plan(); }}>
            <div className="pickers">
              <PlaceInput id="from" label="From" accent="#059669" value={from} index={index} onChange={setFrom}
                onPickOnMap={() => setPicking(picking === 'from' ? null : 'from')} picking={picking === 'from'} allowLocation />
              <button type="button" className="swap" onClick={swap} aria-label="Swap from and to" title="Swap">⇅</button>
              <PlaceInput id="to" label="To" accent="#dc2626" value={to} index={index} onChange={setTo}
                onPickOnMap={() => setPicking(picking === 'to' ? null : 'to')} picking={picking === 'to'} />
            </div>
            {picking && <div className="pick-hint">Click the map to set your {picking === 'from' ? 'start' : 'destination'}.</div>}
            <div className="when">
              <label className="toggle">
                <input type="checkbox" checked={leaveNow} onChange={(e) => setLeaveNow(e.target.checked)} />
                <span className="track"><span className="thumb" /></span>
                Leave now
              </label>
              {!leaveNow && (
                <div className="when-pick">
                  <select id="day" aria-label="Day" value={day} onChange={(e) => setDay(+e.target.value)}>
                    {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                  <input id="time" type="time" aria-label="Departure time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              )}
              <button type="submit" className="primary" disabled={!from || !to}>Plan trip</button>
            </div>
          </form>
        )}

        {journeys && (
          <section className="results" aria-live="polite">
            <div className="results-head">
              <span className="section-title">{journeys.length} options</span>
              {stats && <span className="muted small">searched in {stats.ms} ms on your device</span>}
            </div>
            {journeys.map((j, i) => <JourneyCard key={j.id} j={j} selected={i === sel} onSelect={() => setSel(i)} />)}
          </section>
        )}

        <footer className="foot">
          {status && <button className="link-btn" onClick={() => setShowStatus(true)}>Data sources and freshness →</button>}
          <span>Bus times are mostly estimated: 93% of trips in the official feed have impossible stop times, so they are rebuilt from distance and typical traffic.</span>
          <span>{net?.attribution.join(' · ')} · Map © OpenStreetMap contributors</span>
          <span>Your location and searches stay in your browser. Only address searches are sent to OpenStreetMap Nominatim.</span>
        </footer>
      </aside>

      <main className="map-wrap">
        <PlannerMap from={from} to={to} journey={current} onMapPick={onMapPick} picking={!!picking} />
        {showStatus && status && <DataStatusPanel status={status} onClose={() => setShowStatus(false)} />}
      </main>
    </div>
  );
}
