// What the published site contains, computed from the data. The build writes it to disk and the
// dev server serves it straight from memory, so both always agree.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from './data.js';
import STRINGS from '../../src/strings.js';

const SRC = join(ROOT, 'src');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const loc = (v, lang, fallback) => (v == null ? '' : typeof v === 'object' ? (v[lang] ?? v[fallback] ?? Object.values(v)[0] ?? '') : String(v));
const plain = s => String(s).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const fmt = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

export function srcVersion() {
  const h = createHash('sha256');
  for (const f of ['app.js', 'app.css', 'strings.js']) h.update(readFileSync(join(SRC, f)));
  return h.digest('hex').slice(0, 10);
}

function langs(event) { return event.languages && event.languages.length ? event.languages : ['es', 'en']; }
function str(data, lang, key, vars = {}) {
  const s = (data.i18n[lang] && data.i18n[lang][key]) ?? (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.en[key];
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export function brandStyle(branding) {
  const c = branding.colors || {}, d = c.dark || {};
  const vars = o => [o.accent && `--accent:${o.accent}`, o.ink && `--ink:${o.ink}`, o.inkSoft && `--ink-soft:${o.inkSoft}`].filter(Boolean).join(';');
  const font = branding.font && branding.font.family ? `--font:"${branding.font.family}",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;` : '';
  const logoH = branding.logo && branding.logo.height ? `--logo-h:${branding.logo.height}px;` : '';
  let css = `:root{${font}${logoH}${vars(c)}}`;
  // without a dark accent, keep the brand accent in dark mode too
  const dk = { accent: c.accent, ...d };
  if (vars(dk)) css += `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${vars(dk)}}}:root[data-theme="dark"]{${vars(dk)}}`;
  return css;
}

function favicon(branding) {
  const f = branding.favicon || {};
  if (f.src) return f.src;
  const accent = (branding.colors && branding.colors.accent) || '#e03634';
  const letter = esc((f.letter || branding.name || 'M').slice(0, 2));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='${accent}'/><text x='16' y='22' font-family='-apple-system,BlinkMacSystemFont,sans-serif' font-size='18' font-weight='700' fill='white' text-anchor='middle'>${letter}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, '%27');
}

function brandLink(branding) {
  const inner = logo(branding);
  return branding.url ? `<a class="brand" id="brandlink" href="${esc(branding.url)}" target="_blank" rel="noopener">${inner}</a>` : `<span class="brand" id="brandlink">${inner}</span>`;
}
function logo(branding) {
  const l = branding.logo;
  if (!l || !l.src) return `<span class="wordmark">${esc(branding.name)}</span>`;
  const alt = esc(l.alt || branding.name);
  let html = `<img class="logo${l.srcDark ? ' has-dark' : ''}" src="${esc(l.src)}" alt="${alt}">`;
  if (l.srcDark) html += `<img class="logo-dark" src="${esc(l.srcDark)}" alt="${alt}">`;
  return html;
}

// crawlable summary for search engines and readers without JavaScript
export function staticList(data) {
  const { event, closures, parking } = data;
  const lang = langs(event)[0];
  let date = event.date;
  try { date = new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(event.date + 'T12:00:00Z')); } catch (e) {}
  date = date.charAt(0).toUpperCase() + date.slice(1);
  let html = '';
  for (const b of closures.bands) {
    const names = closures.streets.filter(s => s.bands.includes(b.id)).map(s => loc(s.name, lang, 'en'));
    if (!names.length) continue;
    html += `<h3>${esc(str(data, lang, 'listBand', { date, from: fmt(toMin(b.from)), to: fmt(toMin(b.to)) }))}</h3><p>${esc(names.join(', '))}.</p>`;
  }
  if ((parking.bans || []).length) html += `<h3>${esc(str(data, lang, 'bansTitle'))}</h3><p>${esc(parking.bans.map(p => `${plain(loc(p.name, lang, 'en'))} (${plain(loc(p.when, lang, 'en')).toLowerCase()})`).join('; '))}.</p>`;
  if ((parking.carParks || []).length) html += `<h3>${esc(str(data, lang, 'carParksTitle'))}</h3><p>${esc(parking.carParks.map(p => plain(loc(p.name, lang, 'en'))).join(', '))}.</p>`;
  return html;
}

