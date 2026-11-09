import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadSchemas, validate } from '../scripts/lib/schema.js';
import { ROOT } from '../scripts/lib/data.js';

const get = loadSchemas(join(ROOT, 'schemas'));

test('localized values accept a string or a language map, nothing else', () => {
  const base = { id: 'x', name: 'X', date: '2027-01-01', timezone: 'UTC' };
  assert.deepEqual(validate(base, 'event.schema.json', get), []);
  assert.deepEqual(validate({ ...base, name: { es: 'a', en: 'b' } }, 'event.schema.json', get), []);
  assert.ok(validate({ ...base, name: { Spanish: 'a' } }, 'event.schema.json', get).length);
  assert.ok(validate({ ...base, name: 3 }, 'event.schema.json', get).length);
});

test('geometry types are limited to lines and polygons', () => {
  const s = { bands: [], streets: [{ id: 'a', name: 'A', bands: ['X'], geometry: { type: 'Point', coordinates: [0, 0] } }] };
  const e = validate(s, 'closures.schema.json', get);
  assert.ok(e.some(x => x.path === '/streets/0/geometry/type'), JSON.stringify(e));
});

test('paths and URLs that could escape or mislead are rejected', () => {
  const base = { id: 'x', name: 'X', date: '2027-01-01', timezone: 'UTC' };
  for (const path of ['../index.json', '/updates.json', 'a/../b.json', 'index.html']) assert.ok(validate({ ...base, updates: { path } }, 'event.schema.json', get).length, path);
  assert.deepEqual(validate({ ...base, updates: { path: 'data/updates.json' } }, 'event.schema.json', get), []);
  assert.ok(validate({ ...base, site: { ogImage: '../../x.png' } }, 'event.schema.json', get).length);
  for (const url of ['https://evil.com\\@malaga.eu/x', 'https://user@malaga.eu/', 'https://malaga.eu:8443/']) assert.ok(validate({ sources: [{ title: 'a', url }] }, 'sources.schema.json', get).length, url);
  assert.deepEqual(validate({ sources: [{ title: 'a', url: 'https://medium.com/@someone/post?a=1#b' }] }, 'sources.schema.json', get), []);
});
