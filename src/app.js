// event-closures-map: renders the closures of one event from the JSON files in data/.
// No framework; Leaflet is loaded as a global before this module. All text from the data is
// inserted with textContent; the small rich-text syntax (**bold**, [text](https://...)) is
// parsed into DOM nodes, never through innerHTML.
import STRINGS from './strings.js';

const DATA_DIR = (document.querySelector('meta[name="ecm-data"]') || {}).content || 'data/';
const qs = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const mq = window.matchMedia('(max-width:820px)');

async function loadJSON(name, fallback) {
  try {
    const r = await fetch(DATA_DIR + name, { cache: 'no-cache' });
    if (!r.ok) return fallback;
    return await r.json();
  } catch (e) { return fallback; }
}

const [EVENT, BRAND, CLOSURES, PARKING, ROUTES, SOURCES, I18N] = await Promise.all([
  loadJSON('event.json', {}), loadJSON('branding.json', {}),
  loadJSON('closures.json', { bands: [], streets: [] }), loadJSON('parking.json', { bans: [], carParks: [] }),
  loadJSON('routes.json', { routes: [], markers: [] }), loadJSON('sources.json', { sources: [] }),
  loadJSON('i18n.json', {}),
]);
const bands = CLOSURES.bands || [];
const streets = (CLOSURES.streets || []).filter(s => s.geometry);
const bans = PARKING.bans || [];
const carParks = PARKING.carParks || [];
const routes = ROUTES.routes || [];
const markers = ROUTES.markers || [];
const sources = SOURCES.sources || [];
const LANGS = (EVENT.languages && EVENT.languages.length) ? EVENT.languages : ['es', 'en'];
const TZ = EVENT.timezone || undefined;

// ---------- language and text ----------
function pickLang() {
  const q = qs.get('lang');
  if (LANGS.includes(q)) return q;
  try { const s = localStorage.getItem('lang'); if (LANGS.includes(s)) return s; } catch (e) {}
  const navs = navigator.languages || [navigator.language || ''];
  for (const n of navs) { const base = String(n).toLowerCase().split('-')[0]; if (LANGS.includes(base)) return base; }
  return LANGS[0];
}
let lang = pickLang();
const fill = (s, vars) => vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : String(s);
function T(key, vars) {
  const s = (I18N[lang] && I18N[lang][key]) ?? (STRINGS[lang] && STRINGS[lang][key]) ?? (I18N.en && I18N.en[key]) ?? STRINGS.en[key] ?? key;
  return fill(s, vars);
}
// a localized value is either a plain string or {lang: string}
function L10(v) {
  if (v == null) return '';
  if (typeof v === 'object' && !Array.isArray(v)) return v[lang] ?? v[LANGS[0]] ?? v.en ?? Object.values(v)[0] ?? '';
  return String(v);
}
function safeUrl(u) {
  if (/[\\\s]/.test(String(u))) return null;
  try { const x = new URL(String(u), location.href); if (x.username || x.password) return null; return (x.protocol === 'https:' || (/^https?:$/.test(x.protocol) && x.origin === location.origin)) ? x.href : null; } catch (e) { return null; }
}
// rich text: **bold** and [text](url) only
function rich(text) {
  const frag = document.createDocumentFragment();
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m;
  const s = String(text ?? '');
  while ((m = re.exec(s))) {
    if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
    if (m[1] !== undefined) { const b = document.createElement('strong'); b.appendChild(rich(m[1])); frag.appendChild(b); }
    else {
      const href = safeUrl(m[3]);
      if (href) { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = m[2]; frag.appendChild(a); }
      else frag.appendChild(document.createTextNode(m[2]));
    }
    last = re.lastIndex;
  }
  if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
  return frag;
}
function setRich(el, text) { el.replaceChildren(rich(text)); }
function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const k in (attrs || {})) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'style') e.style.cssText = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of children) if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}
const color = c => (/^#[0-9a-f]{3,8}$/i.test(String(c)) ? c : '#777');

// ---------- time ----------
const toMin = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
const fmt = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const TL = EVENT.timeline || {};
const tStart = toMin(TL.start || (bands.length ? bands.map(b => b.from).sort()[0] : '08:00'));
const tEnd = toMin(TL.end || (bands.length ? bands.map(b => b.to).sort().slice(-1)[0] : '20:00'));
const tStep = TL.step || 5;
const bandById = Object.fromEntries(bands.map(b => [b.id, b]));
const bandLabel = b => L10(b.label) || `${fmt(toMin(b.from))}–${fmt(toMin(b.to))}`;
function nowMinutes() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = t => +(parts.find(p => p.type === t) || {}).value || 0;
  return get('hour') * 60 + get('minute');
}

