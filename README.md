# Route Recall

A route-memory game. A runner crosses an orienteering map, turning left, right or going straight at each junction. When the run ends, the map disappears and you recall the route they took.

Built with React and [Remotion](https://www.remotion.dev/): every round is a Remotion composition generated from a freshly randomised route and played with `@remotion/player`.

## How to play

1. Watch the runner. Every junction is one decision: left, right or straight.
2. When the run ends, answer the question:
   - **Pick a route**: choose the matching arrow sequence from 3 to 5 options.
   - **Build it**: enter the route yourself, one arrow per junction (arrow keys work).
   - **One junction**: say which way the runner went at a single numbered junction.
3. The reveal draws the real route and marks any junction you got wrong in red.

Three wrong answers end the run.

### Daily route

One route sequence for everyone, every day. The route, answer options and terrain are generated from a seeded RNG keyed to the date (`src/logic.js` `withSeed`), so two players on the same day face the identical puzzle and their scores are directly comparable. A daily streak counts consecutive days played. From the game-over screen you can:

- **Share result** — a spoiler-free summary (🟩/🟥 trace, score, streak) via the Web Share API, with a clipboard fallback.
- **Share image** — a branded score card rendered on a `<canvas>` and shared as a PNG (or downloaded).
- **Challenge a friend** — a `?seed=` (or `?daily=`) link that drops anyone into the exact same route to beat your score.

Opening the site with `?daily=YYYY-MM-DD` or `?seed=<key>` starts that specific route immediately.

### Career

Six stages, each adding a twist: Trail, Forest (crossroads, 4 options), Night (dense fog), Turning map (the map rotates with the runner), Surges (uneven speed) and Retrace (build the route yourself). Reaching a stage unlocks it as a starting point.

### Custom run

Set junctions (3 to 20), speed, answer type, number of options, vision, camera (bird's-eye, follow, turns with runner), crossroads, surges and whether each round gets harder. Harder settings score more.

### Keys

| Key | Action |
| --- | --- |
| A–E or 1–5 | Pick a route |
| ← ↑ → | Left, straight, right (build and one-junction modes) |
| Backspace | Undo the last arrow |
| Enter | Check route / continue |

## Development

Requires Node 18 or later.

```bash
npm install
npm run dev       # local dev server
npm run build     # production build in dist/
npm run preview   # serve the production build
```

## Deploy to Vercel

The project is a standard Vite app, and `vercel.json` sets the build for you.

- **Dashboard:** import the GitHub repo at [vercel.com/new](https://vercel.com/new) and click Deploy. No settings need changing.
- **CLI:** `npx vercel` for a preview, `npx vercel --prod` for production.

## Project structure

```
index.html              entry page (fonts, meta, favicon)
src/main.jsx            app shell: menus, career/custom modes, questions, scoring
src/compositions.jsx    Remotion compositions: the run and the reveal
src/logic.js            route generator, answer options, terrain, speed profile
src/styles.css          orienteering-map theme, light/dark, responsive layout
scripts/make-og.mjs     regenerates public/og.png (the social share image) — `npm run og`
public/favicon.svg
public/og.png           1200x630 Open Graph / Twitter card image
vercel.json             Vercel build settings and asset caching
```

## Remotion licence

Remotion is free for individuals and companies of up to three people. Larger companies need a [company licence](https://www.remotion.dev/license).

---

Made by [@dharmikjagodana](https://x.com/dharmikjagodana)
