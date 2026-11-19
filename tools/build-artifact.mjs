// Builds a single-file copy of the frontend for hosts that wrap the page in their own
// <html>/<head>/<body> skeleton and block external images (no map tiles, so VITE_TILES=off).
// Usage: node tools/build-artifact.mjs   → writes frontend/dist-artifact/index.html
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const fe = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const out = join(fe, 'dist-artifact');
execSync('npx vite build --outDir dist-artifact --emptyOutDir', { cwd: fe, stdio: 'inherit', env: { ...process.env, VITE_TILES: 'off' } });

const html = readFileSync(join(out, 'index.html'), 'utf8');
const asset = (p) => readFileSync(join(out, p.replace(/^\.\//, '')), 'utf8');
let head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];

const title = head.match(/<title>.*?<\/title>/)[0];
head = head.replace(title, '');
let js = '';
head = head.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, src) => { js = asset(src); return ''; });
head = head.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/, (_, href) => `<style>${asset(href)}</style>`);
if (!js) throw new Error('module script not found in built index.html');
if (js.includes('</script')) throw new Error('bundle contains </script>, cannot inline');

writeFileSync(join(out, 'index.html'), `${title}\n${head.trim()}\n${body.trim()}\n<script type="module">${js}</script>\n`);
console.log('wrote', join(out, 'index.html'));
