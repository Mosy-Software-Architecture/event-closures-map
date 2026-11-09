#!/usr/bin/env node
// npm run fetch-streets [-- --data <dir>] [--only id,id] [--force] [--dry-run] [--no-cache] [--accept-ambiguous]
//
// Resolves street names to OpenStreetMap geometry through the Overpass API and writes it into
// closures.json (and parking.json for bans with an "osm" block). It never invents a line: a street
// with no match keeps no geometry and is listed as not found; a name that matches ways far apart
// from each other is listed as ambiguous so a person (or the agent) narrows it with osm.bbox or
// osm.ways.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { dataDir, readJSON, writeJSON, arg, flag, ROOT } from './lib/data.js';
import { round5, clusters, haversine, inBbox, clipLine } from './lib/geo.js';

const SKIP_HIGHWAYS = new Set(['footway', 'steps', 'path', 'cycleway', 'platform', 'corridor', 'bus_stop', 'elevator', 'bridleway', 'proposed', 'construction']);
const ENDPOINTS = (process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter').split(',');
const AMBIGUOUS_M = 1500;

// "Calle Mármoles" -> ^Calle M[áa]rmoles$ : accent-insensitive, exact name
const ACCENTS = { a: '\u00e1\u00e0\u00e2\u00e4', e: '\u00e9\u00e8\u00ea\u00eb', i: '\u00ed\u00ec\u00ee\u00ef', o: '\u00f3\u00f2\u00f4\u00f6', u: '\u00fa\u00f9\u00fb\u00fc' };
export function nameToPattern(name) {
  let out = '';
  for (const ch of name.normalize('NFC')) {
    const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const lower = base.toLowerCase();
    if (ACCENTS[lower]) out += base === lower ? `[${lower}${ACCENTS[lower]}]` : `[${base}${ACCENTS[lower].toUpperCase()}]`;
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return `^${out}$`;
}

const qlString = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const bboxQL = ([w, s, e, n]) => `${s},${w},${n},${e}`;

export function targetsFrom(closures, parking, event, { only, force } = {}) {
  const lang = (event.languages && event.languages[0]) || 'es';
  const list = [];
  const add = (kind, item) => {
    if (only && !only.includes(item.id)) return;
    if (item.geometry && !force) return;
    if (!item.osm && kind === 'ban') return;
    const name = typeof item.name === 'object' ? (item.name[lang] ?? Object.values(item.name)[0]) : item.name;
    const osm = item.osm || {};
    const match = osm.match || (osm.ways && osm.ways.length ? null : nameToPattern(name));
    list.push({ kind, item, name, match, derived: !osm.match && !!match, ways: osm.ways || [], bbox: osm.bbox || event.map.bbox, clip: !!osm.bbox && osm.as !== 'polygon', anyTag: !!osm.anyTag, footways: !!osm.includeFootways, polygon: osm.as === 'polygon' });
  };
  for (const s of closures.streets) add('street', s);
  for (const b of (parking && parking.bans) || []) add('ban', b);
  return list;
}

export function buildQuery(targets) {
  const clauses = [];
  for (const t of targets) {
    if (t.match) clauses.push(`  way${t.anyTag ? '' : '["highway"]'}["name"~"${qlString(t.match)}",i](${bboxQL(t.bbox)});`);
    if (t.ways.length) clauses.push(`  way(id:${t.ways.join(',')});`);
  }
  return `[out:json][timeout:180];\n(\n${[...new Set(clauses)].join('\n')}\n);\nout tags geom;`;
}

async function overpass(query, { cache = true } = {}) {
  const dir = join(ROOT, '.cache', 'overpass');
  const key = createHash('sha256').update(query).digest('hex').slice(0, 16);
  const file = join(dir, key + '.json');
  if (cache && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'User-Agent': 'event-closures-map (+https://github.com/Mosy-Software-Architecture/event-closures-map)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify(json));
      return json;
    } catch (e) { lastErr = e; console.warn(`⚠ Overpass ${url}: ${e.message}`); }
  }
  throw new Error(`Overpass failed: ${lastErr && lastErr.message}`);
}

// Assigns the ways of an Overpass response to each target. Pure: easy to test with a recorded response.
export function resolve(targets, response) {
  const ways = (response.elements || []).filter(e => e.type === 'way' && Array.isArray(e.geometry));
  const byId = new Map(ways.map(w => [w.id, w]));
  const results = [];
  for (const t of targets) {
    const re = t.match ? new RegExp(t.match, 'iu') : null;
    const picked = new Map();
    for (const id of t.ways) if (byId.has(id)) picked.set(id, byId.get(id));
    const missingIds = t.ways.filter(id => !byId.has(id));
    const skipped = new Map();
    if (re) for (const w of ways) {
      const tags = w.tags || {};
      if (!tags.name || !re.test(tags.name)) continue;
      if (!tags.highway && !t.anyTag) continue;
      if (tags.highway && SKIP_HIGHWAYS.has(tags.highway) && !t.footways) { skipped.set(tags.highway, (skipped.get(tags.highway) || 0) + 1); continue; }
      const pts = w.geometry.map(p => [p.lon, p.lat]);
      if (!pts.some(p => inBbox(p, t.bbox))) continue;
      picked.set(w.id, w);
    }
    let lines = [...picked.values()].map(w => w.geometry.map(p => [p.lon, p.lat]));
    // an explicit osm.bbox also cuts the ways at its edge, so only the part of a long street inside it is drawn
    if (t.clip) lines = lines.flatMap(l => clipLine(l, t.bbox));
    lines = lines.map(l => l.map(([lon, lat]) => [round5(lon), round5(lat)])).filter(l => l.length > 1);
    let geometry = null;
    if (lines.length) {
      if (t.polygon) {
        const rings = lines.map(l => (l[0][0] === l.at(-1)[0] && l[0][1] === l.at(-1)[1] ? l : [...l, l[0]]));
        geometry = rings.length === 1 ? { type: 'Polygon', coordinates: [rings[0]] } : { type: 'MultiPolygon', coordinates: rings.map(r => [r]) };
      } else geometry = lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines };
    }
    // far-apart groups of ways with the same name: probably two different streets
    let groups = [];
    if (lines.length > 1 && !t.polygon) {
      groups = clusters(lines).map(idx => {
        const pts = idx.flatMap(i => lines[i]);
        const c = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
        return { ways: idx.length, center: [round5(c[1]), round5(c[0])] };
      });
      groups.sort((a, b) => b.ways - a.ways);
      const far = groups.some(g => haversine([groups[0].center[1], groups[0].center[0]], [g.center[1], g.center[0]]) > AMBIGUOUS_M);
      if (!far) groups = [];
    }
    results.push({
      target: t, geometry, ids: [...picked.keys()].sort((a, b) => a - b), missingIds,
      osmNames: [...new Set([...picked.values()].map(w => (w.tags && w.tags.name) || `way ${w.id}`))],
      skipped: Object.fromEntries(skipped), ambiguous: groups,
    });
  }
  return results;
}