const state = { allDay: true, t: tStart, enabled: Object.fromEntries(bands.map(b => [b.id, true])), bans: true };
const primarySource = sources.find(s => s.primary) || sources[0] || { url: '#' };

// ---------- map ----------
const map = L.map('map', { zoomControl: true });
map.createPane('bans').style.zIndex = 390;
map.createPane('route').style.zIndex = 395;
map.createPane('runners').style.zIndex = 620;
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
const ll = c => [c[1], c[0]];
function toLatLngs(g) {
  switch (g.type) {
    case 'LineString': return { poly: false, ll: g.coordinates.map(ll) };
    case 'MultiLineString': return { poly: false, ll: g.coordinates.map(l => l.map(ll)) };
    case 'Polygon': return { poly: true, ll: g.coordinates.map(r => r.map(ll)) };
    case 'MultiPolygon': return { poly: true, ll: g.coordinates.map(p => p.map(r => r.map(ll))) };
    default: return null;
  }
}
const popup = (title, ...lines) => el('div', null, el('b', null, title), ...lines);

const layers = [];
const streetLayers = L.featureGroup().addTo(map);
const uncertainLayer = L.featureGroup().addTo(map);
function streetPopup(s) {
  const rows = s.bands.filter(b => bandById[b]).map(b => el('div', { class: 'h' }, el('i', { style: `background:${color(bandById[b].color)}` }), bandLabel(bandById[b])));
  const extra = [];
  if (s.uncertain) extra.push(el('div', { class: 'note' }, T('popUncertain')));
  if (s.note) extra.push(el('div', { class: 'note' }, rich(L10(s.note))));
  return popup(L10(s.name), ...rows, ...extra);
}
for (const s of streets) {
  const g = toLatLngs(s.geometry);
  if (!g) continue;
  s.bands.forEach((b, i) => {
    if (!bandById[b]) return;
    const c = color(bandById[b].color);
    const opts = g.poly ? { color: c, weight: 3, fillColor: c, fillOpacity: .35 } : { color: c, weight: 6, opacity: .9, lineCap: 'round' };
    const layer = g.poly ? L.polygon(g.ll, opts) : L.polyline(g.ll, opts);
    layer.bindPopup(() => streetPopup(s));
    layers.push({ street: s, band: b, layer, idx: i });
  });
  if (s.uncertain && !g.poly) L.polyline(g.ll, { color: '#777', weight: 9, dashArray: '8 8', opacity: .6 }).bindPopup(() => streetPopup(s)).addTo(uncertainLayer);
}

