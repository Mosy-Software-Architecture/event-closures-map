// Schema validation plus the cross-file checks a schema cannot express.
import { join } from 'node:path';
import { loadSchemas, validate } from './schema.js';
import { positions, inBbox } from './geo.js';
import { ROOT } from './data.js';
import STRINGS from '../../src/strings.js';

const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

export function checkData(data) {
  const errors = [], warnings = [];
  const E = (file, path, msg) => errors.push(`${file}.json ${path}: ${msg}`);
  const W = (file, path, msg) => warnings.push(`${file}.json ${path}: ${msg}`);
  const getSchema = loadSchemas(join(ROOT, 'schemas'));
  for (const f of ['event', 'branding', 'closures', 'parking', 'routes', 'sources', 'updates', 'i18n']) {
    if (!data[f]) continue;
    for (const e of validate(data[f], `${f}.schema.json`, getSchema)) E(f, e.path, e.message);
  }
  if (errors.length) return { errors, warnings };

  const { event, branding, closures, parking, routes, sources, updates, i18n } = data;
  const langs = event.languages || ['es', 'en'];
  const bbox = event.map && event.map.bbox;

  // every rich-text link and every localized value, anywhere
  const walk = (file, v, path) => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(LINK)) if (m[1] !== '{url}' && !m[1].startsWith('https://')) E(file, path, `link ${m[1]} must use https://`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(file, x, `${path}/${i}`));
    else if (v && typeof v === 'object') {
      const keys = Object.keys(v);
      const looksLocalized = keys.length && keys.every(k => /^[a-z]{2,3}$/.test(k)) && keys.every(k => typeof v[k] === 'string');
      if (looksLocalized && file !== 'i18n') for (const l of langs) if (!(l in v)) W(file, path, `no "${l}" text; the page will fall back to "${langs[0]}"`);
      for (const k of keys) if (k !== 'geometry' && k !== 'coordinates') walk(file, v[k], `${path}/${k}`);
    }
  };
  for (const f of ['event', 'branding', 'closures', 'parking', 'routes', 'sources']) if (data[f]) walk(f, data[f], '');

  // timeline and bands
  const tl = event.timeline || {};
  if (tl.start && tl.end && toMin(tl.start) >= toMin(tl.end)) E('event', '/timeline', `start ${tl.start} must be before end ${tl.end}`);
  const bandIds = new Set(), colors = new Map();
  closures.bands.forEach((b, i) => {
    const p = `/bands/${i}`;
    if (bandIds.has(b.id)) E('closures', p, `duplicate band id "${b.id}"`);
    bandIds.add(b.id);
    const c = b.color.toLowerCase();
    if (colors.has(c)) E('closures', p, `colour ${b.color} is already used by band "${colors.get(c)}"; each band needs its own colour`);
    colors.set(c, b.id);
    if (toMin(b.from) >= toMin(b.to)) E('closures', p, `"from" ${b.from} must be before "to" ${b.to}`);
    if (tl.start && tl.end && (toMin(b.from) < toMin(tl.start) || toMin(b.to) > toMin(tl.end))) W('closures', p, `band ${b.from}-${b.to} goes outside the slider window ${tl.start}-${tl.end}`);
  });

  // streets
  const ids = new Set();
  closures.streets.forEach((s, i) => {
    const p = `/streets/${i} (${s.id})`;
    if (ids.has(s.id)) E('closures', p, `duplicate street id "${s.id}"`);
    ids.add(s.id);
    for (const b of s.bands) if (!bandIds.has(b)) E('closures', p, `band "${b}" does not exist (bands: ${[...bandIds].join(', ') || 'none'})`);
    if (!s.geometry) W('closures', p, 'no geometry yet: run `npm run fetch-streets` (steer it with osm.match, osm.bbox or osm.ways); until then the street is listed but not drawn');
  });

  // geometry inside the event bbox
  const checkPos = (file, path, pts) => {
    if (!bbox) return;
    const out = pts.filter(pt => !inBbox(pt, bbox));
    if (out.length) E(file, path, `${out.length} point(s) outside the event bbox [${bbox.join(', ')}], first at [${out[0].join(', ')}]`);
  };
  closures.streets.forEach((s, i) => checkPos('closures', `/streets/${i} (${s.id})/geometry`, positions(s.geometry)));
  (parking.bans || []).forEach((b, i) => checkPos('parking', `/bans/${i}/geometry`, positions(b.geometry)));
  (parking.carParks || []).forEach((c, i) => checkPos('parking', `/carParks/${i}`, [[c.lon, c.lat]]));
  (routes.routes || []).forEach((r, i) => checkPos('routes', `/routes/${i} (${r.id})/coordinates`, r.coordinates));
  (routes.markers || []).forEach((m, i) => checkPos('routes', `/markers/${i}`, [[m.lon, m.lat]]));
  if (bbox) {
    const [w, s, e, n] = bbox;
    if (w >= e || s >= n) E('event', '/map/bbox', 'bbox must be [west, south, east, north]');
    const [lat, lon] = event.map.center;
    if (!inBbox([lon, lat], bbox)) E('event', '/map/center', 'center is outside the bbox (it is [lat, lon], the bbox is [west, south, east, north])');
  }
  const routeIds = new Set((routes.routes || []).map(r => r.id));
  (routes.markers || []).forEach((m, i) => { if (m.route && !routeIds.has(m.route)) E('routes', `/markers/${i}`, `route "${m.route}" does not exist`); });

  // sources, updates, i18n
  if (!sources.sources.length) W('sources', '/sources', 'no official sources: the notice links to "#"');
  else if (!sources.sources.some(s => s.primary)) W('sources', '/sources', 'no source has "primary": true; the first one is used as the main source');
  for (const l of langs) if (!STRINGS[l] && !(i18n[l])) W('event', '/languages', `"${l}" has no built-in interface strings; add them to i18n.json or the interface falls back to English`);
  for (const l of Object.keys(i18n)) if (l !== '$schema') for (const k of Object.keys(i18n[l])) if (!(k in STRINGS.en)) W('i18n', `/${l}/${k}`, 'unknown key (see src/strings.js)');
  if (updates) updates.items.forEach((it, i) => { if (!langs.some(l => it[l])) E('updates', `/items/${i}`, `needs text in at least one of ${langs.join(', ')}`); });
  if (branding.credit === false) W('branding', '/credit', 'the footer credit is off. It is allowed, but please keep it if you can.');
  return { errors, warnings };
}
