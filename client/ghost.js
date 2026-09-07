// Ghost mode: sit on someone's shoulder. The place they are in, painted as a scene from beside
// them: the sky at this hour, the ground of this place, the people who are here with what they
// just said, and them in the foreground with what they are thinking and doing. It changes as
// they move. You are only a ghost; you cannot touch anything and they do not know.

import * as PX from './pixel.js';

const esc = (s) => String(s ?? '');
function text(g, t, x, y, { size = 14, color = '#f3ecd9', align = 'left', font = 'system-ui', italic = false, weight = '' } = {}) {
  g.font = `${italic ? 'italic ' : ''}${weight ? weight + ' ' : ''}${size}px ${font}`; g.textAlign = align;
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(t, x + 1, y + 1); g.fillStyle = color; g.fillText(t, x, y);
}
function wrap(g, t, maxW) { const words = String(t).split(' '), lines = []; let cur = ''; for (const wd of words) { const tst = cur ? cur + ' ' + wd : wd; if (g.measureText(tst).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = tst; } if (cur) lines.push(cur); return lines; }
function bubble(g, t, x, y, maxW, { color = '#f3ecd9', bg = 'rgba(8,10,16,.78)', size = 13, italic = false, tail = true } = {}) {
  g.font = `${italic ? 'italic ' : ''}${size}px Georgia, serif`;
  const lines = wrap(g, t, maxW), lh = size * 1.3, w = Math.min(maxW, Math.max(...lines.map(l => g.measureText(l).width))) + 20, h = lines.length * lh + 14;
  const cw = g.canvas.width / (window.devicePixelRatio || 1); const bx = Math.max(6, Math.min(x - w / 2, cw - w - 6)), by = y - h;
  g.fillStyle = bg; g.beginPath(); g.roundRect(bx, by, w, h, 8); g.fill();
  if (tail) { g.beginPath(); g.moveTo(x - 6, by + h); g.lineTo(x + 6, by + h); g.lineTo(x, by + h + 8); g.fill(); }
  g.fillStyle = color; g.textAlign = 'left';
  lines.forEach((l, i) => g.fillText(l, bx + 10, by + 10 + (i + 0.75) * lh));
  return by;
}

const SKY = {
  dawn: ['#3a3556', '#c98a7a', '#e6c39b'], morning: ['#6aa0d8', '#9ac4ea', '#d6e8f5'], midday: ['#5b93d3', '#8fbbe8', '#cfe3f4'],
  afternoon: ['#6a98d0', '#c9b58a', '#e8d5a8'], evening: ['#2f2a4d', '#c26a4a', '#e8a04c'], night: ['#05070f', '#0e1424', '#1a2238'],
};
const GROUND = { spring: ['#4f8a3c', '#5c9a45'], summer: ['#4a8236', '#5a9440'], autumn: ['#7a7a34', '#8a8a3c'], winter: ['#c9d5df', '#e8eef4'] };

// Which pixel sprite stands for the place, and how the middle ground is dressed.
function dressPlace(g, s, W, H, horizon, t) {
  const k = s.place, ground = H - horizon, blit = (img, x, y, size) => PX.blit(g, img, x, y, size);
  const tree = s.season === 'winter' ? PX.PINE_SNOW : PX.PINE;
  const rnd = (i) => ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1;
  if (k === 'forest') { for (let i = 0; i < 14; i++) { const d = rnd(i); const size = 60 + d * 120; blit(tree, (i / 14) * W - size / 2 + rnd(i + 9) * 40, horizon - size * 0.85 + d * ground * 0.35, size); } }
  else if (k === 'field') { for (let r = 0; r < 4; r++) for (let c = -1; c < W / 90 + 1; c++) blit(s.season === 'winter' ? PX.FIELD_WINTER : PX.FIELD, c * 90 + (r % 2) * 45, horizon + r * 48 - 10, 96); }
  else if (k === 'meadow') { if (s.season !== 'winter') for (let r = 0; r < 3; r++) for (let c = -1; c < W / 110 + 1; c++) blit(PX.MEADOW, c * 110 + (r % 2) * 55, horizon + r * 50, 116); }
  else if (k === 'quarry' || k === 'hills') { for (let i = 0; i < 6; i++) blit(PX.ROCKS, (i / 6) * W + rnd(i) * 40, horizon - 20 + rnd(i + 3) * 60, 90 + rnd(i + 5) * 80); if (k === 'hills') { g.fillStyle = '#7c6f55'; g.beginPath(); g.moveTo(0, horizon); for (let x = 0; x <= W; x += 40) g.lineTo(x, horizon - 30 - Math.sin(x / 90) * 40 - rnd(x) * 20); g.lineTo(W, horizon); g.fill(); } }
  else if (k === 'creek' || k === 'lake') { g.fillStyle = k === 'lake' ? '#2b4f7e' : '#3f6fa8'; const top = k === 'lake' ? horizon + 10 : horizon + ground * 0.35; g.fillRect(0, top, W, k === 'lake' ? ground * 0.6 : ground * 0.25); g.fillStyle = 'rgba(143,184,230,.5)'; for (let i = 0; i < 24; i++) g.fillRect((i * 97 + t * 40) % W, top + 10 + rnd(i) * (k === 'lake' ? ground * 0.5 : ground * 0.2), 30 + rnd(i + 1) * 40, 2); if (s.builds?.pool?.done && k === 'creek') blit(PX.POOL, W * 0.65, top - 30, 120); }
  else if (k === 'grove') { for (let i = 0; i < 8; i++) blit(PX.GROVE, (i / 8) * W + rnd(i) * 30, horizon - 70 + rnd(i + 2) * 50, 110 + rnd(i + 4) * 60); }
  else if (k === 'claypit') { g.fillStyle = '#9a4a2f'; g.fillRect(W * 0.2, horizon + 30, W * 0.6, ground * 0.35); blit(PX.CLAY, W * 0.4, horizon + 20, 140); }
  else if (k === 'ruin') { g.fillStyle = '#5f5f5f'; for (let i = 0; i < 5; i++) g.fillRect(W * 0.15 + i * W * 0.15, horizon - 40 - rnd(i) * 60, 40 + rnd(i + 1) * 30, 60 + rnd(i) * 60); }
  else if (k === 'well') { blit(PX.WELL, W / 2 - 90, horizon - 60, 180); if (s.builds?.wellhouse?.done) { g.fillStyle = '#7a5533'; g.fillRect(W / 2 - 110, horizon - 120, 220, 16); g.fillRect(W / 2 - 104, horizon - 120, 10, 70); g.fillRect(W / 2 + 94, horizon - 120, 10, 70); } if (s.builds?.bathhouse?.done) { blit(PX.HOUSE, W * 0.78, horizon - 90, 150); text(g, 'the bathhouse', W * 0.78 + 75, horizon + 70, { size: 11, align: 'center', color: '#c9c2b0' }); } }
  else if (k === 'hearth' || k === 'camp') {
    const fire = s.fireWood > 0;
    if (k === 'hearth' && s.builds?.hall?.done) { g.fillStyle = 'rgba(201,163,106,.18)'; g.beginPath(); g.ellipse(W / 2, horizon + 40, W * 0.42, ground * 0.5, 0, 0, 7); g.fill(); g.fillStyle = '#7a5533'; for (let i = 0; i < 6; i++) g.fillRect(W * 0.1 + i * W * 0.16, horizon - 140, 12, 180); g.fillStyle = '#5b3d22'; g.fillRect(W * 0.08, horizon - 150, W * 0.84, 14); }
    if (k === 'camp') for (let i = 0; i < 4; i++) blit(i % 2 ? PX.TENT_DARK : PX.TENT, W * 0.1 + i * W * 0.25, horizon - 50 + rnd(i) * 30, 110);
    else { blit(PX.HOUSE, W * 0.05, horizon - 80, 120); blit(PX.HOUSE, W * 0.8, horizon - 70, 110); if (s.builds?.granary?.done) blit(PX.GRANARY, W * 0.62, horizon - 60, 100); if (s.builds?.commons?.done) blit(PX.BIGHOUSE, W * 0.25, horizon - 90, 140); }
    blit(fire ? PX.fire(t) : PX.FIRE_OUT, W / 2 - 70, horizon - 40, 140);
    if (fire) { const grd = g.createRadialGradient(W / 2, horizon + 20, 10, W / 2, horizon + 20, 260); grd.addColorStop(0, 'rgba(255,176,58,.35)'); grd.addColorStop(1, 'rgba(255,176,58,0)'); g.fillStyle = grd; g.fillRect(0, 0, W, H); }
    if (s.holiday) { g.strokeStyle = '#c0304a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, horizon - 150); g.quadraticCurveTo(W / 2, horizon - 90, W, horizon - 150); g.stroke(); for (let i = 0; i < 12; i++) { g.fillStyle = ['#c0304a', '#e8d36a', '#3f6fa8'][i % 3]; const x = (i + 0.5) * W / 12, y = horizon - 150 + Math.sin(i / 12 * Math.PI) * 60; g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.lineTo(x, y + 16); g.fill(); } }
  }
  else if (k === 'edge') { g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([12, 10]); g.lineWidth = 2; g.beginPath(); g.moveTo(0, horizon + 40); g.lineTo(W, horizon + 40); g.stroke(); g.setLineDash([]); const fog = g.createLinearGradient(0, horizon - 80, 0, horizon + 30); fog.addColorStop(0, 'rgba(200,205,215,.85)'); fog.addColorStop(1, 'rgba(200,205,215,0)'); g.fillStyle = fog; g.fillRect(0, horizon - 80, W, 110); text(g, 'the pale', W / 2, horizon - 40, { size: 13, align: 'center', color: '#c9c2b0', italic: true }); }
  else if (k === 'road') { g.fillStyle = '#9b8b6a'; g.beginPath(); g.moveTo(W * 0.45, horizon); g.lineTo(W * 0.55, horizon); g.lineTo(W * 0.9, H); g.lineTo(W * 0.1, H); g.fill(); }
  else if (k === 'graves') { for (let i = 0; i < Math.min(14, Math.max(1, s.graves)); i++) blit(PX.STONE, W * 0.15 + (i % 7) * W * 0.1, horizon - 10 + Math.floor(i / 7) * 50, 40); }
  else if (k === 'rival') { for (let i = 0; i < 5; i++) blit(i % 3 ? PX.TENT : PX.TENT_DARK, W * 0.05 + i * W * 0.2, horizon - 50 + rnd(i) * 30, 100); blit(PX.fire(t), W / 2 - 50, horizon - 20, 100); }
  else if (k === 'wild') { for (let i = 0; i < 5; i++) blit(tree, (i / 5) * W + rnd(i) * 60, horizon - 60 + rnd(i + 3) * 40, 50 + rnd(i + 7) * 50); const fog = g.createLinearGradient(0, 0, 0, H); fog.addColorStop(0, 'rgba(200,205,215,.25)'); fog.addColorStop(1, 'rgba(200,205,215,0)'); g.fillStyle = fog; g.fillRect(0, 0, W, H); }
  else if (k === 'store' || k === 'bank' || k === 'council') { blit(k === 'store' ? PX.STORE : k === 'bank' ? PX.BANK : PX.MEETING, W / 2 - 110, horizon - 170, 220); }
}

// The whole scene. s = { place, label, season, tick, tickName, sky, cold, snow, me, others, animals, beat, fireWood, builds, holiday, graves, card, t }
export function drawScene(canvas, s) {
  const g = canvas.getContext('2d'); const R = window.devicePixelRatio || 1; g.setTransform(R, 0, 0, R, 0, 0); const W = canvas.width / R, H = canvas.height / R; const t = s.t || 0;
  g.imageSmoothingEnabled = false;
  const sway = Math.sin(t * 0.7) * 3;
  g.save(); g.translate(sway, Math.sin(t * 0.9) * 2);
  const horizon = H * 0.46;
  // sky
  const sk = SKY[s.tickName] || SKY.midday;
  const grd = g.createLinearGradient(0, 0, 0, horizon); grd.addColorStop(0, sk[0]); grd.addColorStop(0.6, sk[1]); grd.addColorStop(1, sk[2]); g.fillStyle = grd; g.fillRect(-10, -10, W + 20, horizon + 10);
  if (s.tickName === 'night' || s.tickName === 'dawn') { g.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 60; i++) { const x = ((i * 173) % W), y = ((i * 97) % (horizon * 0.8)); g.fillRect(x, y, 1.5, 1.5); } }
  if (s.tickName === 'night') { g.fillStyle = '#e8e2d0'; g.beginPath(); g.arc(W * 0.8, horizon * 0.3, 22, 0, 7); g.fill(); }
  else if (s.tickName !== 'dawn') { g.fillStyle = s.tickName === 'evening' ? '#ff8a3a' : '#fff1a8'; g.beginPath(); g.arc(W * (s.tickName === 'morning' ? 0.2 : s.tickName === 'evening' ? 0.85 : 0.5), horizon * (s.tickName === 'midday' ? 0.15 : 0.35), 26, 0, 7); g.fill(); }
  if (s.cold > 0.35 && s.season === 'winter') { g.fillStyle = 'rgba(200,210,225,.35)'; g.fillRect(-10, -10, W + 20, horizon + 10); }
  // far ground and the ground
  const gr = GROUND[s.season] || GROUND.summer;
  g.fillStyle = gr[0]; g.fillRect(-10, horizon - 6, W + 20, H - horizon + 20);
  g.fillStyle = gr[1]; for (let i = 0; i < 40; i++) { const x = (i * 131) % W, y = horizon + ((i * 71) % (H - horizon)); g.fillRect(x, y, 14, 3); }
  if (s.place !== 'home') dressPlace(g, s, W, H, horizon, t);
  // snow falling
  if (s.snow) { g.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 80; i++) { const x = (i * 131 + t * 12) % W, y = (i * 53 + t * 60) % H; g.fillRect(x, y, 2, 2); } }
  // the people here, mid-ground, each with a name and what they last said
  const others = s.others || [];
  others.slice(0, 8).forEach((o, i) => {
    const n = Math.min(8, others.length); const x = W * (0.2 + (i + 0.5) / n * 0.62) + Math.sin(t * 0.8 + i) * 3; const y = horizon + 30 + (i % 3) * 34; const size = 74 + (i % 3) * 10;
    PX.blit(g, PX.person({ ...PX.personLook(o), child: o.stage === 'child', frame: Math.floor(t * 2 + i) % 2 }), x - size / 2, y - size, size);
    text(g, o.name, x, y + 14, { size: 12, align: 'center', color: '#fff' });
    if (o.doingText) text(g, o.doingText.length > 42 ? o.doingText.slice(0, 40) + '…' : o.doingText, x, y + 28, { size: 10, align: 'center', color: '#c9c2b0' });
    if (o.lastSaid && o.saidNow) bubble(g, `“${o.lastSaid}”`, x, y - size - 4, 200, { size: 12 });
  });
  if (!others.length && s.place !== 'home') text(g, 'no one else is here', W / 2, horizon + 60, { size: 12, align: 'center', color: '#c9c2b0', italic: true });
  // animals about
  (s.animals || []).slice(0, 4).forEach((an, i) => { const img = an.kind === 'cat' ? PX.CAT : an.kind === 'dog' ? PX.DOG : an.kind === 'hen' ? PX.HEN : an.kind === 'goat' ? PX.GOAT : an.kind === 'deer' ? PX.DEER : null; if (img) PX.blit(g, img, W * 0.1 + i * 60, H - 110, 44); });
  g.restore();
  drawOverlay(canvas, s);
}

