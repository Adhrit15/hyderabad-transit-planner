#!/usr/bin/env node
// Orchestrates the daily data refresh.
//   node src/run.mjs --out ../frontend/public/data [--offline] [--cache .cache] [--state state]
// Exit code 1 = a critical source has no usable data (fresh or last-good) → CI fails → live site untouched.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { fetchSource, loadLastGood, promoteLastGood } from './fetch.mjs';
import { readGtfsZip } from './gtfs.mjs';
import { normaliseGtfs } from './normalise.mjs';
import { validateFeed } from './validate.mjs';
import { repairFeed } from './repair.mjs';
import { buildNetwork, resolveAttr, selectFeeds } from './merge.mjs';
import { encodeNetwork } from './bundle.mjs';
import { parseCsv } from './csv.mjs';
import { diffStatus } from './status.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--')
  ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter((x) => x.length));
const OUT = resolve(ROOT, args.out ?? '../frontend/public/data');
const CACHE = resolve(ROOT, args.cache ?? '.cache');
const STATE = resolve(ROOT, args.state ?? 'state');
const offline = !!args.offline;
const today = new Date();

const registry = JSON.parse(readFileSync(join(ROOT, 'sources.json'), 'utf8')).sources;
const readManual = (file) => {
  const p = join(ROOT, file);
  return p.endsWith('.csv') ? parseCsv(readFileSync(p, 'utf8')) : JSON.parse(readFileSync(p, 'utf8'));
};
const previous = existsSync(join(STATE, 'last-run.json')) ? JSON.parse(readFileSync(join(STATE, 'last-run.json'), 'utf8')) : null;
const prevCounts = (id) => previous?.sources?.find((s) => s.id === id)?.counts ?? null;

const traffic = readManual('manual/traffic-profile.json');
const patches = readManual('manual/patches.json').patches;
const status = { generatedAt: today.toISOString(), ok: true, sources: [], decisions: [], changes: [] };
const fatal = [];

// ---------- 1. timetables (GTFS) ----------------------------------------------------------
const feeds = [];
for (const source of registry.filter((s) => s.kind === 'gtfs')) {
  const st = { id: source.id, name: source.name, kind: source.kind, attribution: source.attribution, homepage: source.homepage, licence: source.licence };
  status.sources.push(st);
  let snap = await fetchSource(source, CACHE, { offline });
  let accepted = null;
  for (const candidate of [snap, loadLastGood(source.id, CACHE)].filter(Boolean)) {
    try {
      const feed = normaliseGtfs(readGtfsZip(candidate.bytes), source, patches.filter((p) => p.source === source.id), today);
      const repairs = repairFeed(feed, source, traffic);
      const v = validateFeed(feed, prevCounts(source.id));
      if (v.errors.length) { st.rejected = [...(st.rejected ?? []), { sha: candidate.sha, errors: v.errors }]; continue; }
      accepted = { candidate, feed, repairs, v };
      break;
    } catch (e) {
      st.rejected = [...(st.rejected ?? []), { sha: candidate.sha, errors: [`unreadable: ${e.message}`] }];
    }
  }
  st.fetchErrors = snap?.errors?.length ? snap.errors : undefined;
  if (!accepted) {
    st.state = 'failed';
    if (source.critical) fatal.push(`${source.id}: no usable data (fresh or last-good)`);
    continue;
  }
  const { candidate, feed, repairs, v } = accepted;
  if (!candidate.lastGood) promoteLastGood(source.id, CACHE, candidate.bytes, { sha: candidate.sha, url: candidate.url, fetchedAt: candidate.fetchedAt });
  Object.assign(st, {
    state: candidate.lastGood ? 'last-good' : candidate.fromSnapshot ? 'cached' : 'fresh',
    sha: candidate.sha, url: candidate.url, fetchedAt: candidate.fetchedAt,
    validFrom: feed.feed.validFrom, validTo: feed.feed.validTo, active: feed.feed.active, version: feed.feed.version,
    counts: { stops: feed.stops.size, routes: feed.routes.size, trips: feed.trips.length },
    repairs, dropped: v.dropped, warnings: v.warnings, patches: feed.patchLog,
  });
  if (repairs.retimed) st.warnings.push(`${repairs.retimed} of ${repairs.of} trips had implausible published times and were re-timed from their first departure (flagged "times estimated")`);
  feeds.push({ source, feed });
}

// ---------- 2. choose one timetable per mode ----------------------------------------------
const { chosen, log: feedLog } = selectFeeds(feeds);
status.decisions.push(...feedLog);
const network = buildNetwork([...new Set(chosen.values())]);

