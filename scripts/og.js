#!/usr/bin/env node
// npm run og [-- --data <dir>]: takes the social preview image (1200x630) of the page with ?og=1
// (light theme, no notice, the time and view set in event.json "og") and saves it as
// <data>/assets/<site.ogImage> (default og.png). Needs Chrome.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, ROOT } from './lib/data.js';
import { build } from './build.js';
import { serveDist } from './lib/serve.js';
import { inspect } from './lib/chrome.js';

const dir = dataDir();
const out = join(ROOT, 'dist');
const { data } = build(dir, out);
const name = (data.event.site && data.event.site.ogImage) || 'og.png';
const server = await serveDist(out);
const r = await inspect(`http://127.0.0.1:${server.address().port}/?og=1`, { width: 1200, height: 630, settleMs: 2500 });
server.close();
for (const p of r.problems) console.warn(`⚠ ${p}`);
mkdirSync(join(dir, 'assets'), { recursive: true });
writeFileSync(join(dir, 'assets', name), r.shot);
build(dir, out);
console.log(`✓ saved ${join(dir, 'assets', name)} and rebuilt dist/. Set event.site.ogImage to "${name}" if it is not set.`);
