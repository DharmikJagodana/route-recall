import React, { memo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion';
import { sampleAt, distAt, timeFor } from './logic.js';

export const FPS = 30;
export const RUN_START = 60;      // countdown 3-2-1 takes 60 frames
const HOLD = 10, FADE = 14;
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

export const runDuration = (route, cfg, demo) => {
  const rf = Math.ceil(timeFor(route.total, cfg.speed, cfg.uneven) * FPS);
  return demo ? rf + 24 : RUN_START + rf + HOLD + FADE;
};
export const frameToDist = (frame, route, cfg) => Math.min(route.total, distAt((frame - RUN_START) / FPS, cfg.speed, cfg.uneven));
const drawFrames = route => 36 + route.decisions.length * 4;
export const revealDuration = route => 24 + drawFrames(route) + 24;

export const baseScale = (w, h) => Math.max(52, Math.min(w, h) / 7.2, Math.sqrt(w * h) / 8.8);

// ---------- static map layers (memoised: they only change per route) ----------
const Terrain = memo(({ t }) => (
  <g>
    {t.open.map((d, i) => <path key={'o' + i} d={d} style={{ fill: 'var(--open)' }} />)}
    {t.veg.map((d, i) => <path key={'v' + i} d={d} style={{ fill: 'var(--veg)' }} />)}
    {t.water.map((d, i) => <path key={'w' + i} d={d} style={{ fill: 'var(--water)', stroke: 'var(--ink)', strokeOpacity: 0.45, strokeWidth: 0.025 }} />)}
    {t.contours.map((d, i) => <path key={'c' + i} d={d} style={{ fill: 'none', stroke: 'var(--contour)', strokeWidth: 0.035 }} />)}
    {t.north.map(x => <line key={'n' + x} x1={x} x2={x} y1={t.bb.y} y2={t.bb.y + t.bb.h} style={{ stroke: 'var(--north)', strokeWidth: 0.03 }} />)}
  </g>
));

const Roads = memo(({ route }) => (
  <g style={{ fill: 'none', stroke: 'var(--ink)', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
    <path d={route.roadD} strokeWidth={0.09} />
    <path d={route.stubD} strokeWidth={0.07} strokeDasharray="0.13 0.13" strokeLinecap="butt" opacity={0.6} />
  </g>
));

const StartFinish = memo(({ route }) => {
  const s = route.pts[0], a = route.pts[1], fn = route.pts[route.pts.length - 1];
  const ang = Math.atan2(a.y - s.y, a.x - s.x), r = 0.34;
  const tri = [0, 1, 2].map(k => { const t = ang + k * Math.PI * 2 / 3; return `${s.x + Math.cos(t) * r},${s.y + Math.sin(t) * r}`; }).join(' ');
  return (
    <g style={{ fill: 'none', stroke: 'var(--overprint)', strokeWidth: 0.055, strokeLinejoin: 'round' }}>
      <polygon points={tri} />
      <circle cx={fn.x} cy={fn.y} r={0.2} />
      <circle cx={fn.x} cy={fn.y} r={0.32} />
    </g>
  );
});

const segD = (route, d0, d1) => {
  const n = Math.max(2, Math.ceil((d1 - d0) / 0.06));
  let s = '';
  for (let k = 0; k <= n; k++) { const p = sampleAt(route, d0 + (d1 - d0) * k / n); s += `${k ? 'L' : 'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`; }
  return s;
};

const Runner = ({ x, y, ang, phase }) => (
  <g transform={`translate(${x} ${y}) rotate(${ang * 180 / Math.PI})`}>
    <ellipse cx={-0.03} cy={0.06} rx={0.22} ry={0.17} fill="rgba(0,0,0,.18)" />
    <path d={`M0 -0.08L${-0.16 + phase * 0.14} -0.1M0 0.08L${-0.16 - phase * 0.14} 0.1`} style={{ stroke: 'var(--ink)', strokeWidth: 0.06, strokeLinecap: 'round', fill: 'none' }} />
    <circle r={0.15} style={{ fill: 'var(--overprint)', stroke: 'var(--paper)', strokeWidth: 0.045 }} />
    <polygon points="0.3,0 0.15,-0.09 0.15,0.09" style={{ fill: 'var(--ink)' }} />
  </g>
);

const Countdown = ({ frame, fps, size }) => {
  const idx = Math.min(3, Math.floor(frame / 20));
  const label = ['3', '2', '1', 'Go'][idx];
  const local = frame - idx * 20;
  const sp = spring({ frame: local, fps, config: { damping: 10, mass: 0.6 } });
  const scale = interpolate(sp, [0, 1], [1.7, 1]);
  const opacity = idx === 3 ? interpolate(local, [6, 18], [1, 0], CLAMP) : 1;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{
        fontFamily: 'var(--display)', fontWeight: 700, fontSize: size, lineHeight: 1, color: 'var(--overprint)',
        WebkitTextStroke: '3px var(--paper)', paintOrder: 'stroke fill', transform: `scale(${scale})`, opacity
      }}>{label}</div>
    </AbsoluteFill>
  );
};

// ---------- camera ----------
const FOG = { normal: [2.1, 3.5], dense: [1.25, 2.3] };

export function fitBox(route, w, h, occ = { right: 0, bottom: 0 }, maxS = 110) {
  const b = route.rbb;
  const aw = Math.max(120, w - occ.right), ah = Math.max(120, h - occ.bottom);
  const bw = b.maxx - b.minx + 2.4, bh = b.maxy - b.miny + 2.4;
  const s = Math.max(12, Math.min(aw / bw, ah / bh, maxS));
  return { x: (b.minx + b.maxx) / 2 + (w / 2 - aw / 2) / s, y: (b.miny + b.maxy) / 2 + (h / 2 - ah / 2) / s, sc: s, rot: 0 };
}

export function cameraFor(route, cfg, w, h, d) {
  const base = baseScale(w, h);
  if (cfg.camera === 'bird') return fitBox(route, w, h, undefined, base);
  const p = sampleAt(route, d), c1 = sampleAt(route, d - 0.3), c2 = sampleAt(route, d - 0.6);
  let rot = 0;
  if (cfg.camera === 'turn') {
    let vx = 0, vy = 0;
    for (const o of [-0.7, -0.45, -0.2, 0.05]) { const a = sampleAt(route, d + o - 0.1), b = sampleAt(route, d + o + 0.1); vx += b.x - a.x; vy += b.y - a.y; }
    if (vx || vy) rot = -90 - Math.atan2(vy, vx) * 180 / Math.PI;
  }
  return { x: (p.x + c1.x + c2.x) / 3, y: (p.y + c1.y + c2.y) / 3, sc: base, rot };
}

const rotPt = (x, y, deg, cx, cy) => {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c };
};
const toScreen = (px, py, cam, w, h) => rotPt((px - cam.x) * cam.sc + w / 2, (py - cam.y) * cam.sc + h / 2, cam.rot, w / 2, h / 2);
const worldT = (cam, w, h) => `rotate(${cam.rot} ${w / 2} ${h / 2}) translate(${w / 2 - cam.x * cam.sc} ${h / 2 - cam.y * cam.sc}) scale(${cam.sc})`;

