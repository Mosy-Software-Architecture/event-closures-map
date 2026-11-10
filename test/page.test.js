// Browser checks of the page itself. Skipped when Chrome is not available.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { build } from '../scripts/build.js';
import { serveDist } from '../scripts/lib/serve.js';
import { findChrome, launch, openPage } from '../scripts/lib/chrome.js';
import { EXAMPLE, STARTER, copyData, read, write, tmp } from './helpers.js';

const skip = !findChrome();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function page(dataDirPath, query, size) {
  const out = tmp('ecm-page-');
  build(dataDirPath, out);
  const server = await serveDist(out);
  const chrome = await launch();
  const p = await openPage(chrome.port);
  await p.send('Emulation.setDeviceMetricsOverride', { deviceScaleFactor: 1, mobile: false, ...size });
  await p.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/${query}` });
  for (let i = 0; i < 100; i++) { await sleep(100); if (await p.evaluate("document.documentElement.dataset.ready === '1'").catch(() => false)) break; }
  await sleep(500);
  return { evaluate: p.evaluate, close: async () => { p.close(); await chrome.close(); server.close(); } };
}

test('on a phone, an event notice without a short version is shown in full', { skip }, async () => {
  const dir = copyData(STARTER);
  const e = read(dir, 'event'); e.notice = { en: 'TEST DATA. Invented times.', es: 'DATOS DE PRUEBA.' }; write(dir, 'event', e);
  const p = await page(dir, '?lang=en', { width: 390, height: 844, mobile: true });
  try {
    const r = await p.evaluate(`({ full: getComputedStyle(document.getElementById('notice')).display, text: document.getElementById('noticewrap').innerText })`);
    assert.notEqual(r.full, 'none');
    assert.match(r.text, /TEST DATA\. Invented times\./);
    assert.doesNotMatch(r.text, /Unofficial information/);
  } finally { await p.close(); }
});

test('?t= sets the time and ?view= the map', { skip }, async () => {
  const p = await page(EXAMPLE, '?lang=es&t=13:00&view=36.72,-4.42,16', { width: 1280, height: 800 });
  try {
    const r = await p.evaluate(`({ label: document.getElementById('tlabel').textContent, count: document.getElementById('tcount').textContent })`);
    assert.equal(r.label, '13:00');
    assert.match(r.count, /calles cortadas/);
    const zoom = await p.evaluate(`document.querySelector('.leaflet-tile-container img') ? document.querySelector('.leaflet-tile-container img').src.match(/\\/(\\d+)\\/\\d+\\/\\d+\\.png/)[1] : ''`);
    assert.equal(zoom, '16');
  } finally { await p.close(); }
});