// course: not a closure. Thin line with a light casing, plus icons every few hundred metres when zoomed in.
const routeLayers = {};
function haversine(a, b) { const R = 6371000, r = x => x * Math.PI / 180; const dLat = r(b[0] - a[0]), dLon = r(b[1] - a[1]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function pointsEvery(pts, stepM, offsetM) {
  const out = []; let acc = -offsetM;
  for (let i = 1; i < pts.length; i++) {
    const seg = haversine(pts[i - 1], pts[i]); let pos = 0;
    while (seg > 0 && acc + (seg - pos) >= stepM) { pos += stepM - acc; acc = 0; const f = pos / seg; out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]); }
    acc += seg - pos;
  }
  return out;
}
const DASH = { solid: null, dashed: '8 8', dotted: '2 8' };
for (const r of routes) {
  const pts = (r.coordinates || []).map(ll);
  if (pts.length < 2) continue;
  const c = color(r.color || '#204246');
  const g = L.featureGroup([
    L.polyline(pts, { pane: 'route', color: '#fff', weight: 7, opacity: .85 }),
    L.polyline(pts, { pane: 'route', color: c, weight: 3, opacity: .95, dashArray: DASH[r.style] || null, lineCap: 'round' }),
  ]);
  if (r.marker && r.markerEveryM) {
    const icon = L.divIcon({ className: '', html: '<div class="runner"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
    g.runners = L.featureGroup(pointsEvery(pts, r.markerEveryM, r.markerOffsetM || 0).map(p => {
      const m = L.marker(p, { pane: 'runners', icon, interactive: false });
      m.on('add', () => { const d = m.getElement() && m.getElement().firstChild; if (d) { d.textContent = r.marker; d.style.color = c; d.classList.add(r.style || 'solid'); } });
      return m;
    }));
  }
  g.bindPopup(() => {
    const parts = [];
    parts.push(el('div', { class: 'note' }, rich(L10(ROUTES.intro) || T('routeIntroDefault'))));
    if (r.source) {
      const href = safeUrl(r.source.url);
      const n = el('div', { class: 'note' }, rich(L10(r.source.label)));
      if (href) { n.appendChild(document.createTextNode('. ')); n.appendChild(el('a', { href, target: '_blank', rel: 'noopener' }, new URL(href).hostname.replace(/^www\./, ''))); }
      parts.push(n);
    }
    return popup(L10(r.name), ...parts);
  });
  routeLayers[r.id] = g.addTo(map);
}
const runnersMinZoom = ROUTES.markersMinZoom || 14;
function syncRunners() {
  const show = map.getZoom() >= runnersMinZoom;
  for (const id in routeLayers) {
    const g = routeLayers[id]; if (!g.runners) continue;
    if (show && map.hasLayer(g)) { if (!g.hasLayer(g.runners)) g.addLayer(g.runners); }
    else if (g.hasLayer(g.runners)) g.removeLayer(g.runners);
  }
}
map.on('zoomend', syncRunners);
map.on('layeradd', e => { if (Object.values(routeLayers).includes(e.layer)) syncRunners(); });
for (const m of markers) {
  const icon = L.divIcon({ className: '', html: '<div class="pk flag"></div>', iconSize: [24, 24], iconAnchor: [12, 12] });
  const mk = L.marker([m.lat, m.lon], { pane: 'runners', icon });
  const rc = m.route && routes.find(r => r.id === m.route);
  mk.on('add', () => { const d = mk.getElement() && mk.getElement().firstChild; if (d) { d.textContent = m.icon || '•'; if (rc && rc.color) { d.style.borderColor = color(rc.color); d.style.color = color(rc.color); } } });
  mk.bindPopup(() => popup(L10(m.title), el('div', null, rich(L10(m.text)))));
  mk.addTo((m.route && routeLayers[m.route]) || map);
}

const banLayer = L.featureGroup().addTo(map);
const banRefs = bans.map(p => {
  const g = p.geometry && toLatLngs(p.geometry);
  if (!g) return null;
  const opts = { pane: 'bans', color: '#111', weight: 16, opacity: .3, lineCap: 'butt' };
  const l = g.poly ? L.polygon(g.ll, { ...opts, weight: 4, dashArray: '4 5', opacity: .95, fillColor: '#111', fillOpacity: .25 }) : L.polyline(g.ll, opts);
  l.bindPopup(() => popup(`${T('popBan')}: ${L10(p.name)}`, el('div', null, rich(L10(p.when))), p.note ? el('div', { class: 'note' }, rich(L10(p.note))) : null));
  return l.addTo(banLayer);
});
const pkRefs = carParks.map(p => {
  const m = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html: '<div class="pk">P</div>', iconSize: [22, 22], iconAnchor: [11, 11] }) });
  m.bindPopup(() => popup(L10(p.name), el('div', null, rich(L10(p.when))), p.access ? el('div', { class: 'note' }, rich(L10(p.access))) : null));
  return m.addTo(banLayer);
});

