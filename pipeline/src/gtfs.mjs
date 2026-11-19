// Reads a GTFS zip (or a map of filename → text) into plain tables.
import { unzipSync, strFromU8 } from 'fflate';
import { parseCsv } from './csv.mjs';

const FILES = ['agency', 'feed_info', 'calendar', 'calendar_dates', 'routes', 'stops', 'trips', 'stop_times',
  'fare_attributes', 'fare_rules', 'shapes'];

/** @param {Uint8Array} zipBytes */
export function readGtfsZip(zipBytes) {
  const entries = unzipSync(zipBytes, { filter: (f) => FILES.some((n) => f.name.endsWith(`${n}.txt`)) });
  const texts = {};
  for (const [name, bytes] of Object.entries(entries)) {
    const base = name.split('/').pop().replace(/\.txt$/, '');
    texts[base] = strFromU8(bytes);
  }
  return parseGtfsTexts(texts);
}

/** @param {Record<string,string>} texts filename (without .txt) → CSV text */
export function parseGtfsTexts(texts) {
  const t = {};
  for (const n of FILES) t[n] = parseCsv(texts[n] ?? '');
  return t;
}
