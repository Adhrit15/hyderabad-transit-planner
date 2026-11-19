import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { parseCsv, parseLine } from '../src/csv.mjs';
import { readGtfsZip, parseGtfsTexts } from '../src/gtfs.mjs';
import { normaliseGtfs } from '../src/normalise.mjs';
import { validateFeed } from '../src/validate.mjs';
import { repairFeed, retimeOffsets, averageKmph } from '../src/repair.mjs';
import { buildNetwork, fifoChains, resolveAttr, selectFeeds } from '../src/merge.mjs';
import { deltaDecode, deltaEncode } from '../src/bundle.mjs';
import { diffStatus } from '../src/status.mjs';

const traffic = { carKmph: Array(24).fill(20), busKmphFactor: 0.75, busDwellSec: 25 };

/** A tiny GTFS feed: 3 stops ~1 km apart, one route, two trips. */
function fixture({ times = [['08:00:00', '08:04:00', '08:08:00'], ['08:10:00', '08:14:00', '08:18:00']], calendarEnd = '20991231', platforms = false } = {}) {
  const stops = platforms
    ? 'stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\nA,STATION A,17.40,78.40,1,\nA1,Station A,17.40,78.40,0,A\nB,Station B,17.409,78.40,1,\nC,Station C,17.418,78.40,1,'
    : 'stop_id,stop_name,stop_lat,stop_lon\nA,STATION A,17.40,78.40\nB,Station B,17.409,78.40\nC,Station C,17.418,78.40';
  const first = platforms ? 'A1' : 'A';
  const st = ['trip_id,stop_sequence,stop_id,arrival_time,departure_time'];
  times.forEach((ts, k) => ts.forEach((t, i) => st.push(`T${k},${i + 1},${[first, 'B', 'C'][i]},${t},${t}`)));
  return {
    calendar: `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,1,1,20200101,${calendarEnd}`,
    routes: 'route_id,route_short_name,route_long_name,route_type\nR1,10K,Koti - Kukatpally,3',
    trips: ['route_id,service_id,trip_id,trip_headsign', ...times.map((_, k) => `R1,WK,T${k},Kukatpally`)].join('\n'),
    stops, stop_times: st.join('\n'),
  };
}
const src = { id: 'test', covers: ['bus'], trust: 50 };

test('CSV parser handles quotes, commas and BOM', () => {
  assert.deepEqual(parseLine('a,"b,c","d ""e"""'), ['a', 'b,c', 'd "e"']);
  assert.deepEqual(parseCsv('﻿x,y\r\n1,2\r\n\r\n'), [{ x: '1', y: '2' }]);
});

test('reads a GTFS zip', () => {
  const files = Object.fromEntries(Object.entries(fixture()).map(([k, v]) => [`${k}.txt`, strToU8(v)]));
  const g = readGtfsZip(zipSync(files));
  assert.equal(g.stops.length, 3);
  assert.equal(g.stop_times.length, 6);
});

test('normalise collapses platforms to stations, title-cases names, computes km', () => {
  const f = normaliseGtfs(parseGtfsTexts(fixture({ platforms: true })), src);
  assert.deepEqual(f.trips[0].stopIds, ['A', 'B', 'C']);
  assert.equal(f.stops.get('A').name, 'Station A');
  assert.ok(f.trips[0].km[2] > 2 && f.trips[0].km[2] < 3, `km=${f.trips[0].km[2]}`); // 2 km straight × 1.3
  assert.equal(f.feed.active, true);
});

test('expired calendar marks trips stale and warns', () => {
  const f = normaliseGtfs(parseGtfsTexts(fixture({ calendarEnd: '20200401' })), src, [], new Date('2026-11-19'));
  assert.equal(f.feed.active, false);
  assert.ok(f.trips.every((t) => t.flags.stale));
  const v = validateFeed(f);
  assert.ok(v.warnings.some((w) => w.includes('expired')));
});