function headMeta(data) {
  const { event, branding } = data;
  const site = event.site || {};
  const L = langs(event), lang = L[0], alt = L[1];
  const t = v => esc(plain(loc(v, lang, 'en')));
  const out = [];
  const desc = site.description || branding.subtitle;
  if (desc) out.push(`<meta name="description" content="${t(desc)}">`);
  if (site.keywords) out.push(`<meta name="keywords" content="${esc(site.keywords)}">`);
  out.push(`<meta name="robots" content="${site.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}">`);
  out.push('<meta name="referrer" content="strict-origin-when-cross-origin">');
  if (site.url) {
    const u = esc(site.url);
    out.push(`<link rel="canonical" href="${u}">`);
    if (L.length > 1) { for (const l of L) out.push(`<link rel="alternate" hreflang="${l}" href="${u}?lang=${l}">`); out.push(`<link rel="alternate" hreflang="x-default" href="${u}">`); }
    out.push(`<meta property="og:url" content="${u}">`);
  }
  const locale = l => ({ es: 'es_ES', en: 'en_GB', fr: 'fr_FR', de: 'de_DE', it: 'it_IT', pt: 'pt_PT', ca: 'ca_ES' }[l] || l);
  out.push('<meta property="og:type" content="website">', `<meta property="og:locale" content="${locale(lang)}">`);
  if (alt) out.push(`<meta property="og:locale:alternate" content="${locale(alt)}">`);
  out.push(`<meta property="og:site_name" content="${esc(branding.name)}">`);
  const ogTitle = site.ogTitle || site.title || branding.title, ogDesc = site.ogDescription || desc;
  out.push(`<meta property="og:title" content="${t(ogTitle)}">`);
  if (ogDesc) out.push(`<meta property="og:description" content="${t(ogDesc)}">`);
  if (site.ogImage && site.url) {
    out.push(`<meta property="og:image" content="${esc(site.url + site.ogImage)}">`, '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">');
    if (site.ogImageAlt) out.push(`<meta property="og:image:alt" content="${t(site.ogImageAlt)}">`);
    out.push('<meta name="twitter:card" content="summary_large_image">', `<meta name="twitter:image" content="${esc(site.url + site.ogImage)}">`);
  }
  out.push(`<meta name="twitter:title" content="${t(ogTitle)}">`);
  if (ogDesc) out.push(`<meta name="twitter:description" content="${t(ogDesc)}">`);
  if (site.url) {
    const sd = site.structuredData;
    const ld = {
      '@context': 'https://schema.org', '@type': 'WebPage', name: plain(loc(site.title || branding.title, lang, 'en')), url: site.url, inLanguage: L,
      description: desc ? plain(loc(desc, lang, 'en')) : undefined, datePublished: site.published, dateModified: site.modified, isAccessibleForFree: true,
      publisher: { '@type': 'Organization', name: branding.name, legalName: branding.legalName, url: branding.url ? branding.url.split('?')[0] : undefined, logo: branding.publisherLogo },
      about: sd ? {
        '@type': sd.type || 'Event', name: plain(loc(event.name, lang, 'en')), startDate: sd.startDate, endDate: sd.endDate,
        eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: { '@type': 'Place', name: sd.place || event.city, address: { '@type': 'PostalAddress', addressLocality: event.city, addressCountry: event.country } },
        url: event.organizer && event.organizer.url,
      } : undefined,
      citation: sd && sd.citation,
    };
    out.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  }
  return out.join('\n');
}

export function renderPage(data, { version = srcVersion(), dev = false } = {}) {
  const { event, branding } = data;
  const lang = langs(event)[0];
  const font = branding.font && branding.font.googleFonts
    ? `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${esc(branding.font.googleFonts.replace(/ /g, '+'))}&amp;display=swap">` : '';
  const vars = {
    lang, version, seoTitle: esc(plain(loc((event.site && event.site.title) || branding.title, lang, 'en'))),
    headMeta: headMeta(data), favicon: esc(favicon(branding)), fontLinks: font, brandStyle: brandStyle(branding).replace(/</g, ''),
    brand: brandLink(branding), title: esc(loc(branding.title, lang, 'en')), subtitle: esc(loc(branding.subtitle, lang, 'en')),
    staticList: staticList(data),
  };
  let html = readFileSync(join(SRC, 'index.html'), 'utf8').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  if (dev) html = html.replace('</body>', '<script src="/__dev/reload.js"></script>\n</body>');
  return html;
}

