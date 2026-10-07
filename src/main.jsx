import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Player } from '@remotion/player';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { buildRoute, makeOptions, store, multiplier, rnd, withSeed } from './logic.js';
import './styles.css';
import { RunComp, RevealComp, FPS, runDuration, revealDuration, frameToDist } from './compositions.jsx';

// ---------- configuration ----------
const PACE = { stroll: 0.72, jog: 1, sprint: 1.45 };
const STAGES = [
  { name: 'Trail', from: 1, desc: 'Clear paths and a few junctions. Learn the rhythm.' },
  { name: 'Forest', from: 4, desc: 'Crossroads at every junction and four routes to choose from.' },
  { name: 'Night', from: 7, desc: 'Your vision shrinks, so you see less of what is coming.' },
  { name: 'Turning map', from: 10, desc: 'The map turns with the runner, so up is always forward.' },
  { name: 'Surges', from: 13, desc: 'The runner speeds up and slows down without warning.' },
  { name: 'Retrace', from: 16, desc: 'No options. Build the route yourself, one arrow at a time.' }
];
const stageOf = level => { let s = 0; STAGES.forEach((st, i) => { if (level >= st.from) s = i; }); return s; };

function careerCfg(level, pace) {
  const st = stageOf(level);
  const sm = PACE[pace];
  return {
    turns: Math.min(14, 3 + Math.floor((level - 1) * 0.6)),
    speed: Math.min(6.5, 1.8 + level * 0.14) * sm,
    speedMult: sm,
    options: level < 4 ? 3 : level < 10 ? 4 : 5,
    answer: st === 5 ? 'build' : 'pick',
    vision: st === 2 ? 'dense' : 'normal',
    camera: (st === 3 || st === 4 || level >= 19) ? 'turn' : 'follow',
    uneven: st >= 4,
    branchAll: st >= 1
  };
}

const SPEEDS = { slow: 0.7, normal: 1, fast: 1.45, blazing: 2 };
const DEFAULT_CUSTOM = { turns: 6, speed: 'normal', answer: 'pick', options: 4, vision: 'normal', camera: 'follow', branchAll: false, uneven: false, harder: true };
function customCfg(c, round) {
  const extra = c.harder ? round - 1 : 0;
  const sm = SPEEDS[c.speed];
  return {
    turns: Math.min(24, c.turns + extra),
    speed: Math.min(9, 2.3 * sm * (1 + extra * 0.04)),
    speedMult: sm, options: c.options, answer: c.answer, vision: c.vision,
    camera: c.camera, uneven: c.uneven, branchAll: c.branchAll
  };
}
const twistTags = cfg => [
  cfg.branchAll && 'Crossroads', cfg.vision === 'dense' && 'Dense fog', cfg.vision === 'clear' && 'Clear view',
  cfg.camera === 'turn' && 'Turning map', cfg.camera === 'bird' && 'Bird’s-eye', cfg.uneven && 'Surges',
  cfg.answer === 'build' && 'Build the route', cfg.answer === 'one' && 'One junction'
].filter(Boolean);

