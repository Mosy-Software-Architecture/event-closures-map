import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGpx, toRoute, lengthM } from '../scripts/gpx-to-routes.js';
import { ROOT } from '../scripts/lib/data.js';

const xml = readFileSync(join(ROOT, 'test/fixtures/track.gpx'), 'utf8');

test('reads track points with either quote style, as [lon, lat]', () => {
  const pts = parseGpx(xml);
  assert.equal(pts.length, 5);
  assert.deepEqual(pts[0], [-4.4, 36.7]);
  assert.deepEqual(pts[4], [-4.398, 36.701]);
});

test('simplifies straight stretches and keeps the corner', () => {
  const r = toRoute(parseGpx(xml), 5);
  assert.deepEqual(r, [[-4.4, 36.7], [-4.4, 36.701], [-4.398, 36.701]]);
});

test('measures the length', () => {
  const m = lengthM(parseGpx(xml));
  assert.ok(m > 280 && m < 300, String(m));
});

test('rejects a file with no points', () => {
  assert.throws(() => parseGpx('<gpx></gpx>'), /no <trkpt> or <rtept>/);
});
