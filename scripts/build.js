#!/usr/bin/env node
// npm run build [-- --data <dir>] [--out dist]: writes dist/public (the site) and dist/firebase.json.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { dataDir, loadData, arg, ROOT } from './lib/data.js';
import { checkData } from './lib/check.js';
import { siteFiles, firebaseConfig, updatesPath } from './lib/site.js';
import { toFile } from './lib/json.js';

export function build(dir, out) {
  const data = loadData(dir);
  const { errors, warnings } = checkData(data);
  for (const w of warnings) console.warn(`⚠ ${w}`);
  if (errors.length) { for (const e of errors) console.error(`✗ ${e}`); throw new Error(`${errors.length} validation error(s); fix them before building`); }
  rmSync(join(out, 'public'), { recursive: true, force: true });
  const files = siteFiles(data);
  for (const [p, get] of files) {
    const target = join(out, 'public', p);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, get());
  }
  writeFileSync(join(out, 'firebase.json'), toFile(firebaseConfig(data)));
  return { data, files: [...files.keys()], updates: files.has(updatesPath(data.event)) ? updatesPath(data.event) : null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = resolve(process.cwd(), arg('--out') || join(ROOT, 'dist'));
  try {
    const r = build(dataDir(), out);
    console.log(`✓ built ${r.files.length} files into ${join(out, 'public')} (+ firebase.json)`);
    if (!r.data.event.site || !r.data.event.site.url) console.log('  note: event.site.url is not set, so there is no canonical URL, sitemap or OG image tag.');
  } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}
