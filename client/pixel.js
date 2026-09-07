// Pixel art for the village. Every sprite is drawn here as text, rendered once to a small
// canvas, then scaled with smoothing off. No image files, nothing downloaded.

const PAL = {
  '.': null,
  // grass and ground
  g: '#4f8a3c', G: '#447a34', h: '#5c9a45', d: '#8a6b45', D: '#6f5535', s: '#e8eef4', S: '#c9d5df', t: '#9b8b6a', T: '#857658',
  // wood, stone, roof
  w: '#7a5533', W: '#5b3d22', b: '#a8452f', B: '#7d3122', r: '#8d8d8d', R: '#5f5f5f', k: '#2b2b2b',
  // fire
  f: '#ffb03a', F: '#ff6a1a', y: '#fff1a8',
  // water
  a: '#3f6fa8', A: '#2b4f7e', l: '#8fb8e6',
  // plants
  p: '#2f6b2a', P: '#245c2e', e: '#c0304a', o: '#e8d36a',
  // clay
  c: '#9a4a2f',
  // people
  n: '#f1d7b5', N: '#d9b58c', m: '#e6d3b8', M: '#d9d2c7', i: '#9fb8d9',  // skin: normal, tan, elder, old, cold
  u: '#3a2f26', U: '#cfc6b8', v: '#1b1f27', q: '#5a2e2a', x: '#78aaeb',  // hair dark, hair grey, eye, mouth, tear
  j: '#4a5a7a', J: '#7a4a3a', z: '#5d7a4a', Z: '#7a5a8a',                // clothes
};

const cache = new Map();
function sprite(rows, key, pal = PAL) {
  const k = key || rows.join('|');
  if (cache.has(k)) return cache.get(k);
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const col = pal[rows[y][x]]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }
  cache.set(k, c);
  return c;
}

// ---------- ground ----------
const GRASS = [
  ['gggggggggggggggg', 'ggggggggggggghgg', 'gggggggggggggggg', 'ggggGggggggggggg', 'gggggggggggggggg', 'gggggggggggggggg', 'ggggggggghgggggg', 'gggggggggggggggg', 'gggggggggggggggg', 'ggGggggggggggggg', 'gggggggggggggggg', 'gggggggggggghggg', 'gggggggggggggggg', 'gggggggggggggggg', 'ggggggGggggggggg', 'gggggggggggggggg'],
  ['gggggggggggggggg', 'gggggggggggggggg', 'ggggghgggggggggg', 'gggggggggggggggg', 'gggggggggggGgggg', 'gggggggggggggggg', 'gggggggggggggggg', 'gghggggggggggggg', 'gggggggggggggggg', 'gggggggggggggggg', 'ggggggggGggggggg', 'gggggggggggggggg', 'gggggggggggggggg', 'gggggggggggghggg', 'gggggggggggggggg', 'gggggggggggggggg'],
  ['gggggggggggggggg', 'gggggggggggggggg', 'gggggggggggggggg', 'gggggggghggggggg', 'gggggggggggggggg', 'ggGggggggggggggg', 'gggggggggggggggg', 'gggggggggggggggg', 'gggggggggggggggg', 'gggggggggggggGgg', 'gggggggggggggggg', 'gggggggggggggggg', 'ggggghgggggggggg', 'gggggggggggggggg', 'gggggggggggggggg', 'gggggggggggggggg'],
];
const SEASON_PAL = {
  spring: { g: '#4f8a3c', G: '#447a34', h: '#6aa44e' },
  summer: { g: '#5a9440', G: '#4d8236', h: '#79b352' },
  autumn: { g: '#6f7a3a', G: '#5f6a30', h: '#8d8a44' },
  winter: { g: '#cfd8e0', G: '#bcc7d2', h: '#e6edf2' },
  dry:    { g: '#8a8a55', G: '#787848', h: '#a3a366' },
};
const groundCache = new Map();
export function groundLayer(map, season, harvest) {
  const key = `${season}-${harvest < 0.4 && season === 'summer'}`;
  if (groundCache.has(key)) return groundCache.get(key);
  const pal = { ...PAL, ...(season === 'summer' && harvest < 0.4 ? SEASON_PAL.dry : SEASON_PAL[season]) };
  const c = document.createElement('canvas'); c.width = map.w * 16; c.height = map.h * 16;
  const g = c.getContext('2d');
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const v = (x * 7 + y * 13 + (x * y) % 5) % 3;
    g.drawImage(sprite(GRASS[v], `grass-${key}-${v}`, pal), x * 16, y * 16);
  }
  groundCache.set(key, c);
  return c;
}

