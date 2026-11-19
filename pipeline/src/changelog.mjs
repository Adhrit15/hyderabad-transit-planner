#!/usr/bin/env node
// Appends today's data changes (from status.json) to pipeline/state/CHANGELOG.md.
// Usage: node src/changelog.mjs ../frontend/public/data/status.json
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const status = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'state', 'CHANGELOG.md');
if (!existsSync(file)) writeFileSync(file, '# Data changelog\n\nWritten by the daily refresh workflow. Newest entries at the bottom.\n');
const lines = status.changes?.length ? status.changes : ['no data changes'];
appendFileSync(file, `\n## ${status.generatedAt.slice(0, 10)}\n${lines.map((l) => `- ${l}`).join('\n')}\n`);
console.log(`changelog: ${lines.length} line(s)`);
