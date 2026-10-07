// seedable randomness: all random draws below go through _rand so that a date
// or a shared key can reproduce the exact same route for everyone (Daily / challenge links).
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _rand = Math.random;
export const rand = () => _rand();
// run fn with a deterministic RNG derived from `seed`, then restore the normal one
export function withSeed(seed, fn) {
  const prev = _rand;
  _rand = mulberry32(hashString(String(seed)));
  try { return fn(); } finally { _rand = prev; }
}

export const rnd = (a, b) => a + Math.floor(rand() * (b - a + 1));
export const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const turnH = (h, d) => d === 'L' ? (h + 3) % 4 : d === 'R' ? (h + 1) % 4 : h;

function pickOrder() {
  const r = rand();
  const first = r < 0.38 ? 'L' : r < 0.76 ? 'R' : 'S';
  return [first, ...shuffle(['L', 'R', 'S'].filter(c => c !== first))];
}

function tryGen(turns, branchAll) {
  const occ = new Set();
  const K = (x, y) => x + ',' + y;
  const free = (x, y, px, py) => {
    if (occ.has(K(x, y))) return false;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx === px && ny === py) continue;
      if (occ.has(K(nx, ny))) return false;
    }
    return true;
  };
  const lay = (x, y, h, len) => {
    const added = []; let px = x, py = y;
    for (let i = 0; i < len; i++) {
      const nx = px + DX[h], ny = py + DY[h];
      if (!free(nx, ny, px, py)) { added.forEach(k => occ.delete(k)); return null; }
      occ.add(K(nx, ny)); added.push(K(nx, ny)); px = nx; py = ny;
    }
    return { x: px, y: py, added };
  };
  occ.add(K(0, 0));
  let x = 0, y = 0, h = 0;
  const pts = [{ x: 0, y: 0 }], decisions = [], junctions = [], branches = [];
  const s = lay(x, y, h, 2); if (!s) return null; x = s.x; y = s.y;
  for (let i = 0; i < turns; i++) {
    let done = false;
    for (const dch of pickOrder()) {
      const nh = turnH(h, dch);
      const len = rnd(2, 3);
      const seg = lay(x, y, nh, len) || (len === 3 ? lay(x, y, nh, 2) : null);
      if (!seg) continue;
      const placed = [];
      for (const alt of shuffle(['L', 'R', 'S'].filter(c => c !== dch))) {
        if (!branchAll && placed.length && rand() < 0.45) continue;
        const bh = turnH(h, alt);
        const b = lay(x, y, bh, 2) || lay(x, y, bh, 1);
        if (b) placed.push({ x1: x, y1: y, x2: b.x, y2: b.y, h: bh });
      }
      if (!placed.length) { seg.added.forEach(k => occ.delete(k)); continue; }
      junctions.push({ x, y, d: dch });
      decisions.push(dch);
      branches.push(...placed);
      pts.push({ x, y });
      x = seg.x; y = seg.y; h = nh; done = true; break;
    }
    if (!done) return null;
  }
  pts.push({ x, y });
  return { pts, decisions, junctions, branches, occ };
}

function generate(turns, branchAll) {
  for (let a = 0; a < 800; a++) { const m = tryGen(turns, branchAll); if (m) return m; }
  return turns > 2 ? generate(turns - 1, branchAll) : tryGen(2, false);
}

function mutate(seq, times) {
  const s = seq.slice();
  for (let t = 0; t < times; t++) {
    const idx = [];
    for (let i = 0; i < s.length - 1; i++) if (s[i] !== s[i + 1]) idx.push(i);
    if (rand() < 0.55 || !idx.length) {
      const i = rnd(0, s.length - 1);
      s[i] = s[i] === 'L' ? 'R' : s[i] === 'R' ? 'L' : (rand() < 0.5 ? 'L' : 'R');
    } else {
      const i = idx[rnd(0, idx.length - 1)];
      [s[i], s[i + 1]] = [s[i + 1], s[i]];
    }
  }
  return s;
}

export function makeOptions(truth, n, level) {
  const key = s => s.join('');
  const seen = new Set([key(truth)]);
  const opts = [truth];
  let guard = 0;
  while (opts.length < n && guard++ < 600) {
    let s;
    if (level <= 2 && opts.length === n - 1 && rand() < 0.5) s = truth.map(() => 'LRS'[rnd(0, 2)]);
    else s = mutate(truth, level >= 6 ? 1 : rnd(1, 2));
    if (!seen.has(key(s))) { seen.add(key(s)); opts.push(s); }
  }
  while (opts.length < n) {
    const s = truth.map(() => 'LRS'[rnd(0, 2)]);
    if (!seen.has(key(s))) { seen.add(key(s)); opts.push(s); }
  }
  return shuffle(opts);
}

