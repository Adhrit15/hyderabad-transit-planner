// Downloads a source with mirror fallback, retries and a content hash. Every successful download is
// saved as a snapshot; if all mirrors fail, the last snapshot is returned instead ("last-good").
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const UA = 'hyd-transit-planner-pipeline/1.0 (+open-source route planner; daily refresh)';

async function download(url, { body, timeoutMs = 120_000 } = {}) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'User-Agent': UA, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * @returns {{bytes: Uint8Array, sha: string, url: string|null, fetchedAt: string, fromSnapshot: boolean, errors: string[]}}
 */
export async function fetchSource(source, cacheDir, { offline = false, retries = 2 } = {}) {
  const dir = join(cacheDir, 'snapshots', source.id);
  mkdirSync(dir, { recursive: true });
  const errors = [];
  if (!offline) {
    for (const url of source.urls) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const body = source.query ? `data=${encodeURIComponent(source.query)}` : undefined;
          const bytes = await download(url, { body });
          const sha = sha256(bytes);
          const fetchedAt = new Date().toISOString();
          writeFileSync(join(dir, 'latest.bin'), bytes);
          writeFileSync(join(dir, 'latest.json'), JSON.stringify({ sha, url, fetchedAt, size: bytes.length }, null, 2));
          return { bytes, sha, url, fetchedAt, fromSnapshot: false, errors };
        } catch (e) {
          errors.push(`${url} (attempt ${attempt + 1}): ${e.message}`);
          if (attempt < retries) await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        }
      }
    }
  }
  return loadSnapshot(source.id, cacheDir, errors);
}

export function loadSnapshot(id, cacheDir, errors = []) {
  const dir = join(cacheDir, 'snapshots', id);
  if (!existsSync(join(dir, 'latest.bin'))) return null;
  const meta = JSON.parse(readFileSync(join(dir, 'latest.json'), 'utf8'));
  // Metadata first, so nothing in it can shadow the file contents.
  return { ...meta, bytes: new Uint8Array(readFileSync(join(dir, 'latest.bin'))), fromSnapshot: true, errors };
}

/** Marks the snapshot that passed validation as last-good (separate from "latest", which may be broken). */
export function promoteLastGood(id, cacheDir, bytes, meta) {
  const dir = join(cacheDir, 'snapshots', id);
  writeFileSync(join(dir, 'last-good.bin'), bytes);
  writeFileSync(join(dir, 'last-good.json'), JSON.stringify(meta, null, 2));
}

export function loadLastGood(id, cacheDir) {
  const dir = join(cacheDir, 'snapshots', id);
  if (!existsSync(join(dir, 'last-good.bin'))) return null;
  const meta = JSON.parse(readFileSync(join(dir, 'last-good.json'), 'utf8'));
  return { ...meta, bytes: new Uint8Array(readFileSync(join(dir, 'last-good.bin'))), fromSnapshot: true, lastGood: true, errors: [] };
}
