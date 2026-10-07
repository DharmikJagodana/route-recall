// Generates public/og.png — the social share preview (1200x630).
// Run with: npm run og
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1200, H = 630;
const c = createCanvas(W, H);
const x = c.getContext('2d');

const C = { bg: '#141B17', panel: '#1C2420', ink: '#ECEAE0', muted: '#A9A79C', pink: '#EA6ABD', veg: '#1E3B26' };

// background
x.fillStyle = C.bg; x.fillRect(0, 0, W, H);

// faint terrain blobs
x.fillStyle = C.veg; x.globalAlpha = 0.5;
for (const [cx, cy, r] of [[980, 120, 90], [1080, 330, 70], [880, 470, 60], [1140, 520, 50]]) {
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
}
x.globalAlpha = 1;

// the runner's route, drawn in the brand overprint
x.strokeStyle = C.pink; x.lineWidth = 12; x.lineJoin = 'round'; x.lineCap = 'round';
const route = [[720, 560], [720, 420], [880, 420], [880, 270], [1030, 270], [1030, 150], [1150, 150]];
x.globalAlpha = 0.9; x.beginPath();
route.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
x.stroke();
route.forEach((p, i) => { x.beginPath(); x.arc(p[0], p[1], i === 0 ? 13 : 8, 0, Math.PI * 2); x.fillStyle = C.pink; x.fill(); });
x.globalAlpha = 1;

const disp = 'Arial';
// brand mark (triangle) + wordmark
x.strokeStyle = C.pink; x.lineWidth = 7; x.lineJoin = 'round';
x.beginPath(); x.moveTo(95, 95); x.lineTo(137, 140); x.lineTo(53, 140); x.closePath(); x.stroke();
x.fillStyle = C.ink; x.font = `bold 52px ${disp}`;
x.fillText('ROUTE RECALL', 160, 138);

// headline
x.fillStyle = C.ink; x.font = `bold 96px ${disp}`;
x.fillText('Remember', 90, 320);
x.fillText('the route.', 90, 420);

// subline
x.fillStyle = C.muted; x.font = `28px ${disp}`;
x.fillText('Watch the runner. Recall every turn they took.', 92, 475);

// daily pill
x.fillStyle = C.pink; x.font = `bold 26px ${disp}`;
x.fillText('NEW DAILY ROUTE EVERY DAY', 92, 545);

// footer url
x.fillStyle = C.muted; x.font = `bold 26px ${disp}`;
x.fillText('route-recall.vercel.app', 92, 592);

mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public', 'og.png'), c.toBuffer('image/png'));
console.log('wrote public/og.png');
