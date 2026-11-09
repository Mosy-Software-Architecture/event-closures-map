import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../scripts/build.js';
import { EXAMPLE, STARTER, copyData, read, write } from './helpers.js';

const out = () => mkdtempSync(join(tmpdir(), 'ecm-build-'));

test('the example builds with SEO tags, the crawlable list and no executable inline script', () => {
  const o = out();
  build(EXAMPLE, o);
  const html = readFileSync(join(o, 'public/index.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/cortes-trafico-maraton-malaga\.tomatic\.ai\/">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/cortes-trafico-maraton-malaga\.tomatic\.ai\/og\.png">/);
  assert.match(html, /<h3>Domingo, 8 de noviembre, de 8:15 a 12:30<\/h3><p>Alameda Principal, /);
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].map(m => m[1]);
  assert.deepEqual(inline, [' type="application/ld+json"']);
  assert.ok(existsSync(join(o, 'public/updates.json')), 'updates published at event.updates.path');
  assert.ok(existsSync(join(o, 'public/og.png')));
  assert.ok(existsSync(join(o, 'public/assets/tomatic-wordmark-dark.svg')));
});

test('firebase.json carries the security headers, with no unsafe-inline for scripts', () => {
  const o = out();
  build(EXAMPLE, o);
  const fb = JSON.parse(readFileSync(join(o, 'firebase.json'), 'utf8')).hosting;
  assert.equal(fb.site, 'tomatic-maraton');
  const h = Object.fromEntries(fb.headers[0].headers.map(x => [x.key, x.value]));
  assert.match(h['Content-Security-Policy'], /script-src 'self' https:\/\/unpkg\.com;/);
  assert.doesNotMatch(h['Content-Security-Policy'].split(';').find(d => d.includes('script-src')), /unsafe/);
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.match(h['Strict-Transport-Security'], /max-age=31536000/);
});

test('data cannot inject markup into the page', () => {
  const dir = copyData(EXAMPLE), o = out();
  const c = read(dir, 'closures'); c.streets[0].name = 'Evil</p><script>alert(1)</script>'; write(dir, 'closures', c);
  const b = read(dir, 'branding'); b.title = { es: '"><img src=x onerror=alert(1)>', en: 'x' }; write(dir, 'branding', b);
  build(dir, o);
  const html = readFileSync(join(o, 'public/index.html'), 'utf8');
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /Evil&lt;\/p&gt;&lt;script&gt;/);
});

test('the starter builds without a site URL and publishes empty optional files', () => {
  const o = out();
  build(STARTER, o);
  assert.deepEqual(JSON.parse(readFileSync(join(o, 'public/data/closures.json'), 'utf8')), { bands: [], streets: [] });
  assert.deepEqual(JSON.parse(readFileSync(join(o, 'public/data/updates.json'), 'utf8')), { items: [] });
  assert.ok(!existsSync(join(o, 'public/sitemap.xml')));
  assert.doesNotMatch(readFileSync(join(o, 'public/index.html'), 'utf8'), /\{\{\w+\}\}/);
});

test('a build with validation errors is refused', () => {
  const dir = copyData(STARTER);
  write(dir, 'closures', { bands: [], streets: [{ id: 'x', name: 'X', bands: ['nope'] }] });
  assert.throws(() => build(dir, out()), /1 validation error/);
});
