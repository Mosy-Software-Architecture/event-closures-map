// Locating and loading the data files of one event.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toFile } from './json.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FILES = ['event', 'branding', 'closures', 'parking', 'routes', 'sources', 'updates', 'i18n'];
export const REQUIRED = ['event', 'branding'];

// --data <dir> wins, then ECM_DATA, then ./data
export function dataDir(argv = process.argv) {
  const i = argv.indexOf('--data');
  const d = i > -1 ? argv[i + 1] : (process.env.ECM_DATA || 'data');
  return resolve(process.cwd(), d);
}
export function arg(name, argv = process.argv) {
  const i = argv.indexOf(name);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}
export const flag = (name, argv = process.argv) => argv.includes(name);

export function readJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { throw new Error(`${path}: ${e.code === 'ENOENT' ? 'file not found' : 'invalid JSON (' + e.message + ')'}`); }
}

export function loadData(dir) {
  const out = { dir };
  for (const f of FILES) {
    const p = join(dir, f + '.json');
    out[f] = existsSync(p) ? readJSON(p) : null;
  }
  for (const f of REQUIRED) if (!out[f]) throw new Error(`${join(dir, f + '.json')}: file not found (required)`);
  out.closures ||= { bands: [], streets: [] };
  out.parking ||= { bans: [], carParks: [] };
  out.routes ||= { routes: [], markers: [] };
  out.sources ||= { sources: [] };
  out.i18n ||= {};
  return out;
}

export function writeJSON(path, value) { writeFileSync(path, toFile(value)); }