function buildSamples(pts) {
  const S = [{ x: pts[0].x, y: pts[0].y }];
  const R = 0.32;
  const lineTo = (x, y) => {
    const a = S[S.length - 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x - a.x, y - a.y) / 0.06));
    for (let k = 1; k <= n; k++) S.push({ x: a.x + (x - a.x) * k / n, y: a.y + (y - a.y) * k / n });
  };
  for (let i = 1; i < pts.length; i++) {
    const b = pts[i];
    if (i < pts.length - 1) {
      const a = pts[i - 1], c = pts[i + 1];
      const di = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
      const dq = { x: Math.sign(c.x - b.x), y: Math.sign(c.y - b.y) };
      if (di.x !== dq.x || di.y !== dq.y) {
        const p0 = { x: b.x - di.x * R, y: b.y - di.y * R }, p2 = { x: b.x + dq.x * R, y: b.y + dq.y * R };
        lineTo(p0.x, p0.y);
        for (let k = 1; k <= 10; k++) {
          const t = k / 10, u = 1 - t;
          S.push({ x: u * u * p0.x + 2 * u * t * b.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * b.y + t * t * p2.y });
        }
        continue;
      }
    }
    lineTo(b.x, b.y);
  }
  const cum = [0];
  for (let i = 1; i < S.length; i++) cum.push(cum[i - 1] + Math.hypot(S[i].x - S[i - 1].x, S[i].y - S[i - 1].y));
  return { S, cum };
}

const f = n => n.toFixed(3);
function blobD(cx, cy, r, jag) {
  const N = 12, p = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, rr = r * (1 + (rand() - 0.5) * jag * 2);
    p.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const m = mid(p[N - 1], p[0]);
  let d = `M${f(m.x)} ${f(m.y)}`;
  for (let i = 0; i < N; i++) { const n = mid(p[i], p[(i + 1) % N]); d += `Q${f(p[i].x)} ${f(p[i].y)} ${f(n.x)} ${f(n.y)}`; }
  return d + 'Z';
}

function makeTerrain(bb) {
  const area = bb.w * bb.h;
  const t = { open: [], veg: [], water: [], contours: [], north: [], bb };
  const n = Math.round(area / 8);
  for (let i = 0; i < n; i++) {
    const r0 = rand();
    const type = r0 < 0.42 ? 'open' : r0 < 0.9 ? 'veg' : 'water';
    const r = type === 'water' ? 0.45 + rand() * 0.75 : 0.8 + rand() * 2.1;
    t[type].push(blobD(bb.x + rand() * bb.w, bb.y + rand() * bb.h, r, type === 'water' ? 0.18 : 0.32));
  }
  const hills = Math.round(area / 45) + 2;
  for (let i = 0; i < hills; i++) {
    const cx = bb.x + rand() * bb.w, cy = bb.y + rand() * bb.h, rings = rnd(2, 4);
    for (let k = 1; k <= rings; k++) t.contours.push(blobD(cx, cy, 0.7 + k * 0.75, 0.16));
  }
  for (let x = Math.ceil(bb.x / 4) * 4 + 0.5; x < bb.x + bb.w; x += 4) t.north.push(x);
  return t;
}

let RID = 0;
export function buildRoute(turns, branchAll = false) {
  const g = generate(turns, branchAll);
  const { S, cum } = buildSamples(g.pts);
  const total = cum[cum.length - 1];
  let from = 0;
  const jArc = g.junctions.map(j => {
    let best = from, bd = 1e9;
    for (let i = from; i < S.length; i++) {
      const d = Math.hypot(S[i].x - j.x, S[i].y - j.y);
      if (d < bd) { bd = d; best = i; }
      if (d > bd + 1.2) break;
    }
    from = best;
    return cum[best];
  });
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  g.occ.forEach(k => { const [x, y] = k.split(',').map(Number); minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); });
  const M = 8;
  const terrain = makeTerrain({ x: minx - M, y: miny - M, w: maxx - minx + 2 * M, h: maxy - miny + 2 * M });
  const roadD = g.pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('') + g.branches.map(b => `M${b.x1} ${b.y1}L${b.x2} ${b.y2}`).join('');
  const stubD = g.branches.map(b => `M${b.x2} ${b.y2}L${b.x2 + DX[b.h] * 0.75} ${b.y2 + DY[b.h] * 0.75}`).join('');
  const routeD = S.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join('');
  return {
    id: ++RID, pts: g.pts, decisions: g.decisions, junctions: g.junctions, branches: g.branches,
    S, cum, total, jArc, terrain, roadD, stubD, routeD, rbb: { minx, miny, maxx, maxy }
  };
}

export function sampleAt(r, d) {
  const c = r.cum;
  d = Math.max(0, Math.min(r.total, d));
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= d) lo = m; else hi = m; }
  const t = (d - c[lo]) / ((c[hi] - c[lo]) || 1e-6);
  const a = r.S[lo], b = r.S[hi];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// ---------- speed profile ("surges" make the runner speed up and slow down) ----------
const SA = 0.55, SW = 1.9;
export const distAt = (t, speed, uneven) => t <= 0 ? 0 : speed * (uneven ? t + (SA / SW) * (1 - Math.cos(SW * t)) : t);
export function timeFor(total, speed, uneven) {
  if (!uneven) return total / speed;
  let lo = 0, hi = total / speed / (1 - SA) + 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (distAt(m, speed, true) < total) lo = m; else hi = m; }
  return hi;
}

// ---------- points multiplier for a round config ----------
export function multiplier(cfg) {
  let m = cfg.speedMult || 1;
  m *= cfg.answer === 'build' ? 2 : cfg.answer === 'one' ? 0.5 : 1 + (cfg.options - 3) * 0.12;
  m *= cfg.vision === 'dense' ? 1.3 : cfg.vision === 'clear' ? 0.7 : 1;
  m *= cfg.camera === 'turn' ? 1.4 : cfg.camera === 'bird' ? 0.7 : 1;
  if (cfg.uneven) m *= 1.2;
  if (cfg.branchAll) m *= 1.1;
  return Math.round(m * 100) / 100;
}
