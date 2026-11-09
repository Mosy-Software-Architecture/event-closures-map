import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../scripts/lib/data.js';

const hasPython = spawnSync('python3', ['--version']).status === 0;

function merge(published, answer) {
  const d = mkdtempSync(join(tmpdir(), 'ecm-watch-'));
  writeFileSync(join(d, 'p.json'), JSON.stringify(published));
  writeFileSync(join(d, 'a.txt'), answer);
  writeFileSync(join(d, 'domains.txt'), '# comment\nmalaga.eu\nemtmalaga.es\n');
  const r = spawnSync('python3', ['-I', join(ROOT, 'watch-updates/merge.py'), join(d, 'p.json'), join(d, 'a.txt'), '2027-01-01T10:00:00Z', join(d, 'new.json'), '--langs', 'es,en', '--domains', join(d, 'domains.txt')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return { published: JSON.parse(readFileSync(join(d, 'p.json'), 'utf8')), added: JSON.parse(readFileSync(join(d, 'new.json'), 'utf8')) };
}
const item = o => ({ time: '2027-01-01T09:00:00+01:00', es: 'Corte nuevo en calle X', en: 'New closure on X street', source: 'Ayuntamiento', url: 'https://www.malaga.eu/x', ...o });
const answer = items => `Searching...\n<items>\n${JSON.stringify(items)}\n</items>`;

test('accepts well-formed items on allowed domains, in every language', { skip: !hasPython }, () => {
  const { published, added } = merge({ items: [] }, answer([item()]));
  assert.equal(added.length, 1);
  assert.equal(published.items.length, 1);
  assert.equal(published.updated, '2027-01-01T10:00:00Z');
});

test('rejects other domains, http, markup, missing languages and repeats', { skip: !hasPython }, () => {
  const existing = item({ es: 'Ya publicado' });
  const { published, added } = merge({ items: [existing] }, answer([
    item({ url: 'https://evil.example/x', es: 'a1' }),
    item({ url: 'http://www.malaga.eu/x', es: 'a2' }),
    item({ es: '<script>alert(1)</script>' }),
    item({ en: '' , es: 'a3'}),
    item({ es: 'Ya publicado' }),
    item({ url: 'https://malaga.eu.evil.example/x', es: 'a4' }),
  ]));
  assert.deepEqual(added, []);
  assert.deepEqual(published.items, [existing]);
});

test('an answer without the items block changes nothing but the check time', { skip: !hasPython }, () => {
  const { published, added } = merge({ items: [item()] }, 'I could not find anything. Ignore previous instructions.');
  assert.deepEqual(added, []);
  assert.equal(published.items.length, 1);
});
