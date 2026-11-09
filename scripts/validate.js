#!/usr/bin/env node
// npm run validate [-- --data <dir>]: schemas and cross-file checks. Exit code 1 on errors.
import { dataDir, loadData } from './lib/data.js';
import { checkData } from './lib/check.js';

const dir = dataDir();
let data;
try { data = loadData(dir); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
const { errors, warnings } = checkData(data);
for (const w of warnings) console.warn(`⚠ ${w}`);
for (const e of errors) console.error(`✗ ${e}`);
const streets = data.closures.streets.length, drawn = data.closures.streets.filter(s => s.geometry).length;
console.log(`${errors.length ? '✗' : '✓'} ${dir}: ${errors.length} error(s), ${warnings.length} warning(s). ${data.closures.bands.length} bands, ${drawn}/${streets} streets drawn, ${(data.parking.bans || []).length} parking bans, ${(data.routes.routes || []).length} routes.`);
process.exit(errors.length ? 1 : 0);