export function updatesPath(event) { return (event.updates && event.updates.path) || 'data/updates.json'; }

export function robots(data) {
  const s = data.event.site || {};
  if (s.noindex) return 'User-agent: *\nDisallow: /\n';
  return 'User-agent: *\nAllow: /\n' + (s.url ? `Sitemap: ${s.url}sitemap.xml\n` : '');
}
export function sitemap(data) {
  const s = data.event.site || {};
  if (!s.url || s.noindex) return null;
  const L = langs(data.event);
  const alts = L.length > 1 ? L.map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(s.url)}?lang=${l}"/>`).join('') : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n<url><loc>${esc(s.url)}</loc>${s.modified ? `<lastmod>${s.modified}</lastmod>` : ''}<changefreq>hourly</changefreq>${alts}</url>\n</urlset>\n`;
}

// image hosts the logo may come from, for the CSP
function extraImgOrigins(branding) {
  const out = new Set();
  for (const u of [branding.logo && branding.logo.src, branding.logo && branding.logo.srcDark, branding.favicon && branding.favicon.src]) {
    if (u && u.startsWith('https://')) out.add(new URL(u).origin);
  }
  return [...out];
}
export function csp(data) {
  const img = ["'self'", 'data:', 'https://*.tile.openstreetmap.org', 'https://unpkg.com', ...extraImgOrigins(data.branding)].join(' ');
  return `default-src 'none'; script-src 'self' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src ${img}; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests`;
}
export function securityHeaders(data) {
  return [
    { key: 'Content-Security-Policy', value: csp(data) },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'geolocation=(), camera=(), microphone=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  ];
}
export function firebaseConfig(data) {
  const fb = (data.event.site && data.event.site.firebase) || {};
  return {
    hosting: {
      ...(fb.site ? { site: fb.site } : {}),
      public: 'public', cleanUrls: true,
      headers: [
        { source: '**', headers: [{ key: 'Cache-Control', value: 'public, max-age=300' }, ...securityHeaders(data)] },
        { source: '/assets/**', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }] },
      ],
    },
  };
}

const minJSON = p => JSON.stringify(JSON.parse(readFileSync(p, 'utf8')));

// path -> () => Buffer|string. Paths have no leading slash.
export function siteFiles(data, opts = {}) {
  const files = new Map();
  const dir = data.dir;
  files.set('index.html', () => renderPage(data, opts));
  for (const f of ['app.js', 'app.css', 'strings.js']) files.set(f, () => readFileSync(join(SRC, f)));
  // optional files that are missing are published empty, so the page never asks for a 404
  const EMPTY = { closures: { bands: [], streets: [] }, parking: { bans: [], carParks: [] }, routes: { routes: [], markers: [] }, sources: { sources: [] }, i18n: {} };
  for (const f of ['event', 'branding', 'closures', 'parking', 'routes', 'sources', 'i18n']) {
    const p = join(dir, f + '.json');
    files.set(`data/${f}.json`, () => (existsSync(p) ? minJSON(p) : JSON.stringify(EMPTY[f])));
  }
  const up = join(dir, 'updates.json');
  files.set(updatesPath(data.event), () => (existsSync(up) ? minJSON(up) : JSON.stringify({ items: [] })));
  const assets = join(dir, 'assets');
  if (existsSync(assets)) {
    const walk = (d, rel) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p, rel + f + '/'); else files.set('assets/' + rel + f, () => readFileSync(p)); } };
    walk(assets, '');
  }
  const og = data.event.site && data.event.site.ogImage;
  if (og && existsSync(join(assets, og))) files.set(og, () => readFileSync(join(assets, og)));
  files.set('robots.txt', () => robots(data));
  const sm = sitemap(data);
  if (sm) files.set('sitemap.xml', () => sm);
  // <data>/public/ is copied as is to the site root (verification files, images for social posts...)
  const extra = join(dir, 'public');
  if (existsSync(extra)) {
    const walk = (d, rel) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p, rel + f + '/'); else if (!files.has(rel + f)) files.set(rel + f, () => readFileSync(p)); } };
    walk(extra, '');
  }
  return files;
}

export const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.ico': 'image/x-icon', '.gpx': 'application/gpx+xml' };
export const mime = p => MIME[extname(p).toLowerCase()] || 'application/octet-stream';