// ---------- places ----------
export const HOUSE = sprite([
  '......bb........', '.....bbbb.......', '....bbbbbb......', '...bbbbbbbb..kk.', '..bbbbbbbbbb.kk.', '.bbbbbbbbbbbbkk.', 'bBBBBBBBBBBBBBBb', '.wwwwwwwwwwwwww.', '.wwwwwWWwwwwwww.', '.wwwwwWWwwwwwww.', '.wwyywWWwwwyyww.', '.wwyywWWwwwyyww.', '.wwwwwWWwwwwwww.', '.wwwwwWWwwwwwww.', '.wwwwwWWwwwwwww.', 'DDDDDDDDDDDDDDDD',
], 'house');
export const TENT = sprite([
  '................', '.......t........', '......ttt.......', '.....ttttt......', '....tttTttt.....', '...ttttTtttt....', '..tttttTttttt...', '.ttttttTtttttt..', 'ttttttTkTtttttt.', 'tttttTkkkTttttt.', 'ttttTkkkkkTtttt.', 'tttTkkkkkkkTttt.', 'ttTkkkkkkkkkTtt.', 'tTkkkkkkkkkkkTt.', 'DDDDDDDDDDDDDDDD', '................',
], 'tent');
export const TENT_DARK = sprite([
  '................', '.......R........', '......RRR.......', '.....RRRRR......', '....RRRRRRR.....', '...RRRRRRRRR....', '..RRRRRRRRRRR...', '.RRRRRRRRRRRRR..', 'RRRRRRkkkRRRRRR.', 'RRRRRkkkkkRRRRR.', 'RRRRkkkkkkkRRRR.', 'RRRkkkkkkkkkRRR.', 'RRkkkkkkkkkkkRR.', 'RkkkkkkkkkkkkkR.', 'DDDDDDDDDDDDDDDD', '................',
], 'tent-dark');
export const HOUSE_DARK = sprite([
  '......RR........', '.....RRRR.......', '....RRRRRR......', '...RRRRRRRR.....', '..RRRRRRRRRR....', '.RRRRRRRRRRRR...', 'RkkkkkkkkkkkkkkR', '.WWWWWWWWWWWWWW.', '.WWWWWkkWWWWWWW.', '.WWWWWkkWWWWWWW.', '.WWWWWkkWWWWWWW.', '.WWWWWkkWWWWWWW.', '.WWWWWkkWWWWWWW.', '.WWWWWkkWWWWWWW.', '.WWWWWkkWWWWWWW.', 'DDDDDDDDDDDDDDDD',
], 'house-dark');
export const PINE = sprite([
  '.......PP.......', '......PPPP......', '.....PPpPPP.....', '.....PPPPPP.....', '....PPPpPPPP....', '...PPPPPPPPPP...', '...PPPpPPPPPP...', '..PPPPPPPPpPPP..', '.PPPPpPPPPPPPPP.', '.PPPPPPPPPpPPPP.', 'PPPpPPPPPPPPPPPP', '.......WW.......', '.......WW.......', '.......WW.......', '................', '................',
], 'pine');
export const PINE_SNOW = sprite([
  '.......ss.......', '......sPPs......', '.....sPPPPs.....', '.....PPPPPP.....', '....sPPPPPPs....', '...sPPPPPPPPs...', '...PPPPPPPPPP...', '..sPPPPPPPPPPs..', '.sPPPPPPPPPPPPs.', '.PPPPPPPPPPPPPP.', 'sPPPPPPPPPPPPPPs', '.......WW.......', '.......WW.......', '.......WW.......', '................', '................',
], 'pine-snow');
const FIRE = [
  ['................', '................', '................', '.......F........', '......FfF.......', '.....FfyfF......', '.....FfyfF......', '....FFfyfFF.....', '....FfyyyfF.....', '...RRRRRRRRR....', '..RRrRRRRrRRR...', '..RRRRRRRRRRR...', '...RRRRRRRRR....', '................', '................', '................'],
  ['................', '................', '........F.......', '.......Ff.......', '......FfyF......', '.....FfyfF......', '.....FfyyfF.....', '....FfyyyfF.....', '....FffyffF.....', '...RRRRRRRRR....', '..RRrRRRRrRRR...', '..RRRRRRRRRRR...', '...RRRRRRRRR....', '................', '................', '................'],
  ['................', '................', '................', '................', '......F.F.......', '.....FfyfF......', '.....FfyyfF.....', '....FFfyyfF.....', '....FfyyyfF.....', '...RRRRRRRRR....', '..RRrRRRRrRRR...', '..RRRRRRRRRRR...', '...RRRRRRRRR....', '................', '................', '................'],
].map((r, i) => sprite(r, `fire-${i}`));
export const FIRE_OUT = sprite([
  '................', '................', '................', '................', '................', '................', '.......kk.......', '......kkkk......', '.....kWkkWk.....', '...RRRRRRRRR....', '..RRrRRRRrRRR...', '..RRRRRRRRRRR...', '...RRRRRRRRR....', '................', '................', '................',
], 'fire-out');
export const fire = (t) => FIRE[Math.floor(t * 6) % 3];
export const WELL = sprite([
  '................', '......WWWW......', '.....W....W.....', '.....W....W.....', '....RRRRRRRR....', '...RRrRRRRrRR...', '...RaAAAAAAaR...', '...RAAllAAAAR...', '...RAAAAAAlAR...', '...RaAAAAAAaR...', '...RRRRRRRRRR...', '....RRrRRrRR....', '................', '................', '................', '................',
], 'well');
export const FIELD = sprite([
  'ddddddddddddddda', 'dododododododood', 'DDDDDDDDDDDDDDDD', 'dddddddddddddddd', 'odododododododod', 'DDDDDDDDDDDDDDDD', 'dddddddddddddddd', 'dododododododood', 'DDDDDDDDDDDDDDDD', 'dddddddddddddddd', 'odododododododod', 'DDDDDDDDDDDDDDDD', 'dddddddddddddddd', 'dododododododood', 'DDDDDDDDDDDDDDDD', 'dddddddddddddddd',
].map(r => r.replace(/a/g, 'd')), 'field');
export const FIELD_WINTER = sprite(Array(16).fill(0).map((_, y) => y % 3 === 2 ? 'TTTTTTTTTTTTTTTT' : 'SSSSSSSSSSSSSSSS'), 'field-winter');
export const MEADOW = sprite([
  'hhhhhhhhhhhhhhhh', 'hhhohhhhhhhehhhh', 'hhhhhhhhhhhhhhhh', 'hhhhhhhohhhhhhhh', 'hehhhhhhhhhhhohh', 'hhhhhhhhhhhhhhhh', 'hhhhhohhhhhhhhhh', 'hhhhhhhhhhehhhhh', 'hhhhhhhhhhhhhhhh', 'hhohhhhhhhhhhhhh', 'hhhhhhhhhhhhhohh', 'hhhhhhhehhhhhhhh', 'hhhhhhhhhhhhhhhh', 'hhhhohhhhhhhhhhh', 'hhhhhhhhhhhhhehh', 'hhhhhhhhhhhhhhhh',
], 'meadow');
export const ROCKS = sprite([
  '................', '................', '......RR........', '.....RrRR.......', '....RRRRRR..RR..', '...RRrRRRRR.RrR.', '...RRRRRRRRRRRR.', '..RRRRRrRRRRRRR.', '.RRrRRRRRRRrRRRR', '.RRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRR', '................', '................', '................', '................', '................',
], 'rocks');
export const ROAD = sprite(Array(16).fill(0).map((_, y) => y < 5 || y > 10 ? '................' : (y === 7 ? 'tttTtttttTttttTt' : 'tttttttttttttttt')), 'road');
export const WATER = [0, 1].map(i => sprite(Array(16).fill(0).map((_, y) => { const row = []; for (let x = 0; x < 16; x++) row.push(((x + y * 2 + i * 3) % 7 === 0) ? 'l' : ((x + y) % 5 === 0 ? 'A' : 'a')); return row.join(''); }), `water-${i}`));
export const GROVE = sprite([
  '....pppp..pppp..', '..pppPpppppPppp.', '.ppppppepppppppp', '.pppepppppppeppp', 'pppppppPppppppPp', 'pppppppppppppppp', '.ppeppppppppppp.', '..pppppppepppp..', '....ppp..ppp....', '.....WW..WW.....', '.....WW..WW.....', '................', '................', '................', '................', '................',
], 'grove');
export const CLAY = sprite([
  '................', '................', '....cccccccc....', '..cccccccccccc..', '.cccccccccclccc.', '.ccccccccclaacc.', '.cccccccccclccc.', '..cccccccccccc..', '....cccccccc....', '................', '................', '................', '................', '................', '................', '................',
], 'clay');
export const STORE = sprite([
  '................', '..bbbbbbbbbbbb..', '.bBbBbBbBbBbBbB.', '.wwwwwwwwwwwwww.', '.w............w.', '.w.ooo.ee.ooo.w.', '.w.ooo.ee.ooo.w.', '.wwwwwwwwwwwwww.', '.w.aa..ff..yy.w.', '.w.aa..ff..yy.w.', '.wwwwwwwwwwwwww.', '.w............w.', 'DDDDDDDDDDDDDDDD', '................', '................', '................',
], 'store');
export const GARDEN = sprite([
  '................', '................', '................', '................', 'DDDDDDDDDDDDDDDD', 'DpDpDpDpDpDpDpDD', 'DDDDDDDDDDDDDDDD', 'DpDeDpDpDeDpDpDD', 'DDDDDDDDDDDDDDDD', 'DpDpDpDoDpDpDpDD', 'DDDDDDDDDDDDDDDD', '................', '................', '................', '................', '................',
], 'garden');
export const BIGHOUSE = sprite([
  '.......bb.......', '.....bbbbbb.....', '...bbbbbbbbbb...', '.bbbbbbbbbbbbbkk', 'bBBBBBBBBBBBBBkk', 'wwwwwwwwwwwwwwww', 'wwyywwWWwwwwyyww', 'wwyywwWWwwwwyyww', 'wwwwwwWWwwwwwwww', 'wwyywwWWwwwwyyww', 'wwyywwWWwwwwyyww', 'wwwwwwWWwwwwwwww', 'wwwwwwWWwwwwwwww', 'DDDDDDDDDDDDDDDD', '................', '................',
], 'bighouse');
export const POOL = sprite([
  '................', '...RRRRRRRRRR...', '..RaaaaaaaaaaR..', '.RaaAaaaalaaaaR.', '.RaaaaaaaaaaaaR.', '.RalaaaAaaaaaaR.', '.RaaaaaaaaalaaR.', '.RaaaaaaaaaaaaR.', '..RaaaaaaaaaaR..', '...RRRRRRRRRR...', '................', '................', '................', '................', '................', '................',
], 'pool');
export const GRANARY = sprite([
  '.....wwwwww.....', '....wwwwwwww....', '...wwwwwwwwww...', '..wwwwwwwwwwww..', '.WWWWWWWWWWWWWW.', '.wwwwwwwwwwwwww.', '.wwwooowwwooo.w.', '.wwwooowwwooo.w.', '.wwwwwwwwwwwwww.', '.wwwwwwWWwwwwww.', '.wwwwwwWWwwwwww.', 'DDDDDDDDDDDDDDDD', '................', '................', '................', '................',
], 'granary');