// ---------- the run: countdown, runner on the route, fade-out ----------
export const RunComp = ({ route, cfg, w, h, demo }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = (frame - (demo ? 0 : RUN_START)) / fps;
  const d = Math.min(route.total, distAt(t, cfg.speed, cfg.uneven));
  const moving = d > 0 && d < route.total;

  const p = sampleAt(route, d);
  const a1 = sampleAt(route, d - 0.15), a2 = sampleAt(route, d + 0.15);
  const ang = Math.atan2(a2.y - a1.y, a2.x - a1.x);

  const cam = cameraFor(route, cfg, w, h, d);
  if (!demo && cfg.camera !== 'bird') {
    const intro = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 50 });
    cam.sc *= interpolate(intro, [0, 1], [1.5, 1]);
  }
  const base = baseScale(w, h);
  const k = Math.min(2.4, Math.max(1, base * 0.75 / cam.sc)); // keep the runner readable when zoomed out
  const rp = toScreen(p.x, p.y, cam, w, h);
  const fog = FOG[cfg.vision];

  const fade = demo ? 0 : interpolate(frame, [durationInFrames - FADE, durationInFrames - 1], [0, 1], CLAMP);

  const TRAIL = 1.7, CH = 8;
  const trail = [];
  for (let i = 0; i < CH; i++) {
    const d1 = d - i * TRAIL / CH, d0 = d - (i + 1) * TRAIL / CH;
    if (d1 <= 0) break;
    trail.push(<path key={i} d={segD(route, Math.max(0, d0), d1)} style={{ fill: 'none', stroke: 'var(--overprint)', strokeWidth: 0.11 * k, strokeOpacity: (1 - i / CH) * 0.85 }} />);
  }
  const pulses = route.jArc.map((a, i) => {
    const tt = d - a;
    if (tt <= 0 || tt >= 0.9) return null;
    const j = route.junctions[i];
    return <circle key={i} cx={j.x} cy={j.y} r={(0.18 + tt * 0.6) * k} style={{ fill: 'none', stroke: 'var(--overprint)', strokeWidth: 0.04 * k, strokeOpacity: 0.55 * (1 - tt / 0.9) }} />;
  });

  return (
    <AbsoluteFill style={{ background: 'var(--paper)' }}>
      <svg width={w} height={h} style={{ display: 'block' }}>
        {fog && (
          <defs>
            <radialGradient id="rr-fog" gradientUnits="userSpaceOnUse" cx={rp.x} cy={rp.y} r={fog[1] * cam.sc}>
              <stop offset={fog[0] / fog[1]} style={{ stopColor: 'var(--paper)', stopOpacity: 0 }} />
              <stop offset={1} style={{ stopColor: 'var(--paper)', stopOpacity: 0.97 }} />
            </radialGradient>
          </defs>
        )}
        <g transform={worldT(cam, w, h)}>
          <Terrain t={route.terrain} />
          <g opacity={1 - fade}>
            <Roads route={route} />
            <StartFinish route={route} />
            {pulses}
            {trail}
            <g transform={`translate(${p.x} ${p.y}) scale(${k}) translate(${-p.x} ${-p.y})`}>
              <Runner x={p.x} y={p.y} ang={ang} phase={moving ? Math.sin(d * 11) : 0} />
            </g>
          </g>
        </g>
        {fog && <rect width={w} height={h} fill="url(#rr-fog)" opacity={1 - fade} />}
        <rect width={w} height={h} style={{ fill: 'var(--paper)' }} opacity={fade * 0.72} />
      </svg>
      {!demo && frame < RUN_START + 20 && <Countdown frame={frame} fps={fps} size={Math.min(w, h) * 0.3} />}
    </AbsoluteFill>
  );
};

