// Inside a house or the store. Drawn in the same pixel hand as the map: a room you can look into,
// with the people who are there, what is on the shelves, and the fire. Nothing here is a menu.

import * as PX from './pixel.js';

const PAL = {
  '.': null,
  w: '#7a5533', W: '#5b3d22', d: '#8a6b45', D: '#6f5535', k: '#2b2b2b', r: '#8d8d8d', R: '#5f5f5f',
  y: '#fff1a8', o: '#e8d36a', e: '#c0304a', p: '#2f6b2a', P: '#245c2e', t: '#9b8b6a', T: '#857658',
  a: '#3f6fa8', l: '#8fb8e6', c: '#9a4a2f', b: '#a8452f', j: '#4a5a7a', z: '#5d7a4a', Z: '#7a5a8a', f: '#ffb03a',
  n: '#f1d7b5', g: '#4f8a3c', s: '#e8eef4',
};
const cache = new Map();
function sprite(rows, key) {
  if (cache.has(key)) return cache.get(key);
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const col = PAL[rows[y][x]]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }
  cache.set(key, c); return c;
}

// 8x8 icons for what people own. Rough, readable, one glance.
const ICONS = {
  food:    ['........', '..oooo..', '.oooooo.', '.oeoooe.', '.oooooo.', '..oooo..', '...tt...', '........'],
  bread:   ['........', '..tttt..', '.tyyyyt.', 'tyyyyyyt', 'tyyyyyyt', '.tttttt.', '........', '........'],
  wood:    ['........', '.WWWWWW.', 'WwwwwwwW', 'WwwwwwwW', '.WWWWWW.', '.WWWWWW.', 'WwwwwwwW', '.WWWWWW.'],
  stone:   ['........', '...rr...', '..rrrr..', '.rrRrrr.', '.rrrRRr.', '..rrrr..', '........', '........'],
  fiber:   ['t......t', '.t....t.', '..t..t..', '...tt...', '...tt...', '..t..t..', '.t....t.', 't......t'],
  herbs:   ['....p...', '...pp...', '..ppp...', '.ppPp...', '..pp.p..', '...p.p..', '...p....', '...p....'],
  berries: ['........', '..e..e..', '.eee.ee.', '..e.eee.', '.e...e..', '.ee.....', '..e.....', '........'],
  fish:    ['........', '..lll...', '.lllll.a', 'llallla.', '.lllll.a', '..lll...', '........', '........'],
  clay:    ['........', '........', '..cccc..', '.cccccc.', '.cccccc.', '..cccc..', '........', '........'],
  coin:    ['........', '..oooo..', '.oyyyyo.', '.oyooyo.', '.oyooyo.', '.oyyyyo.', '..oooo..', '........'],
  rope:    ['.tt.....', 't..t....', 't..t....', '.tt.tt..', '...t..t.', '...t..t.', '....tt..', '........'],
  axe:     ['....rr..', '...rrrr.', '..wrrrr.', '..w.rr..', '.w......', '.w......', 'w.......', '........'],
  hoe:     ['......rr', '.....rr.', '....w...', '...w....', '..w.....', '.w......', 'w.......', '........'],
  blanket: ['........', '.jjjjjj.', '.jyjjyj.', '.jjjjjj.', '.jyjjyj.', '.jjjjjj.', '........', '........'],
  quilt:   ['........', '.ZjZjZj.', '.jZjZjZ.', '.ZjZjZj.', '.jZjZjZ.', '.ZjZjZj.', '........', '........'],
  salve:   ['........', '...yy...', '..pppp..', '.pppppp.', '.pppppp.', '..pppp..', '........', '........'],
  charm:   ['...o....', '..o.o...', '.o...o..', '..o.o...', '...o....', '...y....', '..yyy...', '........'],
  pot:     ['........', '.kkkkkk.', '..kkkk..', '..kkkk..', '..kkkk..', '..kkkk..', '.kkkkkk.', '........'],
  pie:     ['........', '..tttt..', '.tyeyet.', 'tteyeyet', 'tttttttt', '.tttttt.', '........', '........'],
  tonic:   ['...tt...', '...tt...', '..aaaa..', '.aaaaaa.', '.aallaa.', '.aaaaaa.', '..aaaa..', '........'],
  toy:     ['........', '..nn....', '.nnnn...', '..nn.bb.', '.bbbbbb.', '..bb....', '.b..b...', '........'],
};
const icon = (k) => ICONS[k] ? sprite(ICONS[k], 'i-' + k) : sprite(['........', '.tttttt.', 'tTTTTTTt', 'tTTTTTTt', 'tTTTTTTt', 'tTTTTTTt', '.tttttt.', '........'], 'i-sack');

