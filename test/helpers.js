import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../scripts/lib/data.js';

export const EXAMPLE = join(ROOT, 'examples', 'malaga-marathon-2026');
export const STARTER = join(ROOT, 'data');
export function copyData(from) {
  const dir = mkdtempSync(join(tmpdir(), 'ecm-test-'));
  cpSync(from, dir, { recursive: true });
  return dir;
}
export const read = (dir, f) => JSON.parse(readFileSync(join(dir, f + '.json'), 'utf8'));
export const write = (dir, f, v) => writeFileSync(join(dir, f + '.json'), JSON.stringify(v));