// Me on the shoulder, the frame, and the running lines. Used over outdoor scenes and over the drawn interiors alike.
export function drawOverlay(canvas, s) {
  const g = canvas.getContext('2d'); const R = window.devicePixelRatio || 1; g.setTransform(R, 0, 0, R, 0, 0); const W = canvas.width / R, H = canvas.height / R; const t = s.t || 0;
  // me: over the shoulder, foreground left, seen from behind
  const me = s.me; if (me) {
    const size = Math.min(H * 0.5, 240), x = W * 0.16, y = H - 10;
    g.save(); g.globalAlpha = 0.92; g.filter = 'brightness(0.75)';
    PX.blit(g, PX.person({ ...PX.personLook(me), child: me.stage === 'child', frame: Math.floor(t * 1.5) % 2 }), x - size / 2, y - size, size);
    g.restore();
    const b = s.beat || {};
    if (b.thought) bubble(g, b.thought, x + size * 0.35, y - size - 8, Math.min(W * 0.45, 360), { size: 15, italic: true, color: '#f0d9b0', bg: 'rgba(8,10,16,.82)' });
  }
  // the ghost's own frame: where, when, and the running lines
  g.fillStyle = 'rgba(8,10,16,.7)'; g.fillRect(0, 0, W, 34);
  text(g, `${s.label}`, 14, 23, { size: 15, weight: 'bold', color: '#e8a04c' });
  text(g, `day ${s.day} · ${s.tickName} · ${s.season}, ${s.sky}`, W - 14, 23, { size: 12, align: 'right', color: '#c9c2b0' });
  const b = s.beat || {}; const L = [];
  if (b.doing) L.push(['you do', b.doing, '#6cc38a']);
  if (b.said) L.push(['you say', `“${b.said}”`, '#e8a04c']);
  for (const h of (b.heard || []).slice(-2)) L.push(['you hear', h, '#e8a04c']);
  for (const h of (b.happened || []).slice(-2)) L.push(['it happens', h, '#c8d6ee']);
  if (L.length) {
    g.font = '13px Georgia, serif';
    const rows = L.flatMap(([k, v, c]) => wrap(g, v, W * 0.62).map((l, i) => [i === 0 ? k : '', l, c]));
    const lh = 18, bh = rows.length * lh + 16, bx = W * 0.33, by = H - bh - 8;
    g.fillStyle = 'rgba(8,10,16,.78)'; g.beginPath(); g.roundRect(bx, by, W * 0.66 - 8, bh, 8); g.fill();
    rows.forEach(([k, l, c], i) => { if (k) text(g, k.toUpperCase(), bx + 10, by + 14 + i * lh, { size: 9, color: '#8a94a6' }); text(g, l, bx + 78, by + 14 + i * lh, { size: 13, color: c, font: 'Georgia, serif' }); });
  }
  text(g, 'ghost mode · on their shoulder · they cannot see you · Esc leaves', W - 14, 50, { size: 10, align: 'right', color: '#8a94a6' });
  g.setTransform(1, 0, 0, 1, 0, 0);
}