function planks(g, x, y, w, h) {
  for (let yy = y; yy < y + h; yy += 12) { g.fillStyle = (Math.floor((yy - y) / 12) % 2) ? '#6a4a2c' : '#734f30'; g.fillRect(x, yy, w, 12); g.fillStyle = '#4e3620'; g.fillRect(x, yy + 11, w, 1); }
}
function wall(g, x, y, w, h, color = '#3b2a1c') { g.fillStyle = color; g.fillRect(x, y, w, h); g.fillStyle = '#2a1d13'; g.fillRect(x, y + h - 3, w, 3); }
function label(g, text, x, y, color = '#d9dee8', size = 11, align = 'center') { g.font = `${size}px system-ui`; g.textAlign = align; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(text, x + 1, y + 1); g.fillStyle = color; g.fillText(text, x, y); }
function person(g, a, x, y, size = 44) { PX.blit(g, PX.person({ ...PX.personLook(a), child: a.stage === 'child' }), x - size / 2, y - size, size); label(g, a.name, x, y + 12, '#fff', 11); }
function shelfRow(g, items, x, y, w, max = 8, sub = null) {
  const list = items.slice(0, max); if (!list.length) return;
  const gap = Math.min(64, w / list.length);
  g.fillStyle = '#4e3620'; g.fillRect(x, y + 22, w, 4);
  list.forEach(([k, n], i) => { const cx = x + gap * i + gap / 2; PX.blit(g, icon(k), cx - 10, y, 20); label(g, `${k} ${typeof n === 'number' && n % 1 ? n.toFixed(1) : n}`, cx, y + 36, '#e8e2d0', 10); if (sub) label(g, sub(k), cx, y + 47, '#a9a290', 9); });
}

// A house. residents: those who live here; inside: those home now; visitors: at the door.
export function drawHouse(canvas, { residents, inside, visitors, ups, inv, lit, night }) {
  const g = canvas.getContext('2d'); const W = canvas.width, H = canvas.height;
  g.imageSmoothingEnabled = false; g.clearRect(0, 0, W, H);
  const big = !!ups.bighouse;
  wall(g, 0, 0, W, 70, big ? '#4a3626' : '#3b2a1c');
  planks(g, 0, 70, W, H - 70);
  if (ups.garden) { g.fillStyle = '#1b2a3a'; g.fillRect(W - 96, 14, 56, 40); g.fillStyle = night ? '#223' : '#6aa44e'; g.fillRect(W - 92, 18, 48, 32); g.fillStyle = '#4e3620'; g.fillRect(W - 70, 14, 4, 40); g.fillRect(W - 96, 32, 56, 4); label(g, 'garden', W - 68, 66, '#a9a290', 9); }
  // hearth on the left wall
  g.fillStyle = '#5f5f5f'; g.fillRect(16, 20, 72, 60); g.fillStyle = '#3d3d3d'; g.fillRect(24, 30, 56, 50);
  PX.blit(g, lit ? PX.fire(0) : PX.FIRE_OUT, 32, 34, 40);
  if (lit) { const grd = g.createRadialGradient(52, 70, 4, 52, 70, 120); grd.addColorStop(0, 'rgba(255,176,58,.35)'); grd.addColorStop(1, 'rgba(255,176,58,0)'); g.fillStyle = grd; g.fillRect(0, 0, 220, H); }
  // shelf along the wall: what the house holds
  const items = Object.entries(inv).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  shelfRow(g, items, 110, 8, W - 220, big ? 10 : 7);
  if (items.length > (big ? 10 : 7)) label(g, `+${items.length - (big ? 10 : 7)} more on the shelf`, W - 110, 64, '#a9a290', 10, 'right');
  // beds: one per resident, along the right
  const beds = Math.max(1, Math.min(residents.length, big ? 4 : 3));
  for (let i = 0; i < beds; i++) {
    const bx = W - 92, by = 96 + i * 44;
    g.fillStyle = '#4e3620'; g.fillRect(bx, by, 76, 30);
    g.fillStyle = (inv.quilt || 0) > i ? '#7a5a8a' : (inv.blanket || 0) > i ? '#4a5a7a' : '#8a7a5a'; g.fillRect(bx + 4, by + 4, 68, 22);
    g.fillStyle = '#e8e2d0'; g.fillRect(bx + 8, by + 8, 16, 12);
    if (residents[i]) label(g, residents[i].name, bx + 38, by + 42, '#a9a290', 9);
  }
  // table in the middle, with bread on it if there is any
  g.fillStyle = '#5b3d22'; g.fillRect(W / 2 - 50, 150, 100, 36); g.fillStyle = '#4e3620'; g.fillRect(W / 2 - 46, 186, 6, 26); g.fillRect(W / 2 + 40, 186, 6, 26);
  if ((inv.bread || 0) > 0) PX.blit(g, icon('bread'), W / 2 - 10, 138, 20);
  if ((inv.pie || 0) > 0) PX.blit(g, icon('pie'), W / 2 + 14, 138, 20);
  if ((inv.toy || 0) > 0) PX.blit(g, icon('toy'), 130, 214, 18);
  // door, bottom right
  g.fillStyle = '#2a1d13'; g.fillRect(W - 40, H - 70, 28, 70); g.fillStyle = '#e8d36a'; g.fillRect(W - 20, H - 36, 3, 3);
  if (ups.fence) { g.fillStyle = '#9b8b6a'; for (let x = 0; x < W; x += 14) g.fillRect(x, H - 6, 8, 6); }
  // people
  const spots = [[W / 2 - 90, 220], [W / 2 + 90, 220], [W / 2 - 30, 250], [W / 2 + 40, 250], [150, 130], [W / 2, 120]];
  inside.forEach((a, i) => person(g, a, spots[i % spots.length][0], spots[i % spots.length][1]));
  visitors.forEach((a, i) => { person(g, a, W - 26, H - 12 - i * 2, 40); });
  if (!inside.length) label(g, 'nobody home', W / 2, 236, '#a9a290', 12);
}

