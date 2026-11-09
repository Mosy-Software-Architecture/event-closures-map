#!/usr/bin/env node
// npm run dev [-- --data <dir>] [--port 5173]: serves the page from src/ and the data folder,
// rebuilt on every request, and reloads the browser when a file changes.
import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { join } from 'node:path';
import { dataDir, loadData, arg, ROOT } from './lib/data.js';
import { checkData } from './lib/check.js';
import { siteFiles, mime } from './lib/site.js';

const dir = dataDir();
const port = Number(arg('--port') || process.env.PORT || 5173);
const clients = new Set();
const RELOAD = `new EventSource('/__dev/events').onmessage = () => location.reload();`;

function report() {
  try {
    const { errors, warnings } = checkData(loadData(dir));
    for (const w of warnings) console.warn(`⚠ ${w}`);
    for (const e of errors) console.error(`✗ ${e}`);
    console.log(`${errors.length ? '✗' : '✓'} ${errors.length} error(s), ${warnings.length} warning(s)`);
  } catch (e) { console.error(`✗ ${e.message}`); }
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  if (path === '__dev/reload.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(RELOAD); return; }
  if (path === '__dev/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  try {
    const files = siteFiles(loadData(dir), { dev: true });
    const get = files.get(path);
    if (!get) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': mime(path), 'Cache-Control': 'no-store' });
    res.end(get());
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(e.message);
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`dev server on http://127.0.0.1:${port}/ with data from ${dir}`);
  report();
});

let timer;
const onChange = () => { clearTimeout(timer); timer = setTimeout(() => { report(); for (const c of clients) c.write('data: reload\n\n'); }, 150); };
watch(dir, { recursive: true }, onChange);
watch(join(ROOT, 'src'), { recursive: true }, onChange);
