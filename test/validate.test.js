import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../scripts/lib/data.js';
import { checkData } from '../scripts/lib/check.js';
import { EXAMPLE, STARTER, copyData, read, write } from './helpers.js';

const errorsOf = dir => checkData(loadData(dir)).errors;

test('the Málaga example is valid', () => {
  const { errors, warnings } = checkData(loadData(EXAMPLE));
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('the starter data (event + branding only) is valid', () => {
  assert.deepEqual(errorsOf(STARTER), []);
});

test('a street that uses a band that does not exist is an error', () => {
  const dir = copyData(EXAMPLE);
  const c = read(dir, 'closures'); c.streets[0].bands.push('Z'); write(dir, 'closures', c);
  const errs = errorsOf(dir);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /closures\.json \/streets\/0 \(alameda_principal\): band "Z" does not exist \(bands: A, B, C, D, E, F, G\)/);
});

test('a URL that is not https is an error, in a field and inside rich text', () => {
  let dir = copyData(EXAMPLE);
  const s = read(dir, 'sources'); s.sources[1].url = 'http://example.org/'; write(dir, 'sources', s);
  assert.deepEqual(errorsOf(dir), ['sources.json /sources/1/url: "http://example.org/" is not valid: expected Absolute https:// URL']);
  dir = copyData(EXAMPLE);
  const e = read(dir, 'event'); e.info[0].items[0].en = 'See [this](http://example.org/)'; write(dir, 'event', e);
  assert.deepEqual(errorsOf(dir), ['event.json /info/0/items/0/en: link http://example.org/ must use https://']);
});

test('geometry outside the event bbox is an error', () => {
  const dir = copyData(EXAMPLE);
  const c = read(dir, 'closures'); c.streets[2].geometry = { type: 'LineString', coordinates: [[-3.70, 40.41], [-3.71, 40.42]] }; write(dir, 'closures', c);
  const errs = errorsOf(dir);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /closures\.json \/streets\/2 \(av_andalucia\)\/geometry: 2 point\(s\) outside the event bbox/);
});

test('two bands with the same colour, or a band that ends before it starts, are errors', () => {
  const dir = copyData(EXAMPLE);
  const c = read(dir, 'closures'); c.bands[1].color = c.bands[0].color; c.bands[2].to = '08:00'; write(dir, 'closures', c);
  const errs = errorsOf(dir);
  assert.ok(errs.some(x => /colour #e03634 is already used by band "A"/.test(x)));
  assert.ok(errs.some(x => /"from" 08:45 must be before "to" 08:00/.test(x)));
});

test('unknown properties and missing required ones are reported with their path', () => {
  const dir = copyData(STARTER);
  const e = read(dir, 'event'); delete e.timezone; e.colour = 'red'; write(dir, 'event', e);
  const errs = errorsOf(dir);
  assert.ok(errs.includes('event.json /: missing required property "timezone"'), errs.join('\n'));
  assert.ok(errs.includes('event.json /colour: unknown property "colour"'), errs.join('\n'));
});

test('a street without geometry is a warning, not an error', () => {
  const dir = copyData(STARTER);
  write(dir, 'closures', { bands: [{ id: 'A', from: '09:00', to: '10:00', color: '#ff0000' }], streets: [{ id: 'x', name: 'Calle X', bands: ['A'] }] });
  const { errors, warnings } = checkData(loadData(dir));
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => /no geometry yet/.test(w)));
});