test('calendar patch applies when the condition matches and is reported obsolete otherwise', () => {
  const patch = { id: 'p', type: 'calendar-days', serviceId: 'WK', when: { days: [1, 1, 1, 1, 1, 1, 1] }, set: { days: [1, 1, 1, 1, 1, 0, 0] } };
  const f = normaliseGtfs(parseGtfsTexts(fixture()), src, [patch]);
  assert.deepEqual(f.trips[0].days, [1, 1, 1, 1, 1, 0, 0]);
  assert.deepEqual(f.patchLog.applied, ['p']);
  const g = normaliseGtfs(parseGtfsTexts(fixture()), src, [{ ...patch, when: { days: [0, 0, 0, 0, 0, 0, 0] } }]);
  assert.deepEqual(g.patchLog.obsolete, ['p']);
});

test('validation drops trips whose times go backwards and rejects a feed that loses >40% of trips', () => {
  const f = normaliseGtfs(parseGtfsTexts(fixture({ times: [['08:00:00', '07:50:00', '08:08:00'], ['08:10:00', '08:14:00', '08:18:00']] })), src);
  const v = validateFeed(f, { trips: 10 });
  assert.equal(v.dropped.nonMonotonicTrips, 1);
  assert.equal(f.trips.length, 1);
  assert.ok(v.errors.some((e) => e.includes('refusing to publish')));
});

test('repair re-times a "28-hour bus" from its first departure; plausible trips are untouched', () => {
  const f = normaliseGtfs(parseGtfsTexts(fixture({ times: [['08:00:00', '12:00:00', '20:00:00'], ['08:10:00', '08:14:00', '08:18:00']] })), { ...src, repair: { retimeOutsideKmph: [8, 35] } });
  const before = averageKmph(f.trips[0]);
  const r = repairFeed(f, { repair: { retimeOutsideKmph: [8, 35] } }, traffic);
  assert.ok(before < 1);
  assert.equal(r.retimed, 1);
  assert.equal(f.trips[0].dep[0], 8 * 3600);                 // first departure kept
  assert.ok(f.trips[0].flags.retimed && !f.trips[1].flags.retimed);
  const v = averageKmph(f.trips[0]);
  assert.ok(v > 8 && v < 20, `speed after repair ${v}`);    // 20 km/h × 0.75 minus dwell
});

test('retimeOffsets: speed follows the hour, minimum 30 s per segment, no dwell at the last stop', () => {
  const tr = { ...traffic, carKmph: traffic.carKmph.map((_, h) => (h === 8 ? 10 : 40)) };
  const peak = retimeOffsets([0, 150, 300], 8 * 3600, tr);   // 1.5 km at 7.5 km/h = 720 s
  assert.deepEqual(peak, [0, 0, 720, 745, 1465, 1465]);
  const off = retimeOffsets([0, 150, 300], 12 * 3600, tr);   // 30 km/h → 180 s
  assert.deepEqual(off, [0, 0, 180, 205, 385, 385]);
  assert.deepEqual(retimeOffsets([0, 0], 0, tr), [0, 0, 30, 30]);
});

test('fifoChains splits trips that overtake', () => {
  const t = (d0, arrLast) => ({ dep: [d0, arrLast], arr: [d0, arrLast] });
  const chains = fifoChains([t(0, 100), t(10, 50), t(20, 120)]); // trip 2 overtakes trip 1
  assert.equal(chains.length, 2);
  for (const c of chains) for (let i = 1; i < c.length; i++) assert.ok(c[i].arr[1] >= c[i - 1].arr[1]);
});

test('attribute override: newest effective date wins, then trust', () => {
  const r = resolveAttr('fare:metro', [
    { id: 'old-official', effectiveFrom: '2025-04-05', trust: 90, value: 'old' },
    { id: 'new-chart', effectiveFrom: '2025-05-24', trust: 80, value: 'new' },
  ]);
  assert.equal(r.value, 'new');
  assert.equal(r.log[0].loser, 'old-official');
  const tie = resolveAttr('x', [{ id: 'a', effectiveFrom: '2025-01-01', trust: 10, value: 1 }, { id: 'b', effectiveFrom: '2025-01-01', trust: 60, value: 2 }]);
  assert.equal(tie.value, 2);
});