// ---------- state ----------
function activeBands() {
  return bands.filter(b => state.enabled[b.id] && (state.allDay || (state.t >= toMin(b.from) && state.t < toMin(b.to)))).map(b => b.id);
}
function refresh() {
  const act = new Set(activeBands());
  streetLayers.clearLayers();
  const perStreet = new Map();
  for (const e of layers) if (act.has(e.band)) { if (!perStreet.has(e.street.id)) perStreet.set(e.street.id, []); perStreet.get(e.street.id).push(e); }
  for (const es of perStreet.values()) es.forEach((e, i) => {
    if (e.layer.setStyle && !(e.layer instanceof L.Polygon)) e.layer.setStyle(i === 0 ? { dashArray: null, weight: 6 } : { dashArray: '10 10', weight: 6 });
    streetLayers.addLayer(e.layer);
  });
  const n = perStreet.size;
  $('tlabel').textContent = state.allDay ? T('allDay') : fmt(state.t);
  $('tcount').textContent = state.allDay ? T('total', { n: streets.length }) : (n === 0 ? T('cut0') : n === 1 ? T('cut1') : T('cutN', { n }));
  document.querySelectorAll('#legend label[data-band]').forEach(l => {
    const b = l.dataset.band;
    l.classList.toggle('off', !state.enabled[b]);
    l.classList.toggle('inactive', state.enabled[b] && !act.has(b));
  });
  $('allday').classList.toggle('on', state.allDay);
  if (state.bans) { if (!map.hasLayer(banLayer)) banLayer.addTo(map); } else map.removeLayer(banLayer);
}

function checkboxRow(checked, onChange, ...content) {
  const input = el('input', { type: 'checkbox' }); input.checked = checked;
  input.addEventListener('change', ev => onChange(ev.target.checked));
  return el('label', null, input, ...content);
}
function infoSection(sec) {
  const ul = el('ul', { class: 'list' });
  for (const it of sec.items || []) ul.appendChild(el('li', null, rich(L10(it))));
  if (sec.footnote) ul.appendChild(el('li', { class: 'small' }, rich(L10(sec.footnote))));
  return el('details', { class: 'block', id: 'info-' + (sec.id || '') }, el('summary', null, el('h2', null, L10(sec.title))), ul);
}

