import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveDist } from '../scripts/lib/serve.js';

test('the preview server survives bad encodings and stays inside public/', async () => {
  const d = mkdtempSync(join(tmpdir(), 'ecm-serve-'));
  mkdirSync(join(d, 'public')); mkdirSync(join(d, 'public-x'));
  writeFileSync(join(d, 'public/index.html'), 'ok'); writeFileSync(join(d, 'public-x/secret.txt'), 'secret');
  writeFileSync(join(d, 'firebase.json'), JSON.stringify({ hosting: { headers: [] } }));
  const s = await serveDist(d);
  const base = `http://127.0.0.1:${s.address().port}`;
  try {
    assert.equal((await fetch(base + '/%E0%A4%A')).status, 400);
    assert.equal((await fetch(base + '/..%2fpublic-x%2fsecret.txt')).status, 404);
    assert.equal(await (await fetch(base + '/')).text(), 'ok');
  } finally { s.close(); }
});