// ---------- the reveal: zoom out, draw the route, pop the junction markers ----------
export const RevealComp = ({ route, cfg, w, h, picked, occ }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const from = cameraFor(route, cfg, w, h, route.total);
  const to = fitBox(route, w, h, occ);
  let r0 = from.rot % 360; if (r0 > 180) r0 -= 360; if (r0 < -180) r0 += 360;
  const z = interpolate(frame, [0, 26], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
  const cam = {
    x: from.x + (to.x - from.x) * z, y: from.y + (to.y - from.y) * z,
    sc: from.sc * Math.pow(to.sc / from.sc, z), rot: r0 * (1 - z)
  };

  const DRAW = drawFrames(route);
  const prog = interpolate(frame, [22, 22 + DRAW], [0, 1], CLAMP);
  const fs = Math.max(12, Math.min(22, cam.sc * 0.3));
  const k = Math.min(1.6, Math.max(1, 40 / cam.sc));

  const marks = route.junctions.map((j, i) => {
    const at = 22 + DRAW * (route.jArc[i] / route.total);
    const pop = spring({ frame: frame - at, fps, config: { damping: 11, mass: 0.5 } });
    const wrong = !!picked && picked[i] !== undefined && picked[i] !== j.d;
    return { j, i, pop, wrong, sp: toScreen(j.x, j.y, cam, w, h) };
  });

  return (
    <AbsoluteFill style={{ background: 'var(--paper)' }}>
      <svg width={w} height={h} style={{ display: 'block' }}>
        <g transform={worldT(cam, w, h)}>
          <Terrain t={route.terrain} />
          <Roads route={route} />
          <path d={route.routeD} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - prog}
            style={{ fill: 'none', stroke: 'var(--overprint)', strokeWidth: 0.075 * k, strokeLinecap: 'round', strokeLinejoin: 'round', strokeOpacity: 0.9 }} />
          <StartFinish route={route} />
          {marks.map(({ j, i, pop, wrong }) => pop > 0.01 && (
            <circle key={i} cx={j.x} cy={j.y} r={0.27 * k * pop}
              style={{ fill: 'var(--paper)', stroke: wrong ? 'var(--bad)' : 'var(--overprint)', strokeWidth: (wrong ? 0.08 : 0.05) * k }} />
          ))}
        </g>
        {marks.map(({ i, pop, wrong, sp }) => pop > 0.3 && (
          <text key={i} x={sp.x} y={sp.y + 1} textAnchor="middle" dominantBaseline="central"
            style={{ font: `700 ${fs * Math.min(1.3, k)}px var(--display)`, fill: wrong ? 'var(--bad)' : 'var(--overprint)', opacity: Math.min(1, pop) }}>{i + 1}</text>
        ))}
      </svg>
    </AbsoluteFill>
  );
};
