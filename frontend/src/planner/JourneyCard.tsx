import type { Journey, Leg } from './plan';
import { modeLabel } from './plan';
import { fmtDur, fmtTime } from './format';

/** HMRL route ids look like "C1_RED"; riders know them as the Red/Blue/Green Line. */
const metroLineName = (r?: string) => {
  const c = r?.split('_').pop()?.toLowerCase();
  return c ? `${c[0].toUpperCase()}${c.slice(1)} Line` : 'Metro';
};
const money =(c: { min: number; max: number }) => (c.max === 0 ? 'Free' : c.min === c.max ? `₹${c.min}` : `₹${c.min}–${c.max}`);
const ICON: Record<string, string> = { walk: '🚶', auto: '🛺', cab: '🚕', bus: '🚌', metro: 'Ⓜ', mmts: '🚆' };

export function JourneyCard({ j, selected, onSelect }: { j: Journey; selected: boolean; onSelect: () => void }) {
  const total = Math.max(1, j.arriveSec - j.departSec);
  return (
    <article className={`journey ${selected ? 'on' : ''}`}>
      <button className="journey-head" onClick={onSelect} aria-expanded={selected}>
        <div className="j-top">
          <div className="j-times"><strong>{fmtTime(j.departSec)} → {fmtTime(j.arriveSec)}</strong><span>{fmtDur(j.arriveSec - j.departSec)}</span></div>
          <div className="j-cost">{money(j.cost)}</div>
        </div>
        <div className="strip" aria-hidden>
          {j.legs.map((l, i) => (
            <span key={i} className={`seg seg-${l.kind}`} style={{ flexGrow: Math.max(0.06, (l.arrSec - l.depSec) / total), background: l.kind === 'walk' ? undefined : l.color }}>
              {(l.arrSec - l.depSec) / total > 0.12 && <em>{ICON[l.kind]} {l.kind === "metro" ? metroLineName(l.route) : l.route ?? ""}</em>}
            </span>
          ))}
        </div>
        <div className="j-meta">
          {j.tags.map((t) => <span key={t} className="tag">{t}</span>)}
          <span>{j.transfers} change{j.transfers === 1 ? '' : 's'}</span>
          <span>🚶 {fmtDur(j.walkSec)}</span>
          {j.estimatedTimes && <span className="warn-chip" title="Some times are estimated: road traffic, or bus times rebuilt from distance because the published timetable was implausible.">≈ times estimated</span>}
          {j.stale && <span className="warn-chip stale" title="Uses a timetable that has expired">old timetable</span>}
        </div>
      </button>
      {selected && (
        <ol className="legs">
          {j.legs.map((l, i) => <LegRow key={i} l={l} />)}
          {j.hints.map((h, i) => <li key={`h${i}`} className="hint">💡 {h}</li>)}
        </ol>
      )}
    </article>
  );
}

function LegRow({ l }: { l: Leg }) {
  const dur = fmtDur(l.arrSec - l.depSec);
  return (
    <li className="leg-row" style={{ ['--c' as string]: l.kind === 'walk' ? '#94a3b8' : l.color }}>
      <div className="leg-time">{fmtTime(l.depSec)}</div>
      <div className="leg-body">
        <div className="leg-title">
          <span className="leg-icon" aria-hidden>{ICON[l.kind]}</span>
          {l.kind === 'walk' && <>Walk {Math.round(l.km * 1000) >= 1000 ? `${l.km.toFixed(1)} km` : `${Math.round(l.km * 1000)} m`} to <b>{l.to.name}</b></>}
          {(l.kind === 'auto' || l.kind === 'cab') && <>{modeLabel[l.kind]} to <b>{l.to.name}</b> · {l.km.toFixed(1)} km</>}
          {(l.kind === 'bus' || l.kind === 'metro' || l.kind === 'mmts') && <>
            <span className="route-pill" style={{ background: l.color }}>{l.kind === 'metro' ? metroLineName(l.route) : `${modeLabel[l.kind]} ${l.route}`}</span>
            towards {l.headsign || '—'}
          </>}
        </div>
        <div className="leg-sub">
          {(l.kind === 'bus' || l.kind === 'metro' || l.kind === 'mmts')
            ? <>Board at <b>{l.from.name}</b>, ride {Math.max(1, (l.stops?.length ?? 2) - 1)} stop{(l.stops?.length ?? 2) === 2 ? '' : 's'}, get off at <b>{l.to.name}</b> ({fmtTime(l.arrSec)})</>
            : <>{dur}</>}
          {l.fare && l.fare.max > 0 && <> · {money(l.fare)}</>}
          {l.estimated && (l.kind === 'bus' ? <> · <i>times estimated</i></> : null)}
          {l.stale && <> · <i>2019–20 timetable</i></>}
        </div>
        {l.note && <div className="leg-note">{l.note}</div>}
      </div>
    </li>
  );
}