function render() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = T(e.dataset.i18n); });
  $('lang').replaceChildren(...(LANGS.length > 1 ? LANGS.map(l => el('button', { 'data-lang': l, class: l === lang ? 'on' : '', type: 'button', onclick: () => { lang = l; try { localStorage.setItem('lang', l); } catch (e) {} render(); } }, l.toUpperCase())) : []));
  $('lang').setAttribute('aria-label', T('langLabel'));
  $('title').textContent = L10(BRAND.title) || L10(EVENT.name);
  $('subtitle').textContent = L10(BRAND.subtitle);
  document.title = L10(EVENT.site && EVENT.site.title) || $('title').textContent;
  setRich($('notice'), fill(L10(EVENT.notice) || T('noticeDefault'), { url: primarySource.url }));
  setRich($('noticeShort'), fill(L10(EVENT.noticeShort) || T('noticeShortDefault'), { url: primarySource.url }));
  syncNoticeToggle();
  $('slider').setAttribute('aria-label', T('sliderLabel'));
  // map attribution: OpenStreetMap is mandatory (ODbL); the map credit is the brand
  const ac = map.attributionControl; ac.setPrefix(false); for (const k in ac._attributions) ac.removeAttribution(k);
  const h = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const credit = BRAND.mapCredit && safeUrl(BRAND.mapCredit.url) ? ` · ${h(T('mapBy'))}: <a href="${h(safeUrl(BRAND.mapCredit.url))}">${h(BRAND.mapCredit.label || '')}</a>` : '';
  ac.addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' + credit);

  // legend
  const legend = $('legend'); legend.replaceChildren();
  for (const b of bands) {
    const cnt = streets.filter(s => s.bands.includes(b.id)).length;
    const l = checkboxRow(state.enabled[b.id], v => { state.enabled[b.id] = v; refresh(); },
      el('span', { class: 'sw', style: `background:${color(b.color)}` }), el('span', { class: 't' }, bandLabel(b)), el('span', { class: 'n' }, String(cnt)));
    l.dataset.band = b.id; legend.appendChild(l);
  }
  const unc = streets.filter(s => s.uncertain).length;
  if (unc) legend.appendChild(checkboxRow(map.hasLayer(uncertainLayer), v => v ? uncertainLayer.addTo(map) : map.removeLayer(uncertainLayer),
    el('span', { class: 'sw dash' }), el('span', { class: 't' }, T('uncertainLegend')), el('span', { class: 'n' }, String(unc))));
  $('legendblock').hidden = !bands.length;

  // routes
  const rl = $('routes'); rl.replaceChildren();
  for (const r of routes) {
    if (!routeLayers[r.id]) continue;
    rl.appendChild(checkboxRow(map.hasLayer(routeLayers[r.id]), v => v ? routeLayers[r.id].addTo(map) : map.removeLayer(routeLayers[r.id]),
      el('span', { class: `sw route ${r.style || 'solid'}`, style: `--route:${color(r.color)}` }, r.marker ? el('span', { class: 'm' }, r.marker) : null),
      el('span', { class: 't' }, L10(r.legend) || L10(r.name))));
  }
  setRich($('routeIntro'), L10(ROUTES.intro) || T('routeIntroDefault'));
  $('routesblock').hidden = !Object.keys(routeLayers).length;

  // free-form info sections (race times, public transport, ...)
  $('infoAfterRoutes').replaceChildren(...(EVENT.info || []).filter(s => s.placement === 'afterRoutes').map(infoSection));
  $('infoAfterParking').replaceChildren(...(EVENT.info || []).filter(s => s.placement !== 'afterRoutes').map(infoSection));

  // parking
  $('parkingblock').hidden = !bans.length && !carParks.length;
  $('bansTitle').hidden = !bans.length; $('carParksTitle').hidden = !carParks.length;
  $('showbans').parentElement.hidden = !bans.some(b => b.geometry) && !carParks.length;
  const bansUl = $('bans'); bansUl.replaceChildren();
  bans.forEach((p, i) => {
    if (!banRefs[i]) { bansUl.appendChild(el('li', null, el('strong', null, L10(p.name)), el('span', { class: 'when' }, rich(L10(p.when))), p.note ? el('span', { class: 'when' }, rich(L10(p.note))) : null)); return; }
    bansUl.appendChild(el('li', null, el('a', { class: 'go', href: '#map', onclick: ev => { ev.preventDefault(); showBans(); map.fitBounds(banRefs[i].getBounds(), { maxZoom: 16 }); banRefs[i].openPopup(); scrollToMap(); } }, L10(p.name)), el('span', { class: 'when' }, rich(L10(p.when)))));
  });
  const pkUl = $('parkings'); pkUl.replaceChildren();
  carParks.forEach((p, i) => {
    const when = el('span', { class: 'when' }, rich(L10(p.when)));
    if (p.access) { when.appendChild(document.createTextNode('. ')); when.appendChild(rich(L10(p.access))); }
    pkUl.appendChild(el('li', null, el('a', { class: 'go', href: '#map', onclick: ev => { ev.preventDefault(); showBans(); map.setView([p.lat, p.lon], 17); pkRefs[i].openPopup(); scrollToMap(); } }, L10(p.name)), when));
  });
  setRich($('parkingNote'), L10(PARKING.note));

  // sources, footer
  const sUl = $('sources'); sUl.replaceChildren();
  for (const s of sources) {
    const href = safeUrl(s.url);
    sUl.appendChild(el('li', { class: s.primary ? 'primary' : '' }, href ? el('a', { href, target: '_blank', rel: 'noopener' }, L10(s.title)) : document.createTextNode(L10(s.title)), s.primary ? el('span', { class: 'when' }, T('sourcePrimary')) : null));
  }
  setRich($('dataNotes'), L10(EVENT.dataNotes));
  const cta = BRAND.cta;
  $('cta').hidden = !(cta && safeUrl(cta.url));
  if (!$('cta').hidden) { setRich($('ctaText'), L10(cta.text)); $('ctaBtn').textContent = L10(cta.button); $('ctaBtn').href = safeUrl(cta.url); }
  const entity = BRAND.legalName || BRAND.name || '';
  const legal = (BRAND.legal && BRAND.legal.paragraphs) ? BRAND.legal.paragraphs.map(L10) : [T('legalDefault1', { entity }), T('legalDefault2', { entity }), T('legalDefault3', { entity })];
  $('legal').replaceChildren(...legal.map(p => el('p', null, rich(p))));
  const links = [...((BRAND.legal && BRAND.legal.links) || []).map(x => ({ label: L10(x.label), url: x.url })), { label: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }];
  const ll2 = $('legalLinks'); ll2.replaceChildren();
  links.forEach((x, i) => { const href = safeUrl(x.url); if (!href) return; if (ll2.childNodes.length) ll2.appendChild(document.createTextNode(' · ')); ll2.appendChild(el('a', { href, target: '_blank', rel: 'noopener' }, x.label)); });
  $('credit').hidden = BRAND.credit === false;
  if (BRAND.credit !== false) setRich($('credit'), T('credit'));

  renderUpdates();
  map.closePopup();
  refresh();
}
function showBans() { state.bans = true; $('showbans').checked = true; refresh(); }
function syncNoticeToggle() { const open = $('noticewrap').classList.contains('open'); $('noticeToggle').textContent = T(open ? 'noticeLess' : 'noticeMore'); $('noticeToggle').setAttribute('aria-expanded', open); }
function scrollToMap() { if (mq.matches) $('mapwrap').scrollIntoView({ behavior: 'smooth' }); }
function fitAll() {
  const all = layers.map(e => e.layer);
  if (!all.length) { const m = EVENT.map || {}; map.setView(m.center || [40.4168, -3.7038], m.zoom || 13); return; }
  const pad = mq.matches ? ($('timecard').offsetHeight + 24) : 0;
  map.fitBounds(L.featureGroup(all).getBounds().pad(0.03), { paddingTopLeft: [8, 8], paddingBottomRight: [8, 8 + pad] });
}
function setTopH() { const h = document.querySelector('header').offsetHeight + $('noticewrap').offsetHeight; document.documentElement.style.setProperty('--topH', h + 'px'); }
function placeTimecard() {
  const tc = $('timecard'), ft = document.querySelector('footer');
  if (mq.matches) { $('mapwrap').appendChild(tc); document.body.appendChild(ft); }
  else { $('side').insertBefore(tc, $('updatesblock')); $('side').appendChild(ft); }
  map.invalidateSize();
}

