import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nameToPattern, targetsFrom, buildQuery, resolve, apply } from '../scripts/fetch-streets.js';
import { ROOT } from '../scripts/lib/data.js';

const response = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/overpass.json'), 'utf8'));
const event = { languages: ['es'], map: { bbox: [-4.52, 36.66, -4.28, 36.76] } };
const run = streets => {
  const closures = { bands: [], streets };
  const targets = targetsFrom(closures, null, event, {});
  const results = resolve(targets, response);
  apply(results);
  return { closures, results, query: buildQuery(targets) };
};

test('names become accent-insensitive exact patterns', () => {
  const p = nameToPattern('Calle Mármoles (norte)');
  assert.equal(p, '^C[a\u00e1\u00e0\u00e2\u00e4]ll[e\u00e9\u00e8\u00ea\u00eb] M[a\u00e1\u00e0\u00e2\u00e4]rm[o\u00f3\u00f2\u00f4\u00f6]l[e\u00e9\u00e8\u00ea\u00eb]s \\(n[o\u00f3\u00f2\u00f4\u00f6]rt[e\u00e9\u00e8\u00ea\u00eb]\\)$');
  assert.equal(nameToPattern('\u00c1vila'), '^[A\u00c1\u00c0\u00c2\u00c4]v[i\u00ed\u00ec\u00ee\u00ef]l[a\u00e1\u00e0\u00e2\u00e4]$');
  assert.ok(new RegExp(p, 'iu').test('calle marmoles (norte)'));
});

test('a street name resolves to its ways, accents ignored, footways skipped', () => {
  const { closures, results } = run([{ id: 'marmoles', name: 'Calle Mármoles', bands: ['A'] }]);
  assert.deepEqual(results[0].ids, [1, 2]);
  assert.deepEqual(results[0].skipped, { footway: 1 });
  assert.equal(closures.streets[0].geometry.type, 'MultiLineString');
  assert.deepEqual(closures.streets[0].osm.resolved, [1, 2]);
  assert.match(closures.streets[0].osm.match, /^\^C/);
});

test('a name matching places far apart is reported as ambiguous, and osm.bbox narrows it', () => {
  let { results } = run([{ id: 'alemania', name: 'Calle Alemania', bands: ['A'] }]);
  assert.equal(results[0].ambiguous.length, 2);
  ({ results } = run([{ id: 'alemania', name: 'Calle Alemania', bands: ['A'], osm: { match: '^Calle Alemania$', bbox: [-4.52, 36.66, -4.40, 36.76] } }]));
  assert.deepEqual(results[0].ids, [10]);
  assert.equal(results[0].ambiguous.length, 0);
});

test('explicit way ids, anyTag and polygons', () => {
  const { closures, query } = run([
    { id: 'bridge', name: 'Puente Mediterráneo', bands: ['A'], osm: { ways: [30] } },
    { id: 'pier', name: 'Dique', bands: ['A'], osm: { match: '^Dique de Levante$', anyTag: true } },
    { id: 'square', name: 'Plaza Mayor', bands: ['A'], osm: { ways: [40], as: 'polygon' } },
  ]);
  assert.match(query, /way\(id:30\);/);
  assert.match(query, /way\["name"~"\^Dique de Levante\$",i\]\(36\.66,-4\.52,36\.76,-4\.28\);/);
  assert.deepEqual(closures.streets[0].geometry, { type: 'LineString', coordinates: [[-4.425, 36.73], [-4.4245, 36.7305]] });
  assert.equal(closures.streets[1].geometry.type, 'LineString');
  assert.equal(closures.streets[2].geometry.type, 'Polygon');
});

test('nothing is invented: a street with no match keeps no geometry', () => {
  const { closures, results } = run([{ id: 'nope', name: 'Calle Inexistente', bands: ['A'] }, { id: 'steps', name: 'Paseo Escalera', bands: ['A'] }]);
  assert.equal(closures.streets[0].geometry, undefined);
  assert.equal(results[0].geometry, null);
  assert.equal(closures.streets[1].geometry, undefined);
  assert.deepEqual(results[1].skipped, { footway: 1 });
});

test('streets that already have geometry are left alone unless forced', () => {
  const closures = { bands: [], streets: [{ id: 'a', name: 'Calle Mármoles', bands: ['A'], geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }] };
  assert.equal(targetsFrom(closures, null, event, {}).length, 0);
  assert.equal(targetsFrom(closures, null, event, { force: true }).length, 1);
});
