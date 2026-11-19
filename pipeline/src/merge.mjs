// Combines validated feeds into one routable network.
//  1. selectFeeds   — for each mode pick ONE timetable (active > newest > most trusted); log the rest as superseded
//  2. resolveAttr   — for attributes like fares: newest effectiveFrom wins, ties → higher trust; log overrides
//  3. buildNetwork  — global stop index + RAPTOR routes (patterns split so no trip overtakes another)

const MODE_BITS = { bus: 1, metro: 2, mmts: 4 };
const CHANGE_SEC = { bus: 60, metro: 120, mmts: 180 };

export function selectFeeds(candidates /* [{source, feed}] */) {
  const byMode = new Map();
  for (const c of candidates) for (const m of c.source.covers) {
    if (!byMode.has(m)) byMode.set(m, []);
    byMode.get(m).push(c);
  }
  const chosen = new Map(), log = [];
  for (const [mode, list] of byMode) {
    list.sort((a, b) =>
      (+b.feed.feed.active - +a.feed.feed.active)
      || String(b.feed.feed.validFrom ?? '').localeCompare(String(a.feed.feed.validFrom ?? ''))
      || b.source.trust - a.source.trust);
    chosen.set(mode, list[0]);
    for (const loser of list.slice(1)) {
      log.push({ kind: 'feed-superseded', mode, winner: list[0].source.id, loser: loser.source.id,
        reason: `${list[0].source.id} is ${list[0].feed.feed.active ? 'active' : 'newer/more trusted'}` });
    }
  }
  return { chosen, log };
}

/**
 * candidates: [{id, effectiveFrom: 'YYYY-MM-DD'|null, trust, value, label}]
 * Newest effectiveFrom wins; equal dates → higher trust.
 */
export function resolveAttr(attribute, candidates) {
  const sorted = [...candidates].sort((a, b) =>
    String(b.effectiveFrom ?? '').localeCompare(String(a.effectiveFrom ?? '')) || b.trust - a.trust);
  const log = sorted.slice(1).map((l) => ({
    kind: 'attribute-override', attribute, winner: sorted[0].id, loser: l.id,
    reason: `${sorted[0].label ?? sorted[0].id} (effective ${sorted[0].effectiveFrom ?? 'n/a'}) is newer than ${l.label ?? l.id} (effective ${l.effectiveFrom ?? 'n/a'})`,
  }));
  return { value: sorted[0]?.value, winner: sorted[0]?.id, log };
}

/** Splits trips sharing a stop sequence into FIFO chains: inside a chain, a later trip is never earlier at any stop. */
export function fifoChains(trips) {
  const sorted = [...trips].sort((a, b) => a.dep[0] - b.dep[0]);
  const chains = [];
  for (const t of sorted) {
    let placed = false;
    for (const c of chains) {
      const last = c[c.length - 1];
      let ok = true;
      for (let i = 0; i < t.dep.length; i++) if (t.dep[i] < last.dep[i] || t.arr[i] < last.arr[i]) { ok = false; break; }
      if (ok) { c.push(t); placed = true; break; }
    }
    if (!placed) chains.push([t]);
  }
  return chains;
}

const daysMask = (days) => days.reduce((m, d, i) => m | (d ? 1 << i : 0), 0);

export function buildNetwork(chosenFeeds /* [{source, feed}] */) {
  const stopIndex = new Map();
  const stops = { id: [], name: [], lat: [], lon: [], mode: [], chg: [] };
  const addStop = (sourceId, s, mode) => {
    const key = `${sourceId}:${s.id}`;
    let i = stopIndex.get(key);
    if (i === undefined) {
      i = stops.id.length; stopIndex.set(key, i);
      stops.id.push(key); stops.name.push(s.name);
      stops.lat.push(Math.round(s.lat * 1e5)); stops.lon.push(Math.round(s.lon * 1e5));
      stops.mode.push(0); stops.chg.push(0);
    }
    stops.mode[i] |= MODE_BITS[mode] ?? 1;
    stops.chg[i] = Math.max(stops.chg[i], CHANGE_SEC[mode] ?? 60);
    return i;
  };

  const routes = [], patterns = [], profiles = [], profileIdx = new Map();
  for (const { source, feed } of chosenFeeds) {
    const routeIdx = new Map();
    const groups = new Map();
    for (const t of feed.trips) {
      const key = `${t.routeId}|${t.stopIds.join('>')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    for (const group of groups.values()) {
      const t0 = group[0];
      const r = feed.routes.get(t0.routeId);
      if (!routeIdx.has(t0.routeId)) {
        routeIdx.set(t0.routeId, routes.length);
        routes.push({ n: r.short, l: r.long, m: r.mode, c: r.color, src: source.id });
      }
      const stopIdx = t0.stopIds.map((id) => addStop(source.id, feed.stops.get(id), r.mode));
      const km = t0.km.map((k) => Math.round(k * 100)); // centi-km: shared with retimeOffsets()
      for (const chain of fifoChains(group)) {
        const p = { r: routeIdx.get(t0.routeId), h: t0.headsign, s: stopIdx, k: km, t: [], p: [], d: [], f: [] };
        for (const t of chain) {
          // Re-timed trips store no profile (-1): the browser recomputes them with retimeOffsets().
          let pi = -1;
          if (!t.flags.retimed) {
            const prof = [];
            for (let i = 0; i < t.arr.length; i++) prof.push(t.arr[i] - t.dep[0], t.dep[i] - t.dep[0]);
            const pk = prof.join(',');
            pi = profileIdx.get(pk);
            if (pi === undefined) { pi = profiles.length; profiles.push(prof); profileIdx.set(pk, pi); }
          }
          p.t.push(t.dep[0]); p.p.push(pi); p.d.push(daysMask(t.days));
          p.f.push((t.flags.stale ? 1 : 0) | (t.flags.retimed ? 2 : 0));
        }
        patterns.push(p);
      }
    }
  }
  return { stops, routes, patterns, profiles };
}
