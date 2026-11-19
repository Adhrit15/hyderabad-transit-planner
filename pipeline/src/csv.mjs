// Minimal RFC 4180 CSV parser (handles quoted fields with commas and doubled quotes, BOM and CRLF).
// GTFS files are CSV. Fields here never contain newlines, so we parse line by line, which is fast and memory-friendly.

export function parseLine(line) {
  if (!line.includes('"')) return line.split(',');
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Parses CSV text into an array of objects keyed by (trimmed) header names. */
export function parseCsv(text) {
  if (!text) return [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = parseLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l || !l.trim()) continue;
    const cells = parseLine(l);
    const row = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = (cells[j] ?? '').trim();
    rows.push(row);
  }
  return rows;
}