// Ambiguous streets are not written unless acceptAmbiguous: drawing two places at once is worse than none.
export function apply(results, { acceptAmbiguous = false } = {}) {
  for (const r of results) {
    const it = r.target.item;
    if (!r.geometry || (r.ambiguous.length && !acceptAmbiguous)) continue;
    it.geometry = r.geometry;
    it.osm = { ...(it.osm || {}), ...(r.target.derived ? { match: r.target.match } : {}), resolved: r.ids };
  }
}

function report(results) {
  const notFound = results.filter(r => !r.geometry), amb = results.filter(r => r.ambiguous.length);
  for (const r of results) {
    if (!r.geometry) continue;
    const extra = Object.keys(r.skipped).length ? ` (skipped ${Object.entries(r.skipped).map(([k, v]) => `${v} ${k}`).join(', ')})` : '';
    console.log(`✓ ${r.target.item.id}: ${r.ids.length} way(s) named ${r.osmNames.map(n => `"${n}"`).join(', ')}${extra}`);
  }
  for (const r of results) if (r.missingIds.length) console.log(`✗ ${r.target.item.id}: way id(s) ${r.missingIds.join(', ')} not returned by Overpass`);
  if (amb.length) {
    console.log(`\n⚠ ${amb.length} ambiguous: the same name matches places more than ${AMBIGUOUS_M / 1000} km apart. Their geometry is NOT written. Narrow them with osm.bbox [west, south, east, north] or osm.ways (or rerun with --accept-ambiguous if every place is right):`);
    for (const r of amb) console.log(`  - ${r.target.item.id} ("${r.target.name}"): ${r.ambiguous.map(g => `${g.ways} way(s) around [${g.center.join(', ')}]`).join('; ')}`);
  }
  if (notFound.length) {
    console.log(`\n✗ ${notFound.length} not found. Nothing was drawn for them. Check the OSM name on openstreetmap.org and set osm.match (regex) or osm.ways:`);
    for (const r of notFound) console.log(`  - ${r.target.item.id}: no OSM way named "${r.target.name}"${r.target.derived ? ' (accents and case ignored)' : r.target.match ? ` matching /${r.target.match}/i` : ''}${r.target.ways.length ? ` ways ${r.target.ways.join(',')}` : ''}${Object.keys(r.skipped).length ? `; only footpaths matched (${Object.keys(r.skipped).join(', ')}), set osm.includeFootways: true if they count` : ''}`);
  }
  return { notFound: notFound.map(r => r.target.item.id), ambiguous: amb.map(r => r.target.item.id) };
}

async function main() {
  const dir = dataDir();
  const event = readJSON(join(dir, 'event.json'));
  if (!event.map || !event.map.bbox) throw new Error('event.json needs map.bbox [west, south, east, north] to limit the search to the event area');
  const closuresPath = join(dir, 'closures.json'), parkingPath = join(dir, 'parking.json');
  const closures = existsSync(closuresPath) ? readJSON(closuresPath) : { bands: [], streets: [] };
  const parking = existsSync(parkingPath) ? readJSON(parkingPath) : null;
  const only = arg('--only') ? arg('--only').split(',') : null;
  const targets = targetsFrom(closures, parking, event, { only, force: flag('--force') });
  if (!targets.length) { console.log('Nothing to fetch: every street already has geometry (use --force to refetch, --only id,id to pick).'); return; }
  const query = buildQuery(targets);
  const fixture = arg('--fixture');
  console.log(`Looking up ${targets.length} street(s) in OpenStreetMap${fixture ? ' (recorded response)' : ''}…`);
  const response = fixture ? readJSON(fixture) : await overpass(query, { cache: !flag('--no-cache') });
  const results = resolve(targets, response);
  const summary = report(results);
  if (flag('--dry-run')) { console.log('\n(dry run: nothing written)'); return summary; }
  apply(results, { acceptAmbiguous: flag('--accept-ambiguous') });
  writeJSON(closuresPath, closures);
  if (parking && targets.some(t => t.kind === 'ban')) writeJSON(parkingPath, parking);
  console.log(`\nWrote ${results.filter(r => r.geometry && (!r.ambiguous.length || flag('--accept-ambiguous'))).length} geometries. Next: npm run validate, then look at them on the map with npm run dev.`);
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(`✗ ${e.message}`); process.exit(1); });
