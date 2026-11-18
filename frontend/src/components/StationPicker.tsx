import { useEffect, useMemo, useRef, useState } from 'react';
import type { LineDto, StationDto } from '../engine/types';

interface Props {
  label: string;
  value: string;
  stations: StationDto[];
  lines: LineDto[];
  onChange: (id: string) => void;
  accent: string;
}

/** Searchable combobox: type to filter, use the arrow keys and Enter to pick. Accessible (ARIA combobox). */
export function StationPicker({ label, value, stations, lines, onChange, accent }: Props) {
  const selected = stations.find((s) => s.id === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = `list-${label.replace(/\W/g, '')}`;
  const colorOf = (id: string) => lines.find((l) => l.id === id)?.color ?? '#888';

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? stations.filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(q)) : stations;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [query, stations]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as globalThis.Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (s: StationDto) => { onChange(s.id); setQuery(''); setOpen(false); };

  return (
    <div className="picker" ref={boxRef}>
      <label className="picker-label" htmlFor={`${listId}-input`}>
        <span className="dot" style={{ background: accent }} />{label}
      </label>
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className="picker-input"
        placeholder={selected?.name ?? 'Search station…'}
        value={open ? query : selected?.name ?? ''}
        onFocus={() => { setOpen(true); setQuery(''); setActive(0); }}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); pick(matches[active]); (e.target as HTMLInputElement).blur(); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <ul className="picker-list" id={listId} role="listbox">
          {matches.length === 0 && <li className="picker-empty">No station matches “{query}”</li>}
          {matches.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
            >
              <span>{s.name}</span>
              <span className="chips">
                {s.lines.map((l) => <span key={l} className="chip" style={{ background: colorOf(l) }} />)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
