import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../scripts/lib/data.js';

export const EXAMPLE = join(ROOT, 'examples', 'malaga-marathon-2026');
export const STARTER = join(ROOT, 'data');
// temporary folders made by a test file are removed when it ends
const made = [];
process.on('exit', () => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
export function tmp(prefix = 'ecm-test-') { const d = mkdtempSync(join(tmpdir(), prefix)); made.push(d); return d; }
export function copyData(from) {
  const dir = tmp();
  cpSync(from, dir, { recursive: true });
  return dir;
}
export const read = (dir, f) => JSON.parse(readFileSync(join(dir, f + '.json'), 'utf8'));
export const write = (dir, f, v) => writeFileSync(join(dir, f + '.json'), JSON.stringify(v));
