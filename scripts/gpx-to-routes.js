#!/usr/bin/env node
// npm run gpx-to-routes -- <file.gpx> --id <routeId> [--name "Marathon"] [--color #204246]
//                          [--style solid|dashed|dotted] [--tolerance 5] [--data <dir>]
// Reads a GPX track (or route), simplifies it and writes it into routes.json, creating the route
// or replacing the coordinates of an existing one (its other fields are kept).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, readJSON, writeJSON, arg } from './lib/data.js';
import { simplify, round5, haversine } from './lib/geo.js';

export function parseGpx(xml) {
  const pts = [];
  const re = /<(trkpt|rtept)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(xml))) {
    const lat = /\blat\s*=\s*["']([-\d.]+)["']/.exec(m[2]), lon = /\blon\s*=\s*["']([-\d.]+)["']/.exec(m[2]);
    if (lat && lon) pts.push([Number(lon[1]), Number(lat[1])]);
  }
  if (!pts.length) throw new Error('no <trkpt> or <rtept> points in the GPX file');
  return pts;
}
export const lengthM = pts => pts.slice(1).reduce((a, p, i) => a + haversine(pts[i], p), 0);

export function toRoute(points, toleranceM = 5) {
  const simple = simplify(points, toleranceM).map(([lon, lat]) => [round5(lon), round5(lat)]);
  return simple.filter((p, i) => i === 0 || p[0] !== simple[i - 1][0] || p[1] !== simple[i - 1][1]);
}

function main() {
  const file = process.argv.slice(2).find(a => a.toLowerCase().endsWith('.gpx'));
  const id = arg('--id');
  if (!file || !id) throw new Error('usage: npm run gpx-to-routes -- <file.gpx> --id <routeId> [--name "..."] [--tolerance 5]');
  const dir = dataDir();
  const tol = Number(arg('--tolerance') || 5);
  const raw = parseGpx(readFileSync(file, 'utf8'));
  const coords = toRoute(raw, tol);
  const path = join(dir, 'routes.json');
  const routes = existsSync(path) ? readJSON(path) : { routes: [], markers: [] };
  routes.routes ||= [];
  let r = routes.routes.find(x => x.id === id);
  if (!r) { r = { id, name: arg('--name') || id, color: arg('--color') || '#204246', style: arg('--style') || 'solid' }; routes.routes.push(r); }
  else {
    if (arg('--name')) r.name = arg('--name');
    if (arg('--color')) r.color = arg('--color');
    if (arg('--style')) r.style = arg('--style');
  }
  r.coordinates = coords;
  writeJSON(path, routes);
  console.log(`✓ ${id}: ${raw.length} GPX points -> ${coords.length} (tolerance ${tol} m), ${(lengthM(raw) / 1000).toFixed(2)} km. Start [${coords[0].join(', ')}], end [${coords.at(-1).join(', ')}].`);
  console.log('  Add start/finish markers in routes.json "markers" if you want them, then npm run validate.');
}

if (import.meta.url === `file://${process.argv[1]}`) { try { main(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); } }