// ---------- latest updates (written by an external process, see watch-updates/) ----------
let UPDATES = null, updatesOpen = false;
const UPDATES_PATH = (EVENT.updates && EVENT.updates.path) || 'data/updates.json';
function fmtWhen(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString(lang, { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit' });
}
function renderUpdates() {
  const block = $('updatesblock'), ul = $('updates');
  if (!UPDATES || !Array.isArray(UPDATES.items) || !UPDATES.items.length) { block.hidden = true; return; }
  ul.replaceChildren();
  for (const it of [...UPDATES.items].sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')))) {
    const txt = String(it[lang] || it[LANGS[0]] || it.es || it.en || '');
    const href = /^https:/i.test(String(it.url || '')) ? safeUrl(it.url) : null;
    ul.appendChild(el('li', null, el('span', { class: 'when' }, fmtWhen(it.time) + (it.source ? ` · ${String(it.source)}` : '')),
      href ? el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, txt) : document.createTextNode(txt)));
  }
  $('updatesMeta').textContent = T('updatesMeta', { t: fmtWhen(UPDATES.updated) });
  const n = UPDATES.items.length;
  $('updatesToggle').hidden = n < 2; ul.classList.toggle('collapsed', !updatesOpen);
  $('updatesCount').textContent = `(${n})`;
  $('updatesToggle').textContent = updatesOpen ? T('updatesLess') : T('updatesMore', { n });
  block.hidden = false;
}
async function loadUpdates() {
  try { const r = await fetch(UPDATES_PATH + '?ts=' + Math.floor(Date.now() / 300000), { cache: 'no-store' }); if (!r.ok) return; UPDATES = await r.json(); renderUpdates(); } catch (e) {}
}

// ---------- wiring ----------
const slider = $('slider');
slider.min = tStart; slider.max = tEnd; slider.step = tStep; slider.value = tStart;
{
  const ticks = []; const every = (tEnd - tStart) > 12 * 60 ? 120 : 60;
  for (let m = Math.ceil(tStart / every) * every; m <= tEnd; m += every) ticks.push(el('span', null, fmt(m)));
  $('ticks').replaceChildren(...ticks);
}
slider.addEventListener('input', () => { state.t = +slider.value; state.allDay = false; refresh(); });
$('allday').addEventListener('click', () => { state.allDay = !state.allDay; refresh(); });
$('now').addEventListener('click', () => { let m = Math.round(nowMinutes() / tStep) * tStep; m = Math.min(tEnd, Math.max(tStart, m)); slider.value = m; state.t = m; state.allDay = false; refresh(); });
$('fit').addEventListener('click', fitAll);
$('showbans').addEventListener('change', ev => { state.bans = ev.target.checked; refresh(); });
document.querySelector('#parkingblock summary label.inline').addEventListener('click', ev => ev.stopPropagation());
$('noticeToggle').addEventListener('click', () => { $('noticewrap').classList.toggle('open'); syncNoticeToggle(); setTopH(); map.invalidateSize(); });
$('updatesToggle').addEventListener('click', () => { updatesOpen = !updatesOpen; renderUpdates(); });
mq.addEventListener('change', placeTimecard);
window.addEventListener('resize', () => { setTopH(); map.invalidateSize(); });

placeTimecard();
render();
setTopH(); map.invalidateSize();
fitAll();
loadUpdates(); setInterval(loadUpdates, ((EVENT.updates && EVENT.updates.refreshMinutes) || 10) * 60 * 1000);
window.addEventListener('load', () => { setTopH(); map.invalidateSize(); fitAll(); });

// ?og=1: the framing used for the social preview image (light theme, no notice, a fixed time)
if (qs.get('og') === '1') {
  const og = EVENT.og || {};
  document.documentElement.dataset.theme = 'light';
  $('noticewrap').style.display = 'none';
  const z = document.querySelector('.leaflet-control-zoom'); if (z) z.style.display = 'none';
  if (og.time) { const m = toMin(og.time); slider.value = m; state.t = m; state.allDay = false; refresh(); }
  setTimeout(() => {
    setTopH(); map.invalidateSize();
    const c = mq.matches ? (og.mobileCenter || og.center) : og.center, zm = mq.matches ? (og.mobileZoom || og.zoom) : og.zoom;
    if (c && zm) map.setView(c, zm, { animate: false });
  }, 300);
}
document.documentElement.dataset.ready = '1';
