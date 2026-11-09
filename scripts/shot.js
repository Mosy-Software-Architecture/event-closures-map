#!/usr/bin/env node
// npm run shot [-- --data <dir>] [--time 10:30] [--view lat,lon,zoom] [--lang es] [--phone]
//               [--width 1280 --height 800] [--out dist/shot.png]
// Builds the site and takes one screenshot at a given time and place, to check the streets of a
// slot or a neighbourhood without clicking around. Needs Chrome.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { dataDir, arg, flag, ROOT } from './lib/data.js';
import { build } from './build.js';
import { serveDist } from './lib/serve.js';
import { inspect } from './lib/chrome.js';

const out = join(ROOT, 'dist');
const { data } = build(dataDir(), out);
const params = new URLSearchParams({ lang: arg('--lang') || (data.event.languages || ['es'])[0] });
if (arg('--time')) params.set('t', arg('--time'));
if (arg('--view')) params.set('view', arg('--view'));
const phone = flag('--phone');
const size = phone ? { width: 390, height: 844, mobile: true, scale: 2 } : { width: Number(arg('--width') || 1280), height: Number(arg('--height') || 800) };
const server = await serveDist(out);
const r = await inspect(`http://127.0.0.1:${server.address().port}/?${params}`, { ...size, settleMs: 2500, colorScheme: flag('--dark') ? 'dark' : 'light' });
server.close();
const file = resolve(process.cwd(), arg('--out') || join(out, 'shot.png'));
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, r.shot);
for (const p of r.problems) console.warn(`⚠ ${p}`);
console.log(`✓ ${file} (${params}; ${r.stats.paths} shapes drawn)`);