// The store: shelves of stock with prices, a counter, the till, and whoever is in.
export function drawStore(canvas, { store, here, project, projectProgress }) {
  const g = canvas.getContext('2d'); const W = canvas.width, H = canvas.height;
  g.imageSmoothingEnabled = false; g.clearRect(0, 0, W, H);
  wall(g, 0, 0, W, 190, '#4a3626');
  planks(g, 0, 190, W, H - 190);
  const stock = Object.entries(store.prices || {}).map(([k, pr]) => [k, store.shelf?.[k] || 0, pr]);
  const rows = [stock.slice(0, 8), stock.slice(8, 16), stock.slice(16, 24)];
  rows.forEach((row, r) => {
    const y = 12 + r * 58;
    g.fillStyle = '#5b3d22'; g.fillRect(12, y + 24, W - 24, 5);
    row.forEach(([k, n, pr], i) => {
      const gap = (W - 24) / 8, cx = 12 + gap * i + gap / 2;
      g.globalAlpha = n > 0 ? 1 : 0.35; PX.blit(g, icon(k), cx - 10, y + 2, 20); g.globalAlpha = 1;
      label(g, `${k} ×${n}`, cx, y + 40, n > 0 ? '#e8e2d0' : '#7a736a', 10);
      label(g, `${pr.buy}c · sells ${pr.sell}c`, cx, y + 51, '#a9a290', 9);
    });
  });
  // counter and till
  g.fillStyle = '#5b3d22'; g.fillRect(W / 2 - 120, 200, 240, 30); g.fillStyle = '#4e3620'; g.fillRect(W / 2 - 120, 230, 240, 8);
  g.fillStyle = '#2b2b2b'; g.fillRect(W / 2 + 60, 184, 44, 18); PX.blit(g, icon('coin'), W / 2 + 64, 186, 14);
  label(g, `${store.coin} coin in the till`, W / 2 + 82, 216, '#e8d36a', 10);
  if (project) { g.fillStyle = '#e8e2d0'; g.fillRect(W - 150, 8, 136, 40); label(g, `WANTED: ${project}`, W - 82, 24, '#2b2b2b', 11); label(g, projectProgress || 'a coin per material', W - 82, 40, '#4e3620', 9); }
  g.fillStyle = '#2a1d13'; g.fillRect(W - 40, H - 70, 28, 70);
  const spots = [[W / 2 - 70, 285], [W / 2 + 10, 290], [W / 2 + 80, 282], [W / 2 - 140, 292], [W / 2 + 150, 288]];
  here.forEach((a, i) => person(g, a, spots[i % spots.length][0], spots[i % spots.length][1]));
  if (!here.length) label(g, 'the store is empty; the shelf keeps its own count', W / 2, 280, '#a9a290', 12);
}