// ---------- daily route (same puzzle for everyone, seeded by the date) ----------
// derive the base URL at runtime so share links work on prod, previews and localhost alike
const SITE = typeof window !== 'undefined' ? window.location.origin : '';
const DAY0 = Date.UTC(2026, 9, 7) / 864e5; // day #1 = 2026-10-07
const pad2 = n => String(n).padStart(2, '0');
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const dailyNumber = key => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5 - DAY0) + 1; };
const prevKey = key => { const [y, m, d] = key.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d) - 864e5); return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`; };
// the Daily run reuses career's escalating twists at a fixed pace, so difficulty is identical for all players
const dailyCfg = round => careerCfg(round, 'jog');

// ---------- small components ----------
const WORD = { L: 'left', R: 'right', S: 'straight' };
const Arrow = ({ d }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {d === 'L' && <><path d="M16 21v-8a4 4 0 0 0-4-4H5" /><path d="M9.5 4.5 5 9l4.5 4.5" /></>}
    {d === 'R' && <><path d="M8 21v-8a4 4 0 0 1 4-4h7" /><path d="M14.5 4.5 19 9l-4.5 4.5" /></>}
    {d === 'S' && <><path d="M12 21V4" /><path d="M6.5 9.5 12 4l5.5 5.5" /></>}
  </svg>
);
const Chips = ({ seq, cmp, only }) => (
  <span className="chips">
    {seq.map((d, i) => (
      <span key={i} className={'chip' + (cmp && cmp[i] !== d && (only === undefined || only === i) ? ' bad' : '') + (only !== undefined && only === i ? ' focus' : '') + (i % 4 === 3 ? ' gap' : '')}
        title={`${i + 1}: ${WORD[d]}`}><Arrow d={d} /></span>
    ))}
  </span>
);

function Seg({ label, value, options, onChange, disabled, name }) {
  return (
    <fieldset className="field" disabled={disabled}>
      <legend>{label}</legend>
      <div className="seg" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map(([v, l, s]) => (
          <label key={String(v)}>
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
            {l}{s && <small>{s}</small>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true"><span /></span>
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
    </label>
  );
}

const playerCommon = {
  fps: FPS, controls: false, autoPlay: true, clickToPlay: false, spaceKeyToPlayOrPause: false,
  doubleClickToFullscreen: false, moveToBeginningWhenEnded: false, acknowledgeRemotionLicense: true, initiallyMuted: true,
  style: { width: '100%', height: '100%' }
};
const DEMO_CFG = { speed: 1.6, uneven: false, vision: 'normal', camera: 'follow' };

// ---------- app ----------
function App() {
  const [phase, setPhase] = useState('menu'); // menu | intro | run | question | reveal | over
  const [tab, setTab] = useState('career');
  const [pace, setPace] = useState(() => { const p = store.get('routeRecall.pace', 'jog'); return PACE[p] ? p : 'jog'; });
  const [maxLevel, setMaxLevel] = useState(() => store.get('routeRecall.maxLevel', 1));
  const [startStage, setStartStage] = useState(0);
  const [custom, setCustom] = useState(() => ({ ...DEFAULT_CUSTOM, ...store.get('routeRecall.custom', {}) }));
  const [bests, setBests] = useState(() => ({ career: store.get('routeRecall.best', 0), custom: 0, daily: 0, ...store.get('routeRecall.bests', {}) }));
  const [daily, setDaily] = useState(() => store.get('routeRecall.dailyStreak', { last: '', streak: 0 }));
  const [shareMsg, setShareMsg] = useState('');
  const [s, setS] = useState({ mode: 'career', level: 1, round: 1, score: 0, lives: 3, streak: 0, seed: null, hist: [] });
  const [round, setRound] = useState(null);
  const [demo, setDemo] = useState(() => buildRoute(8, true));
  const [result, setResult] = useState(null);
  const [built, setBuilt] = useState([]);
  const [passed, setPassed] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [occ, setOcc] = useState({ right: 0, bottom: 240 });
  const stageRef = useRef(null), runRef = useRef(null), demoRef = useRef(null), focusRef = useRef(null), sheetRef = useRef(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setSize({ w: Math.max(200, Math.round(r.width)), h: Math.max(160, Math.round(r.height)) });
    });
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);

  // measure the result sheet so the reveal map fits in the space that is left
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || phase !== 'reveal') return;
    const measure = () => {
      const r = el.getBoundingClientRect(), st = stageRef.current.getBoundingClientRect();
      if (r.width < st.width * 0.8) setOcc({ right: Math.round(r.width), bottom: 0 });
      else setOcc({ right: 0, bottom: Math.round(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el); ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [phase]);

  const cfgFor = useCallback((st) => st.mode === 'career' ? careerCfg(st.level, pace) : st.mode === 'daily' ? dailyCfg(st.round) : customCfg(custom, st.round), [pace, custom]);

  const beginRound = useCallback((st) => {
    const cfg = cfgFor(st);
    // build the route, answer options and target junction together so one seed reproduces the whole puzzle
    const make = () => {
      const route = buildRoute(cfg.turns, cfg.branchAll);
      const n = route.decisions.length;
      const level = st.mode === 'career' ? st.level : st.mode === 'daily' ? st.round : Math.max(1, cfg.turns - 2);
      return {
        key: route.id, route, cfg,
        opts: cfg.answer === 'pick' ? makeOptions(route.decisions, cfg.options, level) : null,
        oneIdx: cfg.answer === 'one' ? rnd(0, n - 1) : null
      };
    };
    setRound(st.seed ? withSeed(`${st.seed}#${st.round}`, make) : make());
    setResult(null); setBuilt([]); setPassed(0);
    // show a stage card when a career/daily run enters a new stage
    const showIntro = (st.mode === 'career' && (st.round === 1 || STAGES.some(x => x.from === st.level)))
      || (st.mode === 'daily' && (st.round === 1 || STAGES.some(x => x.from === st.round)));
    setPhase(showIntro ? 'intro' : 'run');
  }, [cfgFor]);

  const startGame = (mode, seed = null) => {
    const level = mode === 'career' ? STAGES[startStage].from : 1;
    const st = { mode, level, round: 1, score: 0, lives: 3, streak: 0, seed, hist: [] };
    setS(st); setNewBest(false); setShareMsg(''); beginRound(st);
  };

  // a shared link (?daily=YYYY-MM-DD or ?seed=key) drops the player straight into that exact route
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const d = p.get('daily'), seed = p.get('seed');
    if (d) startGame('daily', /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayKey());
    else if (seed) startGame('daily', seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = runRef.current;
    if (!p || phase !== 'run' || !round) return;
    const onEnd = () => setPhase('question');
    const onFrame = e => {
      const d = frameToDist(e.detail.frame, round.route, round.cfg);
      setPassed(round.route.jArc.filter(a => a <= d).length);
    };
    p.addEventListener('ended', onEnd);
    p.addEventListener('frameupdate', onFrame);
    p.play();
    return () => { p.removeEventListener('ended', onEnd); p.removeEventListener('frameupdate', onFrame); };
  }, [phase, round]);

  useEffect(() => {
    const p = demoRef.current;
    if (!p || (phase !== 'menu' && phase !== 'over' && phase !== 'intro')) return;
    const onEnd = () => setDemo(buildRoute(8, true));
    p.addEventListener('ended', onEnd);
    p.play();
    return () => p.removeEventListener('ended', onEnd);
  }, [phase, demo]);

  const submit = useCallback((picked) => {
    if (phase !== 'question') return;
    const truth = round.route.decisions;
    let right, cmp;
    if (round.cfg.answer === 'one') {
      const k = round.oneIdx;
      right = picked === truth[k];
      cmp = truth.map((d, i) => i === k ? picked : d);
    } else {
      cmp = picked;
      right = picked.join('') === truth.join('');
    }
    const streak = right ? s.streak + 1 : 0;
    const pts = right ? Math.round(truth.length * 20 * multiplier(round.cfg)) + (streak - 1) * 15 : 0;
    const ns = {
      ...s, streak, score: s.score + pts, lives: right ? s.lives : s.lives - 1,
      level: right ? s.level + 1 : s.level,
      // daily advances to the next route on every answer so all players see the same ordered sequence
      round: (s.mode === 'daily' || right) ? s.round + 1 : s.round,
      hist: [...s.hist, right]
    };
    setS(ns);
    if (ns.mode === 'career' && ns.level > maxLevel) { setMaxLevel(ns.level); store.set('routeRecall.maxLevel', ns.level); }
    const correctLetter = round.opts ? 'ABCDE'[round.opts.findIndex(o => o.join('') === truth.join(''))] : null;
    setResult({ right, cmp, pts, correctLetter, streak });
    setPhase('reveal');
  }, [phase, round, s, maxLevel]);

  const next = useCallback(() => {
    if (phase !== 'reveal') return;
    if (s.lives > 0) { beginRound(s); return; }
    const key = s.mode;
    if (s.score > (bests[key] || 0)) {
      const nb = { ...bests, [key]: s.score };
      setBests(nb); store.set('routeRecall.bests', nb); setNewBest(s.score > 0);
    }
    // count a daily streak only for today's real Daily (not a shared challenge link)
    if (s.mode === 'daily' && s.seed === todayKey() && daily.last !== s.seed) {
      const nd = { last: s.seed, streak: daily.last === prevKey(s.seed) ? daily.streak + 1 : 1 };
      setDaily(nd); store.set('routeRecall.dailyStreak', nd);
    }
    setDemo(buildRoute(8, true));
    setPhase('over');
  }, [phase, s, bests, daily, beginRound]);

  const toMenu = () => { setDemo(buildRoute(8, true)); setPhase('menu'); };
  const updCustom = (k, v) => setCustom(c => { const n = { ...c, [k]: v }; store.set('routeRecall.custom', n); return n; });

  // ---------- sharing ----------
  const isDailyToday = s.mode === 'daily' && s.seed === todayKey();
  const runTitle = () => s.mode === 'daily'
    ? (isDailyToday ? `Daily #${dailyNumber(s.seed)}` : 'Challenge')
    : s.mode === 'career' ? 'Career' : 'Custom run';
  const shareLink = () => {
    if (s.mode !== 'daily' || !s.seed) return SITE;
    return `${SITE}/?${isDailyToday ? 'daily' : 'seed'}=${encodeURIComponent(s.seed)}`;
  };
  const shareText = () => {
    const cleared = s.hist.filter(Boolean).length;
    const grid = s.hist.map(r => (r ? '🟩' : '🟥')).join('');
    const lines = [
      `Route Recall · ${runTitle()}`,
      `${cleared} route${cleared === 1 ? '' : 's'} recalled · ${s.score.toLocaleString()} pts`,
      grid
    ];
    if (isDailyToday && daily.streak > 1) lines.push(`${daily.streak} day streak 🔥`);
    return lines.join('\n');
  };
  const copy = async (payload, ok) => {
    try { await navigator.clipboard.writeText(payload); setShareMsg(ok); }
    catch (e) { setShareMsg('Could not copy — select and copy manually'); }
  };
  const doShare = async () => {
    const text = shareText(), url = shareLink();
    try { if (navigator.share) { await navigator.share({ title: 'Route Recall', text, url }); setShareMsg('Shared'); return; } }
    catch (e) { if (e && e.name === 'AbortError') return; }
    copy(`${text}\n${url}`, 'Result copied to clipboard');
  };
  const challenge = async () => {
    const base = s.seed || ('c' + Math.random().toString(36).slice(2, 8));
    const url = isDailyToday ? `${SITE}/?daily=${encodeURIComponent(base)}` : `${SITE}/?seed=${encodeURIComponent(base)}`;
    const text = s.seed ? `I recalled this route for ${s.score.toLocaleString()} pts. Beat me:` : 'Can you recall this route? Beat my score:';
    try { if (navigator.share) { await navigator.share({ title: 'Route Recall', text, url }); return; } }
    catch (e) { if (e && e.name === 'AbortError') return; }
    copy(url, 'Challenge link copied');
  };
  const drawCard = () => new Promise(resolve => {
    const W = 1200, H = 630, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const C = { ink: '#ECEAE0', muted: '#A9A79C', pink: '#EA6ABD', ok: '#5CC47F', bad: '#F06A5E' };
    x.fillStyle = '#141B17'; x.fillRect(0, 0, W, H);
    // decorative route line in the brand overprint, bottom-right
    x.strokeStyle = C.pink; x.globalAlpha = 0.22; x.lineWidth = 10; x.lineJoin = 'round'; x.lineCap = 'round';
    x.beginPath();
    const pts = [[760, 560], [760, 430], [900, 430], [900, 300], [1040, 300], [1040, 170], [1150, 170]];
    pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
    x.stroke();
    pts.forEach(p => { x.beginPath(); x.arc(p[0], p[1], 9, 0, 7); x.fillStyle = C.pink; x.fill(); });
    x.globalAlpha = 1;
    const disp = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
    const body = "'Barlow', Arial, sans-serif";
    // brand mark + wordmark
    x.strokeStyle = C.pink; x.lineWidth = 6; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(90, 108); x.lineTo(130, 150); x.lineTo(50, 150); x.closePath(); x.stroke();
    x.fillStyle = C.ink; x.font = `700 48px ${disp}`; x.textBaseline = 'alphabetic';
    x.fillText('ROUTE RECALL', 150, 148);
    // kicker
    x.fillStyle = C.pink; x.font = `700 40px ${disp}`;
    x.fillText(runTitle().toUpperCase(), 90, 250);
    // big score
    x.fillStyle = C.ink; x.font = `700 200px ${disp}`;
    x.fillText(s.score.toLocaleString(), 86, 430);
    const cleared = s.hist.filter(Boolean).length;
    x.fillStyle = C.muted; x.font = `500 34px ${body}`;
    x.fillText(`points  ·  ${cleared} route${cleared === 1 ? '' : 's'} recalled${isDailyToday && daily.streak > 1 ? `  ·  ${daily.streak} day streak` : ''}`, 90, 480);
    // result trace as squares
    const sq = 34, gap = 10, max = Math.min(s.hist.length, 20), startX = 90, rowY = 528;
    for (let i = 0; i < max; i++) {
      x.fillStyle = s.hist[i] ? C.ok : C.bad;
      const rx = startX + i * (sq + gap);
      x.beginPath(); x.roundRect(rx, rowY, sq, sq, 7); x.fill();
    }
    // footer url
    x.fillStyle = C.muted; x.font = `600 30px ${body}`;
    x.fillText(window.location.host, 90, 600);
    c.toBlob(b => resolve(b), 'image/png');
  });
  const shareImage = async () => {
    setShareMsg('Rendering image…');
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    let blob; try { blob = await drawCard(); } catch (e) { blob = null; }
    if (!blob) { setShareMsg('Could not render image'); return; }
    const file = new File([blob], 'route-recall.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Route Recall', text: `${shareText()}\n${shareLink()}` });
        setShareMsg('Shared'); return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'route-recall.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setShareMsg('Image saved — attach it to your post');
  };

  const n = round ? round.route.decisions.length : 0;
  const addArrow = useCallback(d => setBuilt(b => b.length < n ? [...b, d] : b), [n]);
  const undo = useCallback(() => setBuilt(b => b.slice(0, -1)), []);

  useEffect(() => {
    const onKey = e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (phase === 'question' && round) {
        const ans = round.cfg.answer;
        if (ans === 'pick') {
          let idx = 'abcde'.indexOf(k); if (idx < 0) idx = '12345'.indexOf(k);
          if (idx >= 0 && idx < round.opts.length) { e.preventDefault(); submit(round.opts[idx]); }
        } else {
          const map = { arrowleft: 'L', arrowup: 'S', arrowright: 'R' };
          if (map[k]) { e.preventDefault(); ans === 'one' ? submit(map[k]) : addArrow(map[k]); }
          if (ans === 'build' && k === 'backspace') { e.preventDefault(); undo(); }
          if (ans === 'build' && k === 'enter' && built.length === n) { e.preventDefault(); submit(built); }
        }
      } else if ((phase === 'reveal' || phase === 'intro') && (k === 'enter' || k === ' ') && document.activeElement !== focusRef.current) {
        e.preventDefault(); phase === 'reveal' ? next() : setPhase('run');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phase, round, submit, next, addArrow, undo, built, n]);

  useEffect(() => { focusRef.current && focusRef.current.focus({ preventScroll: true }); }, [phase]);

  const inGame = ['intro', 'run', 'question', 'reveal'].includes(phase);
  const tags = round && inGame ? twistTags(round.cfg) : [];
  const stIdx = stageOf(s.level);
  const customMult = multiplier({ ...customCfg(custom, 1) });

  let statusL = 'Choose a mode and start.', statusR = '';
  if (phase === 'intro') statusL = `${n} junctions this run.`;
  if (phase === 'run') { statusL = <><strong>{n} junctions.</strong> Watch every turn.</>; statusR = `Passed ${passed} of ${n}`; }
  if (phase === 'question') statusL = round.cfg.answer === 'build' ? 'Use the arrow keys or the buttons. Backspace undoes.' : 'Pick the way the runner went.';
  if (phase === 'reveal') statusL = result && result.right ? <>Streak <strong>{result.streak}</strong></> : 'Numbered circles mark each junction. Red is where you went wrong.';
  if (phase === 'over') statusL = 'Run over.';

  return (
    <div className="app">
      <header className="bar">
        <div className="brand">
          <svg viewBox="0 0 26 24" aria-hidden="true"><path d="M13 2 L24 21 H2 Z" fill="none" stroke="var(--overprint)" strokeWidth="2.6" strokeLinejoin="round" /></svg>
          <span className="brand-name">Route Recall</span>
        </div>
        <div className="stats">
          <span>{s.mode === 'career' ? 'Level' : 'Round'}<b>{s.mode === 'career' ? s.level : s.round}</b></span>
          <span>Score<b>{s.score}</b></span>
          <span className="lives" role="img" aria-label={`${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left`}>
            {[0, 1, 2].map(i => <i key={i} className={i >= s.lives ? 'lost' : ''} />)}
          </span>
          {inGame && <button className="quit" onClick={toMenu} aria-label="Quit to menu">Quit</button>}
        </div>
      </header>

      <main id="stage" ref={stageRef}>
        <div className="player" aria-hidden="true">
          {(phase === 'menu' || phase === 'over' || phase === 'intro') && (
            <Player key={'demo' + demo.id} ref={demoRef} component={RunComp}
              inputProps={{ route: demo, cfg: DEMO_CFG, w: size.w, h: size.h, demo: true }}
              durationInFrames={runDuration(demo, DEMO_CFG, true)} compositionWidth={size.w} compositionHeight={size.h} {...playerCommon} />
          )}
          {(phase === 'run' || phase === 'question') && round && (
            <Player key={'run' + round.key} ref={runRef} component={RunComp}
              inputProps={{ route: round.route, cfg: round.cfg, w: size.w, h: size.h, demo: false }}
              durationInFrames={runDuration(round.route, round.cfg, false)} compositionWidth={size.w} compositionHeight={size.h} {...playerCommon} />
          )}
          {phase === 'reveal' && round && (
            <Player key={'rev' + round.key} component={RevealComp}
              inputProps={{ route: round.route, cfg: round.cfg, w: size.w, h: size.h, picked: result && result.cmp, occ }}
              durationInFrames={revealDuration(round.route)} compositionWidth={size.w} compositionHeight={size.h} {...playerCommon} />
          )}
        </div>

        {phase === 'menu' && (
          <section className="overlay">
            <div className="panel menu">
              <h1>Route Recall</h1>
              <p>A runner sets off through the forest. Watch which way they go at every junction, then tell us the route they took.</p>
              <button className="daily-card" onClick={() => startGame('daily', todayKey())}>
                <div className="daily-main">
                  <span className="daily-kicker">Daily route #{dailyNumber(todayKey())}</span>
                  <b>Play today’s route</b>
                  <small>The same route for everyone, today only. Share your score.</small>
                </div>
                <span className="daily-side">
                  {daily.streak > 0 && <span className="daily-streak">🔥 {daily.streak}</span>}
                  {bests.daily > 0 && <span className="daily-best">Best {bests.daily.toLocaleString()}</span>}
                  <span className="daily-go" aria-hidden="true">▶</span>
                </span>
              </button>
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'career'} onClick={() => setTab('career')}>Career</button>
                <button role="tab" aria-selected={tab === 'custom'} onClick={() => setTab('custom')}>Custom run</button>
              </div>

              {tab === 'career' ? (
                <div role="tabpanel">
                  <p className="small">Six stages, each adding a new twist. Reach a stage once to unlock it as a starting point.</p>
                  <ol className="stages">
                    {STAGES.map((st, i) => {
                      const locked = maxLevel < st.from;
                      return (
                        <li key={st.name}>
                          <button className={'stage' + (startStage === i ? ' on' : '')} disabled={locked} onClick={() => setStartStage(i)} aria-pressed={startStage === i}>
                            <span className="num">{i + 1}</span>
                            <span className="txt"><b>{st.name}</b><small>{locked ? `Reach level ${st.from} to unlock` : st.desc}</small></span>
                            <span className="lvl">{locked ? 'Locked' : `Level ${st.from}`}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <Seg label="Pace" name="pace" value={pace} onChange={v => { setPace(v); store.set('routeRecall.pace', v); }}
                    options={[['stroll', 'Stroll', 'fewer points'], ['jog', 'Jog', 'standard'], ['sprint', 'Sprint', 'more points']]} />
                  <div className="row start">
                    <button className="btn" ref={focusRef} onClick={() => startGame('career')}>Start at {STAGES[startStage].name}</button>
                    {bests.career > 0 && <span className="small">Best {bests.career}</span>}
                  </div>
                </div>
              ) : (
                <div role="tabpanel" className="custom">
                  <div className="field">
                    <label className="range-label" htmlFor="junc">Junctions <b>{custom.turns}</b></label>
                    <input id="junc" type="range" min="3" max="20" value={custom.turns} onChange={e => updCustom('turns', +e.target.value)} />
                  </div>
                  <Seg label="Speed" name="speed" value={custom.speed} onChange={v => updCustom('speed', v)}
                    options={[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['blazing', 'Blazing']]} />
                  <Seg label="How you answer" name="answer" value={custom.answer} onChange={v => updCustom('answer', v)}
                    options={[['pick', 'Pick a route'], ['build', 'Build it'], ['one', 'One junction']]} />
                  <Seg label="Routes to choose from" name="opts" value={custom.options} onChange={v => updCustom('options', v)} disabled={custom.answer !== 'pick'}
                    options={[[3, '3'], [4, '4'], [5, '5']]} />
                  <Seg label="Vision" name="vision" value={custom.vision} onChange={v => updCustom('vision', v)}
                    options={[['clear', 'Clear'], ['normal', 'Normal'], ['dense', 'Dense fog']]} />
                  <Seg label="Camera" name="camera" value={custom.camera} onChange={v => updCustom('camera', v)}
                    options={[['bird', 'Bird’s-eye'], ['follow', 'Follow'], ['turn', 'Turns with runner']]} />
                  <div className="toggles">
                    <Toggle label="Crossroads" hint="Side roads on both sides of every junction" checked={custom.branchAll} onChange={v => updCustom('branchAll', v)} />
                    <Toggle label="Surges" hint="The runner speeds up and slows down" checked={custom.uneven} onChange={v => updCustom('uneven', v)} />
                    <Toggle label="Get harder" hint="One more junction after each correct answer" checked={custom.harder} onChange={v => updCustom('harder', v)} />
                  </div>
                  <div className="row start">
                    <button className="btn" ref={focusRef} onClick={() => startGame('custom')}>Start custom run</button>
                    <span className="small">Points ×{customMult.toFixed(1)}{bests.custom > 0 ? `, best ${bests.custom}` : ''}</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {phase === 'intro' && round && (
          <section className="overlay card">
            <div className="panel intro" role="dialog" aria-labelledby="introTitle">
              <p className="kicker">Stage {stIdx + 1} of {STAGES.length}</p>
              <h2 id="introTitle">{STAGES[stIdx].name}</h2>
              <p>{STAGES[stIdx].desc}</p>
              {tags.length > 0 && <div className="tags">{tags.map(t => <span key={t} className="tag">{t}</span>)}</div>}
              <div className="row"><button className="btn" ref={focusRef} onClick={() => setPhase('run')}>Start the run</button></div>
            </div>
          </section>
        )}

        {phase === 'question' && round && (
          <section className="overlay">
            <div className="panel question" role="dialog" aria-labelledby="qTitle">
              {round.cfg.answer === 'pick' && <>
                <h2 id="qTitle">Which route did the runner take?</h2>
                <p className="small">{n} arrows, one per junction, from start to finish.</p>
                <ul className="options">
                  {round.opts.map((seq, i) => (
                    <li key={i}>
                      <button className="opt" ref={i === 0 ? focusRef : undefined} onClick={() => submit(seq)}
                        aria-label={`Route ${'ABCDE'[i]}: ${seq.map(d => WORD[d]).join(', ')}`}>
                        <span className="letter">{'ABCDE'[i]}</span><Chips seq={seq} />
                      </button>
                    </li>
                  ))}
                </ul>
              </>}

              {round.cfg.answer === 'build' && <>
                <h2 id="qTitle">Build the route</h2>
                <p className="small">Add one arrow per junction, from start to finish. {built.length} of {n} added.</p>
                <ol className="slots" aria-label="Your route so far">
                  {Array.from({ length: n }, (_, i) => (
                    <li key={i} className={'slot' + (built[i] ? ' filled' : '') + (i === built.length ? ' cur' : '')}>
                      {built[i] ? <Arrow d={built[i]} /> : <span>{i + 1}</span>}
                    </li>
                  ))}
                </ol>
                <div className="pad">
                  {['L', 'S', 'R'].map((d, i) => (
                    <button key={d} className="padbtn" ref={i === 0 ? focusRef : undefined} onClick={() => addArrow(d)} disabled={built.length >= n}>
                      <Arrow d={d} /><span>{d === 'L' ? 'Left' : d === 'R' ? 'Right' : 'Straight'}</span>
                    </button>
                  ))}
                </div>
                <div className="row">
                  <button className="btn" onClick={() => submit(built)} disabled={built.length !== n}>Check route</button>
                  <button className="btn ghost" onClick={undo} disabled={!built.length}>Undo</button>
                </div>
              </>}

              {round.cfg.answer === 'one' && <>
                <h2 id="qTitle">Which way at junction {round.oneIdx + 1}?</h2>
                <p className="small">Count from the start. The run had {n} junctions.</p>
                <div className="pad">
                  {['L', 'S', 'R'].map((d, i) => (
                    <button key={d} className="padbtn" ref={i === 0 ? focusRef : undefined} onClick={() => submit(d)}>
                      <Arrow d={d} /><span>{d === 'L' ? 'Left' : d === 'R' ? 'Right' : 'Straight'}</span>
                    </button>
                  ))}
                </div>
              </>}
            </div>
          </section>
        )}

        {phase === 'reveal' && result && round && (
          <section className="sheet" ref={sheetRef} aria-live="polite">
            <div className="inner">
              <h2 className={result.right ? 'ok' : 'no'}>
                {result.right ? `Correct, +${result.pts}` : round.cfg.answer === 'pick' ? `Wrong route, it was ${result.correctLetter}` : round.cfg.answer === 'one' ? `It was ${WORD[round.route.decisions[round.oneIdx]]}` : 'Not quite'}
              </h2>
              <div className="cmp">
                {!result.right && round.cfg.answer !== 'one' && <><span>You</span><Chips seq={result.cmp} cmp={round.route.decisions} /></>}
                <span>Route</span><Chips seq={round.route.decisions} only={round.cfg.answer === 'one' ? round.oneIdx : undefined} cmp={round.cfg.answer === 'one' ? result.cmp : undefined} />
              </div>
              <div className="row">
                <button className="btn" ref={focusRef} onClick={next}>
                  {s.lives > 0 ? (result.right ? (s.mode === 'career' ? 'Next level' : 'Next round') : 'Try another route') : 'See results'}
                </button>
              </div>
            </div>
          </section>
        )}

        {phase === 'over' && (
          <section className="overlay">
            <div className="panel" role="dialog" aria-labelledby="overTitle">
              <p className="kicker">{s.mode === 'daily' ? runTitle() : 'Run over'}</p>
              <h2 id="overTitle">{newBest ? 'New best score' : 'Run over'}</h2>
              {s.hist.length > 0 && (
                <div className="trace" aria-label={`${s.hist.filter(Boolean).length} of ${s.hist.length} routes recalled`}>
                  {s.hist.map((r, i) => <i key={i} className={r ? 'hit' : 'miss'} />)}
                </div>
              )}
              <div className="stat-grid">
                <div><span>Score</span><b>{s.score.toLocaleString()}</b></div>
                <div><span>Recalled</span><b>{s.hist.filter(Boolean).length}</b></div>
                <div><span>Best</span><b>{(bests[s.mode] || 0).toLocaleString()}</b></div>
              </div>
              {isDailyToday && daily.streak > 1 && <p className="small">🔥 {daily.streak} day streak — come back tomorrow to keep it.</p>}
              <div className="share-row">
                <button className="btn" ref={focusRef} onClick={doShare}>Share result</button>
                <button className="btn ghost" onClick={shareImage}>Share image</button>
                <button className="btn ghost" onClick={challenge}>Challenge a friend</button>
              </div>
              {shareMsg && <p className="small share-msg" role="status">{shareMsg}</p>}
              <div className="row">
                <button className="btn" onClick={() => startGame(s.mode, s.seed)}>Run again</button>
                <button className="btn ghost" onClick={toMenu}>Menu</button>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className={'status' + (inGame ? ' playing' : '')}>
        <span className="msg">{statusL}</span>
        {tags.length > 0 && phase !== 'intro' && <span className="tags small-tags">{tags.map(t => <span key={t} className="tag">{t}</span>)}</span>}
        {statusR && <span className="right">{statusR}</span>}
        <span className="credit">Made by <a href="https://x.com/dharmikjagodana" target="_blank" rel="noopener noreferrer">@dharmikjagodana</a></span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<><App /><Analytics /><SpeedInsights /></>);
