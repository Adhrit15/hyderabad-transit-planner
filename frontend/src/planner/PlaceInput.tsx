import { useEffect, useMemo, useRef, useState } from 'react';
import { geocode, searchPlaces, type Place } from './places';

interface Props {
  id: string; label: string; accent: string; value: Place | null; index: Place[];
  onChange: (p: Place) => void; onPickOnMap: () => void; picking: boolean; allowLocation?: boolean;
}

const KIND_ICON: Record<Place['kind'], string> = { metro: 'Ⓜ', mmts: '🚆', bus: '🚌', address: '📍', location: '◎', map: '📌' };

export function PlaceInput({ id, label, accent, value, index, onChange, onPickOnMap, picking, allowLocation }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const local = useMemo(() => searchPlaces(index, q), [index, q]);
  const items = remote ?? local;

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as globalThis.Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (p: Place) => { onChange(p); setOpen(false); setQ(''); setRemote(null); setErr(null); };
  const lookup = async () => {
    if (!q.trim()) return;
    setBusy(true); setErr(null);
    try { const r = await geocode(q); setRemote(r); if (!r.length) setErr('No address found in Hyderabad for that search.'); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const locate = () => {
    if (!navigator.geolocation) { setErr('Your browser does not share location.'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setBusy(false); pick({ name: 'My location', lat: pos.coords.latitude, lon: pos.coords.longitude, kind: 'location' }); },
      () => { setBusy(false); setErr('Location permission was denied. Search for a place or pick it on the map.'); },
      { enableHighAccuracy: true, timeout: 10000 });
  };

  return (
    <div className="place" ref={box}>
      <label className="picker-label" htmlFor={id}><span className="dot" style={{ background: accent }} />{label}</label>
      <div className="place-row">
        <input
          id={id} className="picker-input" role="combobox" aria-expanded={open} aria-controls={`${id}-list`} autoComplete="off"
          placeholder={value ? value.name : 'Station, stop or area…'}
          value={open ? q : value?.name ?? ''}
          onFocus={() => { setOpen(true); setQ(''); setRemote(null); setActive(0); }}
          onChange={(e) => { setQ(e.target.value); setRemote(null); setActive(0); setOpen(true); }}
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
            <li key={`${p.name}-${p.lat}`} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
              <span className="pl-name"><span className="pl-icon" aria-hidden>{KIND_ICON[p.kind]}</span>{p.name}</span>
              <span className="pl-detail">{p.detail}</span>
            </li>
          ))}
          {q.trim() && (
            <li className="special" onMouseDown={(e) => { e.preventDefault(); lookup(); }}>
              {busy ? 'Searching addresses…' : `🔎 Search addresses for “${q.trim()}”`}
            </li>
          )}
          {err && <li className="picker-empty">{err}</li>}
        </ul>
      )}
    </div>
  );
}
