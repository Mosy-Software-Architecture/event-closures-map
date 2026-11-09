// Tiny static server for dist/public that applies the headers from dist/firebase.json,
// so a local preview behaves like the published site (CSP included).
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { mime } from './site.js';

const globToRe = g => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*') + '$');

export function serveDist(distDir, port = 0) {
  const pub = join(distDir, 'public');
  const conf = JSON.parse(readFileSync(join(distDir, 'firebase.json'), 'utf8')).hosting;
  const server = createServer((req, res) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end('bad request'); return; }
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(pub, path));
    if (!file.startsWith(pub + sep) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    const headers = { 'Content-Type': mime(file) };
    for (const h of conf.headers || []) if (globToRe(h.source).test(path)) for (const { key, value } of h.headers) headers[key] = value;
    delete headers['Strict-Transport-Security'];
    // upgrade-insecure-requests would turn http://localhost requests into https and break the preview
    if (headers['Content-Security-Policy']) headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(/; upgrade-insecure-requests/, '');
    res.writeHead(200, headers);
    res.end(readFileSync(file));
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}
