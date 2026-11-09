#!/usr/bin/env node
// npm run smoke: serves dist/ with the production headers, loads it in headless Chrome at desktop
// and phone sizes, and fails on console errors, exceptions or CSP violations, or if no street is drawn.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, flag } from './lib/data.js';
import { serveDist } from './lib/serve.js';
import { inspect, findChrome } from './lib/chrome.js';

if (!findChrome()) { console.error('✗ Chrome not found; set CHROME_PATH'); process.exit(1); }
const server = await serveDist(join(ROOT, 'dist'));
// screenshots in the event's main language, not the browser's
const event = JSON.parse(readFileSync(join(ROOT, 'dist', 'public', 'data', 'event.json'), 'utf8'));
const base = `http://127.0.0.1:${server.address().port}/?lang=${(event.languages || ['es'])[0]}`;
const out = join(ROOT, 'dist', 'smoke'); mkdirSync(out, { recursive: true });
const expectStreets = !flag('--allow-empty');
let failed = 0;
for (const v of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone', width: 390, height: 844, mobile: true, scale: 2 }]) {
  const r = await inspect(base, v);
  writeFileSync(join(out, `${v.name}.png`), r.shot);
  const bad = [...r.problems];
  if (expectStreets && !r.stats.paths) bad.push('no street or route drawn on the map');
  console.log(`${bad.length ? '✗' : '✓'} ${v.name}: ${r.stats.paths} shapes, title "${r.stats.title}", lang ${r.stats.lang}, screenshot dist/smoke/${v.name}.png`);
  for (const p of bad) console.log(`    ${p}`);
  failed += bad.length;
}
server.close();
process.exit(failed ? 1 : 0);
