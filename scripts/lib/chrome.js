// Drives a headless Chrome through the DevTools protocol, with Node's built-in WebSocket.
// Used by the smoke test and by the OG image generator.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
export const findChrome = () => CANDIDATES.find(p => existsSync(p)) || null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch() {
  const bin = findChrome();
  if (!bin) throw new Error('Chrome not found; set CHROME_PATH');
  const profile = mkdtempSync(join(tmpdir(), 'ecm-chrome-'));
  const proc = spawn(bin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) {}
  }
  if (!port) { proc.kill(); throw new Error('Chrome did not start'); }
  const close = () => { proc.kill(); setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500); };
  return { port, close };
}

export async function openPage(port) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), listeners = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method) for (const l of listeners) l(m);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  return { send, evaluate, on: fn => listeners.push(fn), close: () => ws.close() };
}

// Loads a URL at a viewport size and collects what went wrong on the way.
export async function inspect(url, { width = 1280, height = 800, scale = 1, mobile = false, settleMs = 1500, screenshot = true } = {}) {
  const chrome = await launch();
  try {
    const page = await openPage(chrome.port);
    const problems = [];
    page.on(m => {
      if (m.method === 'Runtime.exceptionThrown') problems.push(`exception: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push(`console.error: ${m.params.args.map(a => a.value ?? a.description).join(' ')}`);
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/tile\.openstreetmap\.org/.test(m.params.entry.url || '')) problems.push(`${m.params.entry.source}: ${m.params.entry.text}`);
    });
    await page.send('Runtime.enable'); await page.send('Log.enable'); await page.send('Page.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
    await page.send('Page.navigate', { url });
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) { await sleep(100); ready = await page.evaluate("document.documentElement.dataset.ready === '1'").catch(() => false); }
    if (!ready) problems.push('page never finished rendering (no data-ready)');
    await sleep(settleMs);
    const stats = await page.evaluate(`({
      paths: document.querySelectorAll('.leaflet-overlay-pane path').length,
      title: document.getElementById('title').textContent,
      legend: document.querySelectorAll('#legend label').length,
      lang: document.documentElement.lang,
    })`);
    const shot = screenshot ? Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64') : null;
    page.close();
    return { problems, stats, shot };
  } finally { chrome.close(); }
}