// ---------- people ----------
// Body 8 wide, 12 tall: head 5 rows, body 5, legs 2. Two walk frames.
function personRows(skin, hair, cloth, expr, frame, child) {
  const s = skin, h = hair, c = cloth;
  // eyes and mouth by expression
  const eyes = expr === 'cry' ? `.${s}v${s}v${s}.` : expr === 'clench' ? `.${s}vvv${s}.` : `.${s}v${s}v${s}.`;
  const mouth = expr === 'smile' ? `..${s}q${s}q..`.replace(`${s}q${s}q`, `q${s}${s}q`) : expr === 'frown' || expr === 'clench' ? `..q${s}${s}q..`.replace(`q${s}${s}q`, `${s}qq${s}`) : expr === 'cry' ? `...qq...` : `...qq...`;
  const brow = expr === 'clench' || expr === 'frown' ? `.${h}${h}.${h}${h}..`.slice(0, 8) : `........`;
  const tears = expr === 'cry' ? `.x${s}${s}${s}x..` : `.${s}${s}${s}${s}${s}..`;
  const legs = frame === 0 ? ['..u..u..', '..u..u..'] : ['.u....u.', '.u....u.'];
  const head = [
    `..${h}${h}${h}${h}..`,
    `.${h}${s}${s}${s}${s}${h}.`,
    brow[0] === '.' && expr !== 'clench' && expr !== 'frown' ? `.${s}${s}${s}${s}${s}${s}.` : `.${h}${s}${h}${s}${h}${s}.`,
    eyes,
    tears,
    mouth,
  ];
  const body = child ? [`..${c}${c}${c}${c}..`, `.${s}${c}${c}${c}${c}${s}.`, `..${c}${c}${c}${c}..`] : [`..${c}${c}${c}${c}..`, `.${s}${c}${c}${c}${c}${s}.`, `.${s}${c}${c}${c}${c}${s}.`, `..${c}${c}${c}${c}..`, `..${c}${c}${c}${c}..`];
  return [...head, ...body, ...legs].map(r => r.padEnd(8, '.').slice(0, 8));
}
export function person(opts) {
  const { skin = 'n', hair = 'u', cloth = 'j', expr = 'neutral', frame = 0, child = false } = opts;
  return sprite(personRows(skin, hair, cloth, expr, frame, child), `p-${skin}${hair}${cloth}-${expr}-${frame}-${child ? 'c' : 'a'}`);
}
export function personLook(a) {
  const b = a.body;
  const old = (a.age ?? 40) >= 80, elder = (a.age ?? 40) >= 65;
  const skin = b.warmth < 0.35 ? 'i' : old ? 'M' : elder ? 'm' : (a.traits?.temper ?? 0.5) > 0.6 ? 'N' : 'n';
  const hair = elder ? 'U' : 'u';
  const cloth = a.settlement === 'camp' ? 'J' : ['j', 'z', 'Z', 'J'][(a.name || '').length % 4];
  let expr = 'neutral';
  if (b.overwhelmed > 0) expr = 'cry';
  else if (b.tightness > 0.65 || b.hurt > 0.6) expr = 'clench';
  else if (b.tightness > 0.4 || b.food < 0.25 || b.warmth < 0.3) expr = 'frown';
  else if (b.openness > 0.65 && b.tightness < 0.28) expr = 'smile';
  return { skin, hair, cloth, expr };
}

// ---------- drawing helpers ----------
export function blit(ctx, img, x, y, size) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(x), Math.round(y), Math.round(size), Math.round(size * img.height / img.width));
}
// snow overlay: a sparse pixel dither, pre-rendered once per intensity step
const snowCache = new Map();
export function snowLayer(map, amount) {
  const step = Math.round(amount * 4);
  if (!step) return null;
  if (snowCache.has(step)) return snowCache.get(step);
  const c = document.createElement('canvas'); c.width = map.w * 16; c.height = map.h * 16;
  const g = c.getContext('2d'); g.fillStyle = 'rgba(240,246,250,0.9)';
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (((x * 31 + y * 17 + (x ^ y)) % 23) < step) g.fillRect(x, y, 1, 1);
  snowCache.set(step, c);
  return c;
}
