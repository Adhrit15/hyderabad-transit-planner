import { useEffect, useMemo, useRef, useState } from 'react';
import { geocode, mergeResults, photonSearch, searchPlaces, type Place } from './places';

interface Props {
  id: string; label: string; accent: string; value: Place | null; index: Place[];
  onChange: (p: Place) => void; onPickOnMap: () => void; picking: boolean; allowLocation?: boolean;
}

const KIND_ICON: Record<Place['kind'], string> = { metro: 'Ⓜ', mmts: '🚆', bus: '🚌', area: '🏘', landmark: '📍', address: '🔎', location: '◎', map: '📌' };
const LIVE_DELAY_MS = 350;

export function PlaceInput({ id, label, accent, value, index, onChange, onPickOnMap, picking, allowLocation }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [live, setLive] = useState<Place[]>([]);
  const [liveState, setLiveState] = useState<'idle' | 'loading' | 'done' | 'offline'>('idle');
  const [deep, setDeep] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const local = useMemo(() => searchPlaces(index, q, 8), [index, q]);
  const items = useMemo(() => deep ?? mergeResults(local, live), [deep, local, live]);
  const firstLive = deep ? -1 : local.length;

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as globalThis.Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // Live suggestions while typing, debounced; stale requests are cancelled.
  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 3) { setLive([]); setLiveState('idle'); return; }
    const ctl = new AbortController();
    setLiveState('loading');
    const t = setTimeout(() => {
      photonSearch(term, ctl.signal)
        .then((r) => { setLive(r); setLiveState('done'); })
        .catch((e) => { if (e.name !== 'AbortError') { setLive([]); setLiveState('offline'); } });
    }, LIVE_DELAY_MS);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open]);

  const pick = (p: Place) => { onChange(p); setOpen(false); setQ(''); setLive([]); setDeep(null); setErr(null); };
  const lookup = async () => {
    if (!q.trim()) return;
    setBusy(true); setErr(null);
    try { const r = await geocode(q); setDeep(r); if (!r.length) setErr('No match in Hyderabad. Try a nearby landmark, or pin it on the map with 📌.'); }
    catch { setErr('Address search is unavailable here. Pick a nearby stop or landmark, or pin the place on the map with 📌.'); }
    finally { setBusy(false); }
  };
  const locate = () => {
    if (!navigator.geolocation) { setErr('Your browser does not share location.'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setBusy(false); pick({ name: 'My location', lat: pos.coords.latitude, lon: pos.coords.longitude, kind: 'location' }); },
      () => { setBusy(false); setErr('Location permission was denied. Search for a place or pin it on the map.'); },
      { enableHighAccuracy: true, timeout: 10000 });
  };

  return (
    <div className="place" ref={box}>
      <label className="picker-label" htmlFor={id}><span className="dot" style={{ background: accent }} />{label}</label>
      <div className="place-row">
        <input
          id={id} className="picker-input" role="combobox" aria-expanded={open} aria-controls={`${id}-list`} autoComplete="off"
          placeholder={value ? value.name : 'Area, landmark, stop or address…'}
          value={open ? q : value?.name ?? ''}
          onFocus={() => { setOpen(true); setQ(''); setDeep(null); setActive(0); }}
          onChange={(e) => { setQ(e.target.value); setDeep(null); setActive(0); setOpen(true); setErr(null); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) pick(items[active]); else lookup(); }
            else if (e.key === 'Escape') setOpen(false);
          }}
        />
        <button type="button" className={`icon-btn ${picking ? 'on' : ''}`} onClick={onPickOnMap} title="Pick on the map" aria-label={`Pick ${label} on the map`}>📌</button>
      </div>
      {open && (
        <ul className="picker-list" id={`${id}-list`} role="listbox">
          {allowLocation && !q && <li className="special" onMouseDown={(e) => { e.preventDefault(); locate(); }}>◎ Use my current location</li>}
          {items.map((p, i) => (
            <li key={`${p.kind}-${p.name}-${p.lat}`} role="option" aria-selected={i === active}
              className={`${i === active ? 'active' : ''} ${i === firstLive ? 'group-start' : ''}`}
              data-group={i === firstLive ? 'More places · OpenStreetMap' : undefined}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
              <span className="pl-name"><span className="pl-icon" aria-hidden>{p.icon ?? KIND_ICON[p.kind]}</span>{p.name}</span>
              <span className="pl-detail">{p.detail}</span>
            </li>
          ))}
          {q.trim().length >= 3 && liveState === 'loading' && <li className="picker-empty">Searching more places…</li>}
          {q.trim() && !items.length && liveState !== 'loading' && !err && (
            <li className="picker-empty">No stop or place called “{q.trim()}”.</li>
          )}
          {q.trim() && !deep && (
            <li className="special" onMouseDown={(e) => { e.preventDefault(); lookup(); }}>
              {busy ? 'Searching addresses…' : `🔎 Search full addresses for “${q.trim()}”`}
            </li>
          )}
          <li className="special" onMouseDown={(e) => { e.preventDefault(); setOpen(false); onPickOnMap(); }}>📌 Pick the exact spot on the map</li>
          {err && <li className="picker-empty">{err}</li>}
        </ul>
      )}
    </div>
  );
}
