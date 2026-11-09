// Geometry helpers shared by the scripts.
export function positions(geometry) {
  if (!geometry) return [];
  const c = geometry.coordinates;
  switch (geometry.type) {
    case 'LineString': return c;
    case 'MultiLineString': case 'Polygon': return c.flat();
    case 'MultiPolygon': return c.flat(2);
    default: return [];
  }
}
export const inBbox = ([lon, lat], [w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n;
export const round5 = n => Math.round(n * 1e5) / 1e5;

export function haversine([lon1, lat1], [lon2, lat2]) {
  const R = 6371000, r = x => x * Math.PI / 180;
  const h = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Douglas-Peucker on [lon, lat] with a tolerance in metres (local equirectangular projection)
export function simplify(points, toleranceM) {
  if (points.length < 3 || !toleranceM) return points;
  const lat0 = points[0][1] * Math.PI / 180, k = 111320;
  const xy = points.map(([lon, lat]) => [lon * k * Math.cos(lat0), lat * k]);
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, idx = -1;
    const [ax, ay] = xy[a], [bx, by] = xy[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * xy[i][0] - dx * xy[i][1] + bx * ay - by * ax) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > toleranceM) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

// Groups line strings whose ends are within maxGapM of each other; used to spot ambiguous names
export function clusters(lines, maxGapM = 150) {
  const parent = lines.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const near = (a, b) => a.some(p => b.some(q => haversine(p, q) <= maxGapM));
  const ends = lines.map(l => [l[0], l[l.length - 1], l[Math.floor(l.length / 2)]]);
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) if (find(i) !== find(j) && near(ends[i], ends[j])) parent[find(i)] = find(j);
  const groups = new Map();
  lines.forEach((l, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
  return [...groups.values()];
}

// Cuts a [lon, lat] line to a bbox [west, south, east, north] (Liang-Barsky per segment).
// Returns the pieces inside, so a line that leaves and comes back gives two lines.
export function clipLine(points, [w, s, e, n]) {
  const out = [];
  let cur = null;
  const push = p => { if (!cur) { cur = [p]; out.push(cur); } else { const l = cur.at(-1); if (l[0] !== p[0] || l[1] !== p[1]) cur.push(p); } };
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    const dx = x1 - x0, dy = y1 - y0;
    let t0 = 0, t1 = 1, visible = true;
    for (const [p, q] of [[-dx, x0 - w], [dx, e - x0], [-dy, y0 - s], [dy, n - y0]]) {
      if (p === 0) { if (q < 0) { visible = false; break; } continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) { visible = false; break; } if (r > t0) t0 = r; }
      else { if (r < t0) { visible = false; break; } if (r < t1) t1 = r; }
    }
    if (!visible) { cur = null; continue; }
    const a = [x0 + t0 * dx, y0 + t0 * dy], b = [x0 + t1 * dx, y0 + t1 * dy];
    if (t0 > 0) cur = null;          // the segment enters here: start a new piece
    push(a); push(b);
    if (t1 < 1) cur = null;          // and leaves here
  }
  return out.filter(l => l.length > 1);
}
