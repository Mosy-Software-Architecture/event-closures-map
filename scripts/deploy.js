#!/usr/bin/env node
// npm run deploy [-- --data <dir>] [--dry-run] [--keep-local-updates]
// Builds and publishes to Firebase Hosting (event.site.firebase). Before publishing it downloads the
// live updates file, because that file is written by another process (watch-updates or a person)
// and a deploy replaces the whole site: publishing the local copy would delete live updates.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, flag, ROOT } from './lib/data.js';
import { build } from './build.js';
import { updatesPath } from './lib/site.js';

const out = join(ROOT, 'dist');
const { data } = build(dataDir(), out);
const site = data.event.site || {};
const fb = { ...(site.firebase || {}), ...(process.env.FIREBASE_SITE ? { site: process.env.FIREBASE_SITE } : {}), ...(process.env.FIREBASE_PROJECT ? { project: process.env.FIREBASE_PROJECT } : {}) };
if (!fb.site || !fb.project) { console.error('✗ event.site.firebase {site, project} is not set (FIREBASE_SITE and FIREBASE_PROJECT override it). To publish elsewhere, upload dist/public to any static host (see README).'); process.exit(1); }

const up = updatesPath(data.event);
if (site.url && !flag('--keep-local-updates')) {
  const url = new URL(up, site.url).href;
  try {
    const r = await fetch(url + '?ts=' + Date.now(), { cache: 'no-store' });
    if (r.status === 404) console.log(`  no live ${up} yet; publishing the local one (if any)`);
    else if (!r.ok) throw new Error(`HTTP ${r.status}`);
    else {
      const live = await r.json();
      if (!Array.isArray(live.items)) throw new Error('live file has no "items" array');
      writeFileSync(join(out, 'public', up), JSON.stringify(live));
      console.log(`  kept the live ${up} (${live.items.length} items, updated ${live.updated || '?'})`);
    }
  } catch (e) {
    console.error(`✗ could not read the live ${url} (${e.message}). Not deploying, so live updates are not overwritten. Use --keep-local-updates to publish the local copy on purpose.`);
    process.exit(1);
  }
}

// exact version: this runs with your cloud credentials, so no floating range
const FIREBASE_TOOLS = 'firebase-tools@14.27.0';
const cmd = ['--yes', FIREBASE_TOOLS, 'deploy', '--only', `hosting:${fb.site}`, '--project', fb.project, '--non-interactive'];
console.log(`  npx ${cmd.join(' ')}  (in dist/)`);
if (flag('--dry-run')) { console.log('(dry run: not published)'); process.exit(0); }
const r = spawnSync('npx', cmd, { cwd: out, stdio: 'inherit', env: process.env });
process.exit(r.status ?? 1);