test('feed selection: an active timetable supersedes an expired one for the same mode', () => {
  const stale = { source: { id: 'mmts-2019', covers: ['mmts'], trust: 90 }, feed: { feed: { active: false, validFrom: '20190401' } } };
  const fresh = { source: { id: 'mmts-2027', covers: ['mmts'], trust: 40 }, feed: { feed: { active: true, validFrom: '20270101' } } };
  const { chosen, log } = selectFeeds([stale, fresh]);
  assert.equal(chosen.get('mmts').source.id, 'mmts-2027');
  assert.equal(log[0].loser, 'mmts-2019');
});

test('buildNetwork dedupes profiles and skips them for re-timed trips', () => {
  const f = normaliseGtfs(parseGtfsTexts(fixture()), src);
  f.trips[1].flags.retimed = true;
  const net = buildNetwork([{ source: src, feed: f }]);
  assert.equal(net.stops.id.length, 3);
  assert.equal(net.patterns.length, 1);
  assert.deepEqual(net.patterns[0].p, [0, -1]);
  assert.deepEqual(net.profiles[0], [0, 0, 240, 240, 480, 480]);
  assert.deepEqual(net.patterns[0].f, [0, 2]);
});

test('delta encoding round-trips', () => {
  const a = [1789000, 1789012, 1788990, 1789500];
  assert.deepEqual(deltaDecode(deltaEncode(a)), a);
});

test('diffStatus reports new versions, count changes and new overrides', () => {
  const prev = { sources: [{ id: 'bus', sha: 'a', version: '1', counts: { trips: 10 }, state: 'fresh' }], decisions: [] };
  const cur = { sources: [{ id: 'bus', sha: 'b', version: '2', counts: { trips: 12 }, state: 'fresh' }],
    decisions: [{ kind: 'attribute-override', winner: 'x', loser: 'y', reason: 'newer' }] };
  const d = diffStatus(prev, cur);
  assert.ok(d.some((x) => x.includes('version 1 → 2')));
  assert.ok(d.some((x) => x.includes('trips 10 → 12 (+2)')));
  assert.ok(d.some((x) => x.includes('x now overrides y')));
});

test('cached snapshots load their real bytes, and fetch falls back to them when offline', async () => {
  const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fetchSource, loadSnapshot } = await import('../src/fetch.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'snap-'));
  mkdirSync(join(dir, 'snapshots', 's'), { recursive: true });
  writeFileSync(join(dir, 'snapshots', 's', 'latest.bin'), new Uint8Array([1, 2, 3]));
  // Old metadata files stored the size under "bytes"; it must not shadow the contents.
  writeFileSync(join(dir, 'snapshots', 's', 'latest.json'), JSON.stringify({ sha: 'x', bytes: 3 }));
  const snap = loadSnapshot('s', dir);
  assert.ok(snap.bytes instanceof Uint8Array);
  assert.deepEqual([...snap.bytes], [1, 2, 3]);
  const off = await fetchSource({ id: 's', urls: ['http://invalid.invalid/'] }, dir, { offline: true });
  assert.equal(off.fromSnapshot, true);
  assert.deepEqual([...off.bytes], [1, 2, 3]);
});

test('extractPlaces keeps named places, classifies them and merges near-duplicates', async () => {
  const { extractPlaces } = await import('../src/places.mjs');
  const rows = extractPlaces({ elements: [
    { type: 'way', center: { lat: 17.4344, lon: 78.3866 }, tags: { name: 'Inorbit Mall Cyberabad', shop: 'mall' } },
    { type: 'node', lat: 17.4345, lon: 78.3867, tags: { name: 'Inorbit Mall Cyberabad', shop: 'mall' } },   // duplicate, 15 m away
    { type: 'node', lat: 17.44, lon: 78.35, tags: { name: 'Gachibowli', place: 'suburb' } },
    { type: 'node', lat: 17.41, lon: 78.44, tags: { name: 'NIMS', amenity: 'hospital' } },
    { type: 'node', lat: 17.41, lon: 78.44, tags: { amenity: 'hospital' } },                                // no name
  ] });
  assert.deepEqual(rows.map((r) => [r[0], r[3]]), [['Gachibowli', 'area'], ['Inorbit Mall Cyberabad', 'shopping'], ['NIMS', 'hospital']]);
});