// ---------- 3. fares: newest effective chart wins -----------------------------------------
const manual = (id) => registry.find((s) => s.id === id);
const metroFares2025 = readManual(manual('metro-fares-2025').file);
const hmrl = feeds.find((f) => f.source.id === 'hmrl-gtfs');
const metroCandidates = [{ id: 'metro-fares-2025', effectiveFrom: metroFares2025.effectiveFrom, trust: 80, value: metroFares2025, label: 'HMRL fare chart May 2025 (curated)' }];
if (hmrl?.feed.fares) {
  metroCandidates.push({ id: 'hmrl-gtfs-fares', effectiveFrom: isoDate(hmrl.feed.feed.validFrom), trust: 90,
    value: null, label: `HMRL GTFS fare table (₹${hmrl.feed.fares.min}–₹${hmrl.feed.fares.max}, ${hmrl.feed.fares.pairs} station pairs)` });
}
const metroFare = resolveAttr('fare:metro', metroCandidates);
status.decisions.push(...metroFare.log);
const roadFares = readManual('manual/road-fares.json');
const fares = { metro: metroFare.value, bus: readManual('manual/bus-fares.json'), mmts: readManual('manual/mmts-fares.json'), ...roadFares };
for (const id of ['metro-fares-2025', 'bus-fares', 'mmts-fares', 'road-fares', 'traffic-profile']) {
  const s = manual(id);
  const data = readManual(s.file);
  status.sources.push({ id, name: s.file, kind: 'manual', state: 'manual', effectiveFrom: data.effectiveFrom ?? null,
    approximate: data.approximate ?? Object.values(data).some((x) => x?.approximate), note: data.note ?? null, links: data.sources ?? [] });
}

// ---------- 4. auto / share-auto points ---------------------------------------------------
const autoPoints = [];
const osmSrc = manual('osm-auto-stands');
const osmSnap = await fetchSource(osmSrc, CACHE, { offline, retries: 1 });
const osmStatus = { id: osmSrc.id, name: osmSrc.name, kind: 'overpass', attribution: osmSrc.attribution };
try {
  const els = osmSnap ? JSON.parse(new TextDecoder().decode(osmSnap.bytes)).elements : [];
  for (const e of els) autoPoints.push([round5(e.lat), round5(e.lon), e.tags?.name || 'Auto stand', 'osm']);
  Object.assign(osmStatus, { state: osmSnap ? (osmSnap.fromSnapshot ? 'cached' : 'fresh') : 'failed', fetchedAt: osmSnap?.fetchedAt, counts: { points: els.length } });
} catch (e) { Object.assign(osmStatus, { state: 'failed', errors: [e.message] }); }
status.sources.push(osmStatus);
for (const r of readManual('manual/auto-points.csv')) {
  if (Number.isFinite(+r.lat) && Number.isFinite(+r.lon)) autoPoints.push([+r.lat, +r.lon, r.name, r.share_auto === 'yes' ? 'community-share' : 'community']);
}
// Autos reliably wait at metro and MMTS stations, so those count as likely auto points too.
network.stops.id.forEach((id, i) => {
  if (network.stops.mode[i] & 6) autoPoints.push([network.stops.lat[i] / 1e5, network.stops.lon[i] / 1e5, network.stops.name[i], 'station']);
});

// ---------- 5. write bundle + status -------------------------------------------------------
if (fatal.length) {
  status.ok = false; status.fatal = fatal;
  mkdirSync(STATE, { recursive: true });
  writeFileSync(join(STATE, 'failed-run.json'), JSON.stringify(status, null, 2));
  console.error('FATAL:', fatal.join('; '));
  process.exit(1);
}

const attribution = registry.filter((s) => s.attribution && status.sources.find((x) => x.id === s.id && x.state !== 'failed')).map((s) => s.attribution);
const bundle = encodeNetwork(network, {
  meta: { generatedAt: status.generatedAt, timezone: 'Asia/Kolkata' },
  fares, traffic, autoPoints, attribution,
});
const json = JSON.stringify(bundle);
status.network = {
  stops: network.stops.id.length, routes: network.routes.length, patterns: network.patterns.length,
  trips: network.patterns.reduce((a, p) => a + p.t.length, 0), profiles: network.profiles.length,
  autoPoints: autoPoints.length, bundleBytes: json.length, bundleGzipBytes: gzipSync(json).length,
};
status.changes = diffStatus(previous, status);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'network.json'), json);
writeFileSync(join(OUT, 'status.json'), JSON.stringify(status, null, 2));
mkdirSync(STATE, { recursive: true });
writeFileSync(join(STATE, 'last-run.json'), JSON.stringify(stableState(status), null, 2) + '\n');
console.log(`network: ${status.network.stops} stops, ${status.network.routes} routes, ${status.network.trips} trips, ` +
  `${(status.network.bundleBytes / 1e6).toFixed(2)} MB (${(status.network.bundleGzipBytes / 1e6).toFixed(2)} MB gzip)`);
for (const s of status.sources) console.log(`  ${s.id.padEnd(18)} ${String(s.state).padEnd(9)} ${(s.warnings ?? []).join(' | ')}`);
for (const c of status.changes) console.log(`  change: ${c}`);

function round5(x) { return Math.round(x * 1e5) / 1e5; }
function isoDate(ymd) { return ymd && ymd.length === 8 ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}` : ymd; }
/** The committed state file omits volatile fields, so a git diff shows only real data changes. */
function stableState(s) {
  return {
    sources: s.sources.map(({ fetchedAt, fetchErrors, ...rest }) => rest),
    decisions: s.decisions,
    network: s.network,
  };
}
