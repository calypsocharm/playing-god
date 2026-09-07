// The world. Ordinary code runs the bodies, the weather, the wounds and the healing.
// Brains only decide. A brain is either a remote owner's browser (BYOK) or the
// scripted fallback so the village never freezes.

import { makeChart, rollBirth, transitsFor, pressure, traitsFrom, describeChart } from './chart.js';
import * as B from './body.js';
import { maybeWriteWound, processExposures, woundFeltSense, branch } from './wounds.js';
import * as W from './weather.js';
import { scriptedDecide, scriptedSummary } from './scripted.js';
import { ELEMENT } from './chart.js';
import * as I from './items.js';
import * as F from './family.js';
import * as G from './gifts.js';
import * as A from './animals.js';

export const TICKS_PER_DAY = 6;
export const TICK_NAMES = ['dawn', 'morning', 'midday', 'afternoon', 'evening', 'night'];
const DAY_MS = 86400000;

export const MAP = { w: 72, h: 36 };   // x 0..39, y 0..23 is the village's land. The rest is the pale: unmapped until someone walks it.
// The map is known in cells of 2x2 tiles. A string of '0'/'1', row-major. Everyone sees what anyone has walked.
export const CELL = 2;
const COLS = Math.ceil(MAP.w / CELL), ROWS = Math.ceil(MAP.h / CELL);
export function ensureExplored(w) {
  if (typeof w.explored === 'string' && w.explored.length === COLS * ROWS) return w.explored;
  let s = '';
  for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) s += (cx * CELL < 41 && cy * CELL < 24) ? '1' : '0';
  w.explored = s; return s;
}
export function isExploredAt(w, x, y) { ensureExplored(w); const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return true; return w.explored[cy * COLS + cx] === '1'; }
export function reveal(w, x, y, r = 3) {
  ensureExplored(w);
  const arr = w.explored.split('');
  for (let cy = Math.max(0, Math.floor((y - r) / CELL)); cy <= Math.min(ROWS - 1, Math.floor((y + r) / CELL)); cy++)
    for (let cx = Math.max(0, Math.floor((x - r) / CELL)); cx <= Math.min(COLS - 1, Math.floor((x + r) / CELL)); cx++) {
      const mx = cx * CELL + CELL / 2, my = cy * CELL + CELL / 2;
      if (Math.hypot(mx - x, my - y) <= r + 0.7) arr[cy * COLS + cx] = '1';
    }
  w.explored = arr.join('');
}
export function exploredFraction(w) { ensureExplored(w); let n = 0; for (const ch of w.explored) if (ch === '1') n++; return n / w.explored.length; }
// The nearest unmapped cell to a point, with a little wander so two explorers do not walk the same line.
function nearestUnexplored(w, p) {
  ensureExplored(w);
  let best = null, bd = Infinity;
  for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
    if (w.explored[cy * COLS + cx] === '1') continue;
    const mx = cx * CELL + CELL / 2, my = cy * CELL + CELL / 2;
    const d = Math.hypot(mx - p.x, my - p.y) + rnd(0, 5);
    if (d < bd) { bd = d; best = { x: mx, y: my }; }
  }
  return best;
}
export const PLACES = {
  hearth: { x: 20, y: 12, label: 'the hearth', sheltered: false },
  well:   { x: 26, y: 13, label: 'the well',   sheltered: false },
  field:  { x: 8,  y: 18, label: 'the field',  sheltered: false },
  forest: { x: 34, y: 5,  label: 'the forest', sheltered: false },
  meadow: { x: 8,  y: 5,  label: 'the meadow', sheltered: false },
  quarry: { x: 35, y: 20, label: 'the quarry', sheltered: false },
  road:   { x: 2,  y: 12, label: 'the road',   sheltered: false },
  camp:   { x: 47, y: 12, label: 'the camp',   sheltered: false },   // a second fire past the edge, if anyone ever leaves to light one
  store:  { x: 24, y: 16, label: 'the store',  sheltered: false },   // the village's shared shelf, by the well
};
const CAMP_SPOTS = [{ x: 44, y: 8 }, { x: 50, y: 8 }, { x: 44, y: 16 }, { x: 50, y: 16 }, { x: 47, y: 6 }, { x: 47, y: 18 }, { x: 52, y: 12 }, { x: 43, y: 12 }, { x: 51, y: 4 }, { x: 51, y: 20 }];
export { CAMP_SPOTS };

// The edge of the known world, where scouts walk out from.
PLACES.edge = { x: 39, y: 12, label: 'the edge', sheltered: false };
export const isFound = (w, key) => !!(w.found && w.found[key]);
// Places the viewer may draw: the fixed ones plus whatever scouts have found.
function visiblePlaces(w) {
  const out = {};
  for (const [k, p] of Object.entries(PLACES)) if (!I.FRONTIER.some(f => f.key === k) || isFound(w, k)) out[k] = p;
  return out;
}
// Restore found places onto the map after a load.
export function restoreFound(w) {
  for (const f of I.FRONTIER) if (isFound(w, f.key)) PLACES[f.key] = PLACES[f.key] || { x: f.x, y: f.y, label: f.label, sheltered: false };
}

// Which fire is yours.
export const fireOf = (w, a) => (a.settlement === 'camp' && w.camp?.founded) ? 'camp' : 'hearth';
const fireStore = (w, a) => fireOf(w, a) === 'camp' ? w.camp : w.hearth;
export const HOME_SPOTS = [
  { x: 14, y: 7 }, { x: 20, y: 5 }, { x: 26, y: 7 }, { x: 14, y: 17 }, { x: 26, y: 18 }, { x: 20, y: 20 },
  { x: 9, y: 10 }, { x: 31, y: 11 }, { x: 9, y: 4 }, { x: 31, y: 19 }, { x: 4, y: 20 }, { x: 36, y: 15 },
  { x: 15, y: 2 }, { x: 25, y: 2 }, { x: 4, y: 7 }, { x: 36, y: 21 }, { x: 15, y: 22 }, { x: 30, y: 22 },
  { x: 4, y: 15 }, { x: 37, y: 9 }, { x: 20, y: 9 }, { x: 20, y: 15 }, { x: 10, y: 14 }, { x: 30, y: 15 },
];
const NAMES = ['Wren', 'Ash', 'Marlow', 'Ilse', 'Tam', 'Oren', 'Bea', 'Corin', 'Sable', 'Juno', 'Pell', 'Rook',
  'Mira', 'Dov', 'Hale', 'Nell', 'Sorrel', 'Kit', 'Ada', 'Bram'];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const uid = () => Math.random().toString(36).slice(2, 10);

export function createWorld(saved) {
  if (saved) {
    // Villagers born before charts shaped bodies, or before there were things to own, catch up here.
    for (const a of saved.agents) {
      if (!a.traits && a.chart) a.traits = traitsFrom(a.chart);
      if (!a.inv) { a.inv = I.newInventory(); a.inv.food = a.food ?? 1; delete a.food; }
      if (!a.wants) a.wants = I.WANTS_BY_ELEMENT[ELEMENT[a.chart.venus]] || 'charm';
      a.diary = a.diary || []; a.notes = a.notes || [];
      if (a.ageAtArrival == null) a.ageAtArrival = (saved.startMs + a.bornDay * DAY_MS - a.birthMs) / (365.25 * DAY_MS);
    }
    saved.builds = saved.builds || {};
    saved.camp = saved.camp || { founded: false, name: '', wood: 0, leader: null, day: null };
    saved.god = saved.god || newGod();
    saved.goals = saved.goals || {};
    saved.prayers = saved.prayers || [];
    saved.chronicle = saved.chronicle || [];
    for (const a of saved.agents) if (a.faith == null) a.faith = 0;
    for (const a of saved.agents) { for (const m of I.MATERIALS) if (a.inv && a.inv[m] == null) a.inv[m] = 0; for (const k of Object.keys(I.ITEMS)) if (a.inv && a.inv[k] == null) a.inv[k] = 0; }
    saved.found = saved.found || {};
    restoreFound(saved);
    ensureExplored(saved); A.ensure(saved);
    if (saved.store?.shelf && saved.store.shelf.hen == null) { saved.store.shelf.hen = 3; saved.store.shelf.goat = 1; }
    if (saved.camp?.founded) reveal(saved, PLACES.camp.x, PLACES.camp.y, 8);
    for (const k of Object.keys(saved.found)) if (PLACES[k]) reveal(saved, PLACES[k].x, PLACES[k].y, 5);
    // Camps used to sit inside the village's own land. Move an old camp out past the edge.
    if (saved.camp?.founded) {
      const campers = saved.agents.filter(a => a.settlement === 'camp' && a.home && a.home.x < 41);
      if (campers.length) {
        const spots = [...CAMP_SPOTS]; const moved = new Map();
        for (const p of campers) {
          const key = `${p.home.x},${p.home.y}`;
          const spot = moved.get(key) || spots.shift() || { x: 42 + Math.floor(Math.random() * 11), y: 3 + Math.floor(Math.random() * 18) };
          moved.set(key, spot); p.home = { ...spot };
          if (p.location === 'home' || p.location === 'camp') p.pos = { ...spot };
        }
      }
    }
    saved.chapters = saved.chapters || [];
    backfillChapters(saved);
    saved.store = saved.store || I.newStore();
    saved.mod = saved.mod || { bannedIps: {}, bannedTokens: {}, muted: {} };
    saved.store.loans = saved.store.loans || {}; saved.store.project = saved.store.project ?? null; saved.store.wagesPaid = saved.store.wagesPaid || 0;
    if (saved.store.coin < 120 && !saved.store.funded) { saved.store.coin += 200; saved.store.funded = true; }
    for (const a of saved.agents) { if (a.inv && a.inv.coin == null) a.inv.coin = 3; a.upgrades = a.upgrades || {}; }
    return saved;
  }
  const w = {
    id: uid(),
    startMs: Date.now(),
    day: 0,
    tick: 0,
    paused: false,
    weather: W.newWeather(),
    hearth: { wood: 6 },
    camp: { founded: false, name: '', wood: 0, leader: null, day: null },
    god: newGod(),
    store: I.newStore(),
    mod: { bannedIps: {}, bannedTokens: {}, muted: {} },
    goals: {},           // question key -> { done: day }
    prayers: [],         // what the villagers ask of the sky
    chronicle: [],       // one paragraph a night, in the village's voice
    builds: {},          // granary, hall: { have: {wood:n,...}, done: bool, builders: {agentId: n} }
    agents: [],
    events: [],          // recent, for the viewer
    log: [],             // everything, for the record
  };
  seedVillage(w);
  return w;
}

export const simDate = (w, day = w.day) => w.startMs + day * DAY_MS;

// ---------- the weather's attention ----------
// A god who can do anything every tick has nothing to decide. Attention is scarce and refills
// with the seasons. Where you spend it is what becomes real.
export const GOD_COSTS = { weather: 2, traveler: 3, nudge: 1, wood: 1, destiny: 2, fulfil: 0, omen: 1, gift: 3, sense: 3, pause: 0, resume: 0 };

// A gift wakes. `how` is a phrase: 'in the quiet at the creek', 'when the sky touched you'.
// A sense opens. Always on from then; the body pays for it every day.
export function openSense(w, a, kind, how) {
  if (a.sense || !G.SENSES[kind]) return a.sense;
  a.sense = { kind, day: w.day };
  remember(w, a, `Something opened in you ${how}. ${G.SENSES[kind].felt}`, 1);
  event(w, `${a.name} has started to ${kind === 'clairaudient' ? 'hear things others do not' : kind === 'empath' ? 'feel what others feel' : kind === 'clairvoyant' ? 'see tomorrow before it comes' : 'know things no one told them'}.`, 'wonder', [a.id]);
  return a.sense;
}
function wakeSenses(w) {
  for (const a of alive(w)) { if (a.sense) continue; const k = G.senseReady(a); if (k) openSense(w, a, k, `through ${G.SENSES[k].wakes.split(':')[0]}`); }
}
export function awaken(w, a, how) {
  if (a.gift) return a.gift;
  const kind = G.giftFor(a.chart);
  a.gift = { kind, day: w.day, uses: 0 };
  a.skills = a.skills || {}; a.skills.gift = 0;
  remember(w, a, `Something woke in you ${how}. ${G.GIFTS[kind].felt} You do not have a word for it yet.`, 1);
  event(w, `Something woke in ${a.name} ${how}. They cannot say what.`, 'wonder', [a.id]);
  for (const o of sameSpot(w, a)) if (o !== a) remember(w, o, `Something happened to ${a.name} today. They look at their hands differently.`, 0.6);
  return a.gift;
}
// Omens: the sky says something without doing anything. Everyone sees it; what it means is theirs.
export const OMENS = {
  redsky: 'The sky went red at dusk and stayed red a long time.',
  bird: 'A white bird sat on the well all morning and would not be moved.',
  frost: 'Frost on the field in the middle of summer, gone by noon.',
  ring: 'A ring around the moon, wide as a cart wheel.',
  hush: 'The wind stopped completely. Even the trees held still.',
  star: 'A star fell slowly across the whole sky, west to east.',
  smoke: 'The hearth smoke rose straight up and then bent toward the forest.',
  eclipse: 'The sun went dark at midday. Birds stopped. It came back, slowly, and nobody spoke for a while.',
};
function newGod() { return { attention: 6, max: 8, acts: [], name: 'the Sky', named: null }; }

// What the village calls the sky, from what it has felt and how often the sky has moved.
function nameTheSky(w) {
  const living = alive(w);
  const avg = living.reduce((s, a) => s + (a.faith || 0), 0) / Math.max(1, living.length);
  const span = w.weather.daysPerSeason * 2;
  const recent = w.god.acts.filter(x => x.day > w.day - span);
  const dials = recent.filter(x => x.op === 'weather').length;
  let name = 'the Sky';
  if (!recent.length && w.day > span) name = 'the Absent One';
  else if (dials >= 6) name = 'the Fickle One';
  else if (avg > 0.25) name = 'the Kind One';
  else if (avg < -0.25) name = 'the Cold One';
  else if (recent.length >= 4) name = 'the Watchful One';
  if (name !== w.god.name) {
    w.god.name = name; w.god.named = w.day;
    event(w, `The village has begun to call the sky ${name}.`, 'god');
    for (const a of living) remember(w, a, `People have started calling the sky ${name}.`, 0.5);
  }
}

// Each night the body's day becomes an opinion of the sky.
function faithNightly(w) {
  const season = W.seasonOf(w.day, w.weather);
  for (const a of alive(w)) {
    let d = 0;
    if (a.body.food < 0.3) d -= 0.02;
    if (a.body.warmth < 0.3) d -= 0.03;
    if (season === 'summer' && w.weather.harvest > 0.6 && a.body.food > 0.6) d += 0.015;
    if ((a.grief || []).some(g => w.day - g.day < 3)) d -= 0.08;
    if (a.body.openness > 0.7 && a.body.tightness < 0.25) d += 0.01;
    a.faith = B.clamp((a.faith || 0) * 0.995 + d, -1, 1);
  }
  nameTheSky(w);
}

export function pray(w, a, text) {
  const t = String(text || '').slice(0, 200) || (a.body.food < 0.3 ? 'Let the field give.' : a.body.warmth < 0.3 ? 'Let the cold ease.' : 'Watch over us.');
  w.prayers.push({ day: w.day, from: a.id, name: a.name, text: t, faith: +(a.faith || 0).toFixed(2) });
  if (w.prayers.length > 200) w.prayers.shift();
  event(w, `${a.name} speaks to the sky: "${t}"`, 'pray', [a.id]);
  remember(w, a, `You asked the sky: "${t}"`, 0.4);
  a.lastSaid = t;
}

// ---------- questions the village can answer ----------
export const GOALS = {
  firstCouple:     'Two people choose to stay together',
  firstChild:      'A child is born in the village',
  raisedWarm:      'A child comes of age raised in a warm house',
  healedLineage:   'Someone raised in a cold house heals',
  granary:         'The granary stands',
  hall:            'The hall stands',
  quietWinter:     'A whole winter passes with no one dying',
  oldAndMourned:   'Someone dies old, and at least three people grieve them',
  camp:            'A second fire is lit past the edge',
  mapped:          'Half the land is walked and known',
  tenYears:        'The village sees its tenth year',
  namedKind:       'The village calls the sky the Kind One',
  frontier:        'A scout comes back from past the edge with news of new land',
  bread:           'Someone breaks bread with another',
};
function checkGoals(w) {
  const done = (k, why) => { if (!w.goals[k]) { w.goals[k] = { done: w.day, why }; event(w, `A question answered: ${GOALS[k]}.`, 'healed'); } };
  const living = alive(w);
  if (living.some(a => a.partner)) done('firstCouple');
  if (w.agents.some(a => a.parents?.length)) done('firstChild');
  if (w.agents.some(a => a.parents?.length && a.upbringing === 'warm' && a.comeOfAgeDay != null)) done('raisedWarm');
  if (w.agents.some(a => a.upbringing === 'cold' && a.scars.length && !a.wounds.length)) done('healedLineage');
  if (exploredFraction(w) >= 0.5) done('mapped');
  if (w.builds.granary?.done) done('granary');
  if (w.builds.hall?.done) done('hall');
  if (w.camp.founded) done('camp');
  if (w.day >= yearDays(w) * 9) done('tenYears');
  if (w.god.name === 'the Kind One') done('namedKind');
  if (w.log.some(e => /breaks bread with/.test(e.text))) done('bread');
  // Winter bookkeeping.
  const season = W.seasonOf(w.day, w.weather);
  if (season === 'winter') { if (w.winterDeaths == null) w.winterDeaths = 0; }
  else if (w.winterDeaths != null) { if (w.winterDeaths === 0 && w.day > w.weather.daysPerSeason * 4) done('quietWinter'); w.winterDeaths = null; }
}

// ---------- the chronicle ----------
// Everything that mattered today, as plain facts, for whoever tells the story (scripted or a model).
export function dayDigest(w, day = w.day) {
  const today = w.log.filter(e => e.day === day && e.kind !== 'night' && e.kind !== 'talk');
  const d = W.describe(day, w.weather);
  const living = alive(w);
  const talk = w.log.filter(e => e.day === day && e.kind === 'talk').slice(-6).map(e => e.text);
  const diaries = w.agents.filter(a => a.brain === 'remote').map(a => a.diary.find(x => x.day === day)).filter(Boolean).map(x => `${w.agents.find(a => a.diary.includes(x)).name} wrote: "${x.text.slice(0, 200)}"`);
  return {
    day, year: Math.floor(day / yearDays(w)) + 1, season: d.season, sky: d.sky, alive: living.length,
    facts: today.map(e => e.text),
    talk,
    diaries: diaries.slice(0, 3),
    skyName: w.god.name,
    couples: living.filter(a => a.partner).length / 2, children: living.filter(a => F.isChild(w, a)).length,
    prev: w.chronicle.slice(-2).map(c => c.text),
  };
}

// The scripted teller. Subject-first sentences, the weather as a frame, people by name.
function chronicleNight(w) {
  const today = w.log.filter(e => e.day === w.day);
  const pick1 = (kind) => today.filter(e => e.kind === kind);
  const d = W.describe(w.day, w.weather);
  const first = (t) => t.replace(/\.\s.*$/, '.');
  const parts = [];
  const deaths = pick1('death'); for (const e of deaths) parts.push(e.text);
  const wakes = today.filter(e => /keep the wake/.test(e.text)); if (wakes.length) parts.push(wakes[0].text.replace(' keep the wake for ', ' sat the night through for '));
  const births = today.filter(e => /is born to/.test(e.text)); for (const e of births) parts.push(e.text);
  const expecting = today.filter(e => /are expecting/.test(e.text)); for (const e of expecting) parts.push(e.text);
  const bonds = today.filter(e => /are together now/.test(e.text)); for (const e of bonds) parts.push(first(e.text));
  const asks = today.filter(e => /pulls back/.test(e.text)); for (const e of asks) parts.push(e.text);
  const leaves = today.filter(e => /leaves the village|^\w+ leaves \w+\.$/.test(e.text)); for (const e of leaves) parts.push(e.text);
  const found = today.filter(e => /comes back from past the edge/.test(e.text)); for (const e of found) parts.push(e.text);
  const healed = today.filter(e => /has healed|has grieved|has come of age|come to pass|is finished/.test(e.text)); for (const e of healed) parts.push(first(e.text));
  const wounds = pick1('wound'); for (const e of wounds.slice(0, 2)) parts.push(e.text);
  const strikes = pick1('strike').filter(e => /strikes|takes/.test(e.text)); for (const e of strikes.slice(0, 2)) parts.push(e.text);
  const overwhelmed = pick1('overwhelmed'); if (overwhelmed.length) parts.push(overwhelmed.length === 1 ? overwhelmed[0].text : `${[...new Set(overwhelmed.map(e => e.text.split(' ')[0]))].join(' and ')} were overwhelmed today.`);
  const comforts = pick1('comfort').filter(e => /comforts/.test(e.text));
  if (comforts.length) { const pairs = [...new Set(comforts.map(e => e.text.replace('.', '')))].slice(0, 2); parts.push(pairs.join('. ') + (comforts.length > 2 ? `. Others did the same.` : '.')); }
  const bread = today.filter(e => /breaks bread/.test(e.text)); if (bread.length) parts.push(bread[0].text);
  const prayers = pick1('pray'); if (prayers.length) parts.push(prayers.length === 1 ? prayers[0].text : `${prayers.length} people spoke to the sky, asking for ${/cold/.test(prayers.map(p => p.text).join()) ? 'warmth' : 'food'} mostly.`);
  const godActs = pick1('god').filter(e => !/call the sky/.test(e.text)); for (const e of godActs) parts.push(e.text);
  const named = pick1('god').filter(e => /call the sky/.test(e.text)); for (const e of named) parts.push(e.text);
  const builds = pick1('build').length; if (builds >= 3 && !healed.some(e => /finished/.test(e.text))) parts.push('Work went on at the hearth.');
  const crafts = pick1('craft'); if (crafts.length >= 2) parts.push(`${[...new Set(crafts.map(e => e.text.split(' ')[0]))].slice(0, 3).join(', ')} made things.`);
  const seasonStart = pick1('season').find(e => /begins/.test(e.text));
  const frame = seasonStart ? `${d.season[0].toUpperCase() + d.season.slice(1)} came in ${d.sky.replace(/^a /, '')}.` : `${d.season[0].toUpperCase() + d.season.slice(1)}, ${d.sky}.`;
  const text = parts.length ? `${frame} ${parts.join(' ')}` : `${frame} A quiet day. People worked and ate and went home.`;
  w.chronicle.push({ day: w.day, text, alive: alive(w).length, sky: w.god.name, by: 'scripted' });
  if (w.chronicle.length > 400) w.chronicle.shift();
  chapterNight(w);
}

// A model's telling replaces the scripted one for that night.
export function setChronicle(w, day, text) {
  const c = w.chronicle.find(x => x.day === day);
  if (!c || !text) return false;
  c.text = String(text).trim().slice(0, 1200); c.by = 'told';
  return true;
}

// Chapters: one per season, titled by what mattered most in it.
function chapterNight(w) { titleChapter(w, Math.floor(w.day / w.weather.daysPerSeason), w.day); }

// Seasons that passed before chapters existed get their titles from whatever the log still holds.
export function backfillChapters(w) {
  const yd = w.weather.daysPerSeason;
  const cur = Math.floor(w.day / yd);
  const oldest = w.log.length ? Math.floor(w.log[0].day / yd) : cur;
  for (let i = oldest; i <= cur; i++) titleChapter(w, i, Math.min(w.day, i * yd + yd - 1));
}

function titleChapter(w, seasonIdx, upToDay) {
  w.chapters = w.chapters || [];
  const yd = w.weather.daysPerSeason;
  let ch = w.chapters.find(c => c.index === seasonIdx);
  if (!ch) {
    ch = { index: seasonIdx, season: W.seasonOf(seasonIdx * yd, w.weather), year: Math.floor((seasonIdx * yd) / yearDays(w)) + 1, startDay: seasonIdx * yd, endDay: seasonIdx * yd + yd - 1, title: '' };
    w.chapters.push(ch);
    w.chapters.sort((a, b) => a.index - b.index);
    if (w.chapters.length > 120) w.chapters.shift();
  }
  // Retitle as the season goes: the biggest thing so far names it.
  const span = w.log.filter(e => e.day >= ch.startDay && e.day <= upToDay);
  const t = (re) => span.find(e => re.test(e.text));
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  let title = null;
  let e;
  if ((e = t(/has died of (hunger|the cold|injuries)/))) title = `The ${ch.season} ${e.text.split(' ')[0]} died`;
  else if ((e = t(/leaves the village (for the forest edge|and walks out past the edge)/))) title = `The ${ch.season} ${e.text.split(' ')[0]} left`;
  else if ((e = t(/is born to/))) title = `The ${ch.season} of ${e.text.match(/name them (\w+)/)?.[1] || 'the child'}`;
  else if ((e = t(/has died in their sleep/))) title = `The ${ch.season} ${e.text.split(' ')[0]} slept`;
  else if ((e = t(/comes back from past the edge/))) title = `The ${ch.season} of ${e.text.match(/call it (the \w+)/)?.[1] || 'new land'}`;
  else if ((e = t(/are together now/))) title = `The ${ch.season} ${e.text.match(/^(\w+) and (\w+)/)?.[1]} and ${e.text.match(/^(\w+) and (\w+)/)?.[2]} shared a roof`;
  else if ((e = t(/is finished/))) title = `The ${ch.season} the ${e.text.match(/The (\w+) is finished/)?.[1]} stood`;
  else if ((e = t(/has come of age/))) title = `The ${ch.season} ${e.text.split(' ')[0]} grew up`;
  else if ((e = t(/has healed\./))) title = `The ${ch.season} ${e.text.split(' ')[0]} healed`;
  else if ((e = t(/call the sky/))) title = `The ${ch.season} they named the sky`;
  else if ((e = t(/destiny is spoken/))) title = `The ${ch.season} ${e.text.match(/over (\w+)/)?.[1]} was marked`;
  else if (w.god.acts.some(x => x.day >= ch.startDay && x.day <= upToDay)) title = `A ${ch.season} the sky moved`;
  else title = `An ordinary ${ch.season}`;
  ch.title = cap(title);
}

// ---------- age ----------
// A village year is four seasons. People arrive at the age their chart says and age on the village clock.
export const MAX_AGE = 130;
export const yearDays = (w) => 4 * w.weather.daysPerSeason;
export function ageOf(w, a) {
  const arrival = a.ageAtArrival ?? (simDate(w, a.bornDay) - a.birthMs) / (365.25 * DAY_MS);
  return arrival + (w.day - a.bornDay) / yearDays(w);
}
export function stageOf(age) {
  if (age < 16) return 'child';
  if (age < 30) return 'young';
  if (age < 60) return 'grown';
  if (age < 80) return 'elder';
  if (age < 105) return 'old';
  return 'ancient';
}
// Daily chance of dying of age. Nothing before 60, steep after 100, certain at MAX_AGE.
function ageMortality(age) {
  if (age >= MAX_AGE) return 1;
  if (age < 60) return 0;
  return Math.pow((age - 60) / (MAX_AGE - 60), 3) * 0.03;
}
export function ageFelt(age) {
  if (age >= 105) return ['You are very old. Everything is slow now, and the cold goes straight to the bone.'];
  if (age >= 80) return ['You are old. You tire fast and the cold finds you first.'];
  if (age >= 65) return ['Your body is not what it was. You feel the weather in your joints.'];
  if (age < 22) return ['You are young. Your body forgives almost anything.'];
  return [];
}

// ---------- agents ----------

export function newAgent(w, opts = {}) {
  const usedNames = new Set(w.agents.map(a => a.name));
  const name = opts.name || NAMES.find(n => !usedNames.has(n)) || `Stranger-${uid().slice(0, 3)}`;
  const upbringing = opts.upbringing || pick(['warm', 'cold', 'inconsistent']);
  const birthMs = opts.birthMs || rollBirth(simDate(w));
  const usedHomes = new Set(w.agents.filter(a => a.alive).map(a => `${a.home.x},${a.home.y}`));
  const home = HOME_SPOTS.find(h => !usedHomes.has(`${h.x},${h.y}`)) || { x: 4 + Math.floor(rnd(0, 32)), y: 2 };
  const a = {
    id: uid(),
    name,
    birthMs,
    chart: makeChart(birthMs),
    upbringing,
    home,
    pos: { ...home },
    location: 'home',
    body: B.newBody(),
    wounds: [],
    scars: [],
    trust: {},
    inv: I.newInventory(),
    wants: null,          // one thing this person longs for, set from Venus
    memories: [],
    diary: [],            // one entry a night, in their own words. Fed back to them each morning.
    notes: [],            // margin notes from whoever watches over them. Read once, then kept.
    selfSummary: '',
    thought: '',
    lastSaid: '',
    alive: true,
    bornDay: w.day,
    brain: opts.brain || 'scripted',
    owner: null,        // claim token of the browser that owns this brain
    connected: false,
    autopilot: false,   // remote brain missed its turn, scripted stood in
    transits: [],
    exposures: {},
    lastHitBy: null,
    record: { hash: null, minted: null },  // for the NFT later: content hash of the life
  };
  a.traits = traitsFrom(a.chart);
  a.ageAtArrival = (simDate(w) - a.birthMs) / (365.25 * DAY_MS);
  a.wants = I.WANTS_BY_ELEMENT[ELEMENT[a.chart.venus]] || 'charm';
  applyUpbringing(a, w.day);
  // The chart tilts the starting body. A lean, not a script.
  a.body.openness = B.clamp(a.body.openness + (a.traits.need - 0.5) * 0.25);
  a.body.tightness = B.clamp(a.body.tightness + (a.traits.guard - 0.5) * 0.25);
  a.baseTrust = (a.baseTrust || 0) + (0.5 - a.traits.guard) * 0.15;
  a.transits = transitsFor(a.chart, simDate(w));
  a.selfSummary = scriptedSummary(a);
  w.agents.push(a);
  remember(w, a, `You arrived in the village. You were raised ${upbringing === 'warm' ? 'in a warm house' : upbringing === 'cold' ? 'in a cold house' : 'in a house that changed with the weather'}.`, 0.8);
  return a;
}

function applyUpbringing(a, day) {
  if (a.upbringing === 'warm') {
    a.body.openness = 0.78;
    a.baseTrust = 0.15;
  } else if (a.upbringing === 'cold') {
    a.body.openness = 0.35;
    a.body.tightness = 0.45;
    a.baseTrust = -0.1;
    // A cold house teaches one of two lessons: stay away, or hit first.
    const hitFirst = Math.random() < 0.5;
    a.wounds.push(hitFirst
      ? { id: -1, trigger: 'weakness', belief: 'weakness gets punished', strength: 0.6, from: 'childhood', kind: 'struck', day: day - 1, lastDay: day - 1, contradictions: 0, reinforced: 0 }
      : { id: -1, trigger: 'closeness', belief: 'closeness leads to pain', strength: 0.55, from: 'childhood', kind: 'betrayed', day: day - 1, lastDay: day - 1, contradictions: 0, reinforced: 0 });
  } else {
    a.body.openness = 0.55;
    a.body.tightness = 0.3;
    a.baseTrust = 0;
    a.wounds.push({ id: -2, trigger: 'asking', belief: 'needing someone means being left', strength: 0.45, from: 'childhood', kind: 'abandoned', day: day - 1, lastDay: day - 1, contradictions: 0, reinforced: 0 });
  }
}

function seedVillage(w) {
  // One steady, one wounded, and four rolled.
  newAgent(w, { upbringing: 'warm' });
  newAgent(w, { upbringing: 'cold' });
  for (let i = 0; i < 4; i++) newAgent(w);
}

export const alive = (w) => w.agents.filter(a => a.alive);
export const byId = (w, id) => w.agents.find(a => a.id === id);

export function trustOf(a, other) {
  return a.trust[other.id] ?? (a.baseTrust || 0);
}
export function bumpTrust(a, other, d) {
  const t = trustOf(a, other);
  // Trust is easy to build from nothing and hard to complete. Distrust comes fast at any level.
  const eased = d > 0 ? d * (1 - Math.max(0, t)) : d;
  a.trust[other.id] = B.clamp(t + eased, -1, 1);
}

export function remember(w, a, text, weight = 0.4) {
  a.memories.push({ day: w.day, tick: w.tick, text, weight });
  if (a.memories.length > 80) a.memories.splice(0, a.memories.length - 80);
}

export function event(w, text, kind = 'info', who = []) {
  const e = { day: w.day, tick: w.tick, text, kind, who };
  w.events.push(e);
  w.log.push(e);
  if (w.events.length > 60) w.events.shift();
  if (w.log.length > 5000) w.log.splice(0, 1000);
  return e;
}

const at = (w, loc) => alive(w).filter(a => a.location === loc);
// Who is close enough to touch. At home you are alone unless someone is at your door.
export function sameSpot(w, a) {
  const living = alive(w);
  // At home you are with whoever shares your roof, and anyone at the door.
  if (a.location === 'home') return living.filter(o => o !== a && (o.location === `visit:${a.id}` || (o.location === 'home' && o.home.x === a.home.x && o.home.y === a.home.y)));
  if (a.location.startsWith('visit:')) {
    const hostId = a.location.slice(6);
    return living.filter(o => o !== a && ((o.id === hostId && o.location === 'home') || o.location === a.location));
  }
  return living.filter(o => o !== a && o.location === a.location);
}

// ---------- hurting ----------

export function emotionalEvent(w, victim, kind, by, severity) {
  const trustBefore = by ? trustOf(victim, by) : 0;
  const scaled = severity * pressure(victim.transits) * (0.7 + Math.max(0, trustBefore) * 0.6);
  B.emotionalHit(victim.body, scaled);
  victim.lastHitBy = by ? by.id : null;
  victim.exposures.painToday = true;
  const rule = maybeWriteWound(victim, { kind, by: by ? by.name : 'the world', trustBefore, severity: scaled, day: w.day });
  if (rule) event(w, `${victim.name}'s body wrote a rule: "${rule.belief}".`, 'wound', [victim.id]);
  if (victim.body.overwhelmed > 0) event(w, `${victim.name} is overwhelmed. Crying, can't breathe.`, 'overwhelmed', [victim.id]);
}

// ---------- the tick ----------

export function step(w, remoteActions) {
  const isNight = w.tick === TICKS_PER_DAY - 1;
  if (isNight) nightPhase(w);
  else dayPhase(w, remoteActions);
  w.tick = (w.tick + 1) % TICKS_PER_DAY;
  if (w.tick === 0) newDay(w);
}

function dayPhase(w, remoteActions) {
  const living = alive(w);
  const cold = W.coldToday(w.day, w.weather);

  // 1. decisions
  const decisions = new Map();
  for (const a of living) {
    if (a.body.overwhelmed > 0) { decisions.set(a.id, { type: 'rest' }); continue; }
    // Children are not asked. They do what children do.
    if (F.isChild(w, a)) { decisions.set(a.id, F.childDecide(w, a)); continue; }
    let act = remoteActions.get(a.id);
    a.autopilot = false;
    if (!act) {
      act = scriptedDecide(a, snapshotFor(a, w));
      if (a.brain === 'remote') a.autopilot = true;
    }
    decisions.set(a.id, act);
  }

  // 2. movement. Everyone arrives this tick; the viewer animates it.
  for (const a of living) {
    const act = decisions.get(a.id);
    let dest = act.to;
    if (act.type === 'withdraw' || act.type === 'rest') dest = 'home';
    if (act.type === 'work') dest = act.to === 'forest' ? 'forest' : 'field';
    if (act.type === 'forage') dest = (I.FORAGE[act.to] && (PLACES[act.to] || isFound(w, act.to))) ? act.to : 'meadow';
    if (act.type === 'scout') dest = null;   // explorers move themselves, into the pale
    if (act.type === 'build') dest = I.BUILDS[act.what]?.at || 'hearth';
    if (act.type === 'buy' || act.type === 'sell' || act.type === 'borrow' || act.type === 'repay') dest = 'store';
    if (act.type === 'upgrade') dest = 'home';
    if (act.type === 'craft') dest = null;   // you make things where you stand
    if (act.type === 'sit') dest = act.to && (PLACES[act.to] || act.to === 'home') ? act.to : null;
    if (act.type === 'walk') dest = act.to && PLACES[act.to] ? act.to : (isFound(w, 'creek') ? 'creek' : 'meadow');
    if (act.type === 'sing') dest = 'hearth';
    if (act.type === 'hobby') dest = 'home';
    if (act.type === 'hunt') dest = act.to === 'meadow' ? 'meadow' : 'forest';
    if (act.type === 'adopt' || act.type === 'pet') dest = null;
    // People who are going to a place move first; people going to a person follow afterwards,
    // so you end up where they went, not where they were.
    if (dest && !byId(w, dest)) moveTo(w, a, dest);
    else if (dest) a.followDest = dest;
  }
  for (const a of living) { if (a.followDest) { moveTo(w, a, a.followDest); a.followDest = null; } }

  // 2b. what anyone walks, everyone knows. The map grows under their feet.
  for (const a of living) reveal(w, a.pos.x, a.pos.y, a.location.startsWith('wild:') ? 3.5 : 2);
  A.tick(w, w.agents, PLACES, sameSpot, remember, event);

  // 3. interactions
  for (const a of living) {
    const act = decisions.get(a.id);
    a.thought = act.thought || '';
    const target = act.target ? byId(w, act.target) : null;
    const near = sameSpot(w, a);
    const tgt = target && target.alive && near.includes(target) ? target : null;

    switch (act.type) {
      case 'work': {
        if (a.location === 'field') {
          let y = W.fieldYield(w.day, w.weather);
          if (a.inv.hoe > 0) { y *= 1.5; if (I.wear(a, 'hoe')) { event(w, `${a.name}'s hoe breaks.`, 'info', [a.id]); remember(w, a, 'Your hoe broke.', 0.4); } }
          if (w.builds.granary?.done) y *= 1.25;
          if ((w.blessedField || 0) >= w.day) y *= 1.5;
          a.inv.food += y; a.body.energy = B.clamp(a.body.energy - 0.08);
          if (y < 0.1) remember(w, a, 'You worked the field and it gave almost nothing.', 0.5);
        } else if (a.location === 'forest') {
          let n = 2;
          if (a.inv.axe > 0) { n = 4; if (I.wear(a, 'axe')) { event(w, `${a.name}'s axe breaks.`, 'info', [a.id]); remember(w, a, 'Your axe broke.', 0.4); } }
          fireStore(w, a).wood += n; a.body.energy = B.clamp(a.body.energy - 0.08);
        }
        break;
      }
      case 'scout': {
        // Exploring. Walk toward land no one has mapped; the map grows under your feet. Tiring, cold.
        // Reach a place worth naming and the village learns of it.
        if (!a.explore || isExploredAt(w, a.explore.x, a.explore.y)) a.explore = nearestUnexplored(w, a.pos);
        if (!a.explore) { remember(w, a, 'There is nothing left out there you have not seen. The whole land is walked.', 0.4); a.location = 'edge'; a.pos = { ...PLACES.edge }; break; }
        const dx = a.explore.x - a.pos.x, dy = a.explore.y - a.pos.y, dist = Math.hypot(dx, dy);
        const stepLen = Math.min(dist, a.body.energy > 0.5 ? 4 : 2.5);
        a.pos = { x: a.pos.x + (dist ? dx / dist : 0) * stepLen, y: a.pos.y + (dist ? dy / dist : 0) * stepLen };
        a.location = `wild:${Math.round(a.pos.x)},${Math.round(a.pos.y)}`;
        a.body.energy = B.clamp(a.body.energy - 0.07);
        a.body.warmth = B.clamp(a.body.warmth - 0.03 - 0.05 * (w.weather.cold || 0));
        reveal(w, a.pos.x, a.pos.y, 3.5);
        a.scouted = (a.scouted || 0) + 1;
        const found = I.FRONTIER.find(f => !isFound(w, f.key) && Math.hypot(f.x - a.pos.x, f.y - a.pos.y) <= 6);
        if (found) {
          w.found = w.found || {};
          w.found[found.key] = { day: w.day, by: a.id };
          PLACES[found.key] = PLACES[found.key] || { x: found.x, y: found.y, label: found.label, sheltered: false };
          reveal(w, found.x, found.y, 5);
          event(w, `${a.name}, exploring, finds ${found.found}. They call it ${found.label}.`, 'healed', [a.id]);
          remember(w, a, `You found ${found.label}: ${found.found}. You were the first.`, 1);
          for (const o of alive(w)) if (o !== a) { remember(w, o, `${a.name} found ${found.label} out in the pale. There is more out there than we knew.`, 0.7); bumpTrust(o, a, 0.06); }
          a.body.tightness = B.clamp(a.body.tightness - 0.15);
          a.explore = null;
          if (!w.goals.frontier) { w.goals.frontier = { done: w.day }; event(w, `A question answered: ${GOALS.frontier}.`, 'healed'); }
        } else if (dist - stepLen <= 1) {
          remember(w, a, `You walked out where no one had been. ${pick(['Grass, wind, and the same sky.', 'Stones and a dead tree. Nothing to eat.', 'You could see the village smoke from there, small.', 'A hollow full of birds that did not know to be afraid of you.'])} You know a little more of the land.`, 0.4);
          a.explore = null;
        }
        break;
      }
      case 'forage': {
        const table = I.FORAGE[a.location];
        if (table) {
          const season = W.seasonOf(w.day, w.weather);
          const mult = season === 'winter' ? 0.35 : season === 'spring' ? 0.8 : 1;
          const got = [];
          for (const [m, n] of Object.entries(table)) {
            let amt = n * mult;
            if (m === 'wood' && a.inv.axe > 0) { amt *= 2; if (I.wear(a, 'axe')) event(w, `${a.name}'s axe breaks.`, 'info', [a.id]); }
            if (m === 'berries' && season === 'winter') amt = 0;
            amt = Math.round(amt);
            if (amt > 0) { a.inv[m] += amt; got.push(`${amt} ${m}`); }
          }
          a.body.energy = B.clamp(a.body.energy - (w.builds.road?.done ? 0.045 : 0.07));
          if (got.length) remember(w, a, `You foraged ${got.join(' and ')} at ${PLACES[a.location].label}.`, 0.25);
          else remember(w, a, `${PLACES[a.location].label} gave nothing today.`, 0.3);
          if (a.inv.berries >= 2 && a.body.food < 0.7) { a.inv.berries -= 2; B.eat(a.body, 0.15); }
          // Fish is food. A pot cooks it into more.
          if (a.inv.fish >= 1) { const n = Math.floor(a.inv.fish); a.inv.fish -= n; a.inv.food += n * (a.inv.pot > 0 ? 0.35 : 0.25); }
        }
        break;
      }
      case 'craft': {
        const item = act.item;
        if (item && I.craft(a.inv, item)) {
          event(w, `${a.name} makes a ${I.ITEMS[item].label}.`, 'craft', [a.id]);
          remember(w, a, `You made a ${I.ITEMS[item].label} with your own hands.`, item === a.wants ? 0.8 : 0.4);
          if (item === a.wants) B.soothe(a.body, 0.15);
        } else remember(w, a, `You tried to make a ${I.ITEMS[item]?.label || 'thing'} and lacked the materials.`, 0.2);
        break;
      }
      case 'give': {
        const item = act.item;
        if (tgt && item && (a.inv[item] || 0) >= 1 && I.ITEMS[item]) {
          a.inv[item] -= 1; tgt.inv[item] = (tgt.inv[item] || 0) + 1;
          const wanted = tgt.wants === item;
          const val = I.ITEMS[item].value;
          if (item === 'toy' && F.isChild(w, tgt)) { B.gladden(tgt.body, 0.3); remember(w, tgt, `${a.name} carved you a toy. You will keep it always.`, 1); tgt.tended = tgt.tended || {}; tgt.tended[a.id] = (tgt.tended[a.id] || 0) + 3; }
          if (item === 'quilt') { B.gladden(tgt.body, 0.15); remember(w, tgt, `${a.name} made you a quilt with their own hands.`, 0.9); }
          bumpTrust(tgt, a, 0.08 + val * 0.04 + (wanted ? 0.2 : 0)); bumpTrust(a, tgt, 0.05);
          tgt.exposures.closeness = true; tgt.exposures.asking = true;
          if (wanted) B.soothe(tgt.body, 0.3);
          event(w, `${a.name} gives ${tgt.name} a ${I.ITEMS[item].label}${wanted ? '. It is the thing they wanted most.' : '.'}`, 'share', [a.id, tgt.id]);
          remember(w, tgt, wanted ? `${a.name} gave you the ${I.ITEMS[item].label} you had been longing for.` : `${a.name} gave you a ${I.ITEMS[item].label}.`, wanted ? 1 : 0.6);
          remember(w, a, `You gave ${tgt.name} a ${I.ITEMS[item].label}.`, 0.4);
        }
        break;
      }
      case 'trade': {
        // Barter. You offer what you carry for what they carry. They weigh it: is it fair, do they
        // need what they'd give up, do they trust you. A bad deal accepted is remembered as one.
        const give = act.give, want = act.want, n = Math.max(1, Math.floor(act.n || 1)), m = Math.max(1, Math.floor(act.m || 1));
        if (!tgt || !give || !want) break;
        const val = (item) => I.STORE_PRICES[item] ?? I.ITEMS[item]?.value ?? 1;
        const haveGive = Math.floor(a.inv[give] || 0) >= n, haveWant = Math.floor(tgt.inv[want] || 0) >= m;
        if (!haveGive) { remember(w, a, `You offered ${tgt.name} ${n} ${give} you did not have.`, 0.2); break; }
        if (!haveWant) { event(w, `${a.name} offers ${tgt.name} ${n} ${give} for ${m} ${want}. ${tgt.name} has none to spare.`, 'trade', [a.id, tgt.id]); break; }
        const fairness = (val(give) * n) / Math.max(0.5, val(want) * m);   // >1 favours them
        const needsIt = (want === 'food' && tgt.body.food < 0.5) || (want === 'blanket' && W.seasonOf(w.day, w.weather) === 'winter') || (tgt.wants === want && (tgt.inv[want] || 0) <= m);
        const t = trustOf(tgt, a);
        const accepts = !needsIt && t > -0.2 && (fairness >= 0.8 || (fairness >= 0.5 && t > 0.5));
        if (accepts) {
          a.inv[give] -= n; tgt.inv[give] = (tgt.inv[give] || 0) + n;
          tgt.inv[want] -= m; a.inv[want] = (a.inv[want] || 0) + m;
          bumpTrust(a, tgt, 0.05); bumpTrust(tgt, a, fairness >= 1 ? 0.06 : 0.02);
          a.exposures.closeness = true; tgt.exposures.closeness = true;
          event(w, `${a.name} trades ${n} ${give} to ${tgt.name} for ${m} ${want}.`, 'trade', [a.id, tgt.id]);
          remember(w, a, `You traded ${n} ${give} to ${tgt.name} for ${m} ${want}.`, 0.4);
          remember(w, tgt, fairness < 0.7 ? `You let ${a.name} have ${m} ${want} for ${n} ${give}. You got the worse of it, and you know it.` : `${a.name} traded you ${n} ${give} for ${m} ${want}. Fair enough.`, fairness < 0.7 ? 0.6 : 0.4);
          if (fairness < 0.6) bumpTrust(tgt, a, -0.06);   // a sharp deal costs you later
          if (a.wants === want) B.soothe(a.body, 0.15);
        } else {
          event(w, `${a.name} offers ${tgt.name} ${n} ${give} for ${m} ${want}. ${tgt.name} says no.`, 'trade', [a.id, tgt.id]);
          remember(w, a, `${tgt.name} would not trade ${want} for your ${give}.${fairness < 0.8 ? ' It was not a fair offer.' : ''}`, 0.3);
          remember(w, tgt, `${a.name} wanted your ${want} for ${give}. You kept it.`, 0.3);
        }
        break;
      }
      case 'buy': {
        const item = act.item, n = Math.max(1, Math.min(5, Math.floor(act.n || 1)));
        if (A.PRICES[item] && a.location === 'store') {
          const p = I.buyPrice(w.store, item);
          if ((w.store.shelf[item] || 0) >= 1 && (a.inv.coin || 0) >= p) {
            a.inv.coin -= p; w.store.coin += p; w.store.shelf[item] -= 1;
            const an = A.newAnimal(w, item, { owner: a.id, location: 'home', pos: { ...a.home }, name: typeof act.call === 'string' ? act.call.slice(0, 16) : undefined });
            w.store.ledger.push({ day: w.day, who: a.name, bought: item, n: 1, coin: p }); if (w.store.ledger.length > 200) w.store.ledger.shift();
            event(w, `${a.name} buys a ${item} for ${p} coin and walks it home. They call it ${an.name}.`, 'trade', [a.id]);
            remember(w, a, `You bought a ${item} and called it ${an.name}. It is yours to feed now.`, 0.7);
            B.gladden(a.body, 0.12);
          } else remember(w, a, (w.store.shelf[item] || 0) < 1 ? `The store had no ${item} today.` : `You could not afford a ${item} (${p} coin).`, 0.3);
          break;
        }
        const price = I.buyPrice(w.store, item);
        if (price == null || a.location !== 'store') break;
        const can = Math.min(n, Math.floor(w.store.shelf[item] || 0), Math.floor((a.inv.coin || 0) / price));
        if (can >= 1) {
          a.inv.coin -= can * price; w.store.coin += can * price; w.store.shelf[item] -= can; a.inv[item] = (a.inv[item] || 0) + can;
          w.store.ledger.push({ day: w.day, who: a.name, bought: item, n: can, coin: can * price }); if (w.store.ledger.length > 200) w.store.ledger.shift();
          event(w, `${a.name} buys ${can} ${item} for ${can * price} coin.`, 'trade', [a.id]);
          remember(w, a, `You bought ${can} ${item} for ${can * price} coin.`, 0.3);
        } else remember(w, a, (w.store.shelf[item] || 0) < 1 ? `The store had no ${item}.` : `You could not afford ${item} (${price} coin each).`, 0.3);
        break;
      }
      case 'borrow': {
        // A loan from the store. Up to 20 owed at once, a tenth added each season, paid back a little each night you can.
        const n = Math.max(1, Math.min(20, Math.floor(act.n || 5)));
        const owed = w.store.loans[a.id]?.owed || 0;
        if (a.location !== 'store') break;
        if (w.store.loans[a.id]?.defaulted) { remember(w, a, 'The store will not lend to you. You did not pay last time.', 0.5); break; }
        const room = Math.min(n, 20 - owed, w.store.coin);
        if (room >= 1) {
          w.store.coin -= room; a.inv.coin = (a.inv.coin || 0) + room;
          w.store.loans[a.id] = { owed: owed + room, since: w.store.loans[a.id]?.since ?? w.day, name: a.name };
          event(w, `${a.name} borrows ${room} coin from the store.`, 'trade', [a.id]);
          remember(w, a, `You borrowed ${room} coin. You owe the store ${owed + room}.`, 0.5);
        } else remember(w, a, owed >= 20 ? 'You already owe the store all it will lend.' : 'The store had nothing to lend.', 0.4);
        break;
      }
      case 'repay': {
        const loan = w.store.loans[a.id];
        if (!loan || a.location !== 'store') break;
        const n = Math.min(Math.floor(a.inv.coin || 0), loan.owed, Math.max(1, Math.floor(act.n || loan.owed)));
        if (n >= 1) {
          a.inv.coin -= n; w.store.coin += n; loan.owed -= n;
          event(w, `${a.name} pays ${n} coin back to the store.`, 'trade', [a.id]);
          remember(w, a, loan.owed <= 0 ? 'You paid the store off. Nothing hangs over you.' : `You paid ${n} back. You still owe ${loan.owed}.`, 0.5);
          if (loan.owed <= 0) { delete w.store.loans[a.id]; B.soothe(a.body, 0.1); }
        }
        break;
      }
      case 'sell': {
        const item = act.item, n = Math.max(1, Math.min(10, Math.floor(act.n || 1)));
        const price = I.sellPrice(w.store, item);
        if (price == null || a.location !== 'store') break;
        // The store keeps a float of 10 so it can always pay a wage or two.
        const can = Math.min(n, Math.floor(a.inv[item] || 0), price > 0 ? Math.floor(Math.max(0, w.store.coin - 10) / price) : 0);
        if (can >= 1 && price > 0) {
          a.inv[item] -= can; a.inv.coin = (a.inv.coin || 0) + can * price; w.store.coin -= can * price; w.store.shelf[item] = (w.store.shelf[item] || 0) + can;
          w.store.ledger.push({ day: w.day, who: a.name, sold: item, n: can, coin: can * price }); if (w.store.ledger.length > 200) w.store.ledger.shift();
          event(w, `${a.name} sells ${can} ${item} for ${can * price} coin.`, 'trade', [a.id]);
          remember(w, a, `You sold ${can} ${item} for ${can * price} coin.`, 0.3);
        } else remember(w, a, price === 0 ? `The store is full of ${item}; it pays nothing for more.` : `The store could not pay for your ${item}.`, 0.3);
        break;
      }
      case 'upgrade': {
        const what = I.UPGRADES[act.what] ? act.what : null;
        a.upgrades = a.upgrades || {};
        if (what && a.location === 'home' && !a.upgrades[what]) {
          const cost = I.UPGRADES[what].cost;
          if (Object.entries(cost).every(([m, n]) => (a.inv[m] || 0) >= n)) {
            for (const [m, n] of Object.entries(cost)) a.inv[m] -= n;
            a.upgrades[what] = w.day;
            // A shared roof shares the upgrade.
            if (a.partner) { const o = byId(w, a.partner); if (o) { o.upgrades = o.upgrades || {}; o.upgrades[what] = w.day; } }
            event(w, `${a.name} builds a ${I.UPGRADES[what].label} at home. ${I.UPGRADES[what].effect}.`, 'build', [a.id]);
            remember(w, a, `You built a ${I.UPGRADES[what].label}. It is yours.`, 0.8);
            B.soothe(a.body, 0.15);
          } else remember(w, a, `You wanted to build a ${I.UPGRADES[what].label} and lacked what it takes: ${Object.entries(cost).map(([m, n]) => `${n} ${m}`).join(', ')}.`, 0.3);
        }
        break;
      }
      case 'build': {
        const what = act.what && I.BUILDS[act.what] ? act.what : null;
        if (what && a.location === (I.BUILDS[what].at || 'hearth')) {
          const b = w.builds[what] = w.builds[what] || { have: {}, done: false, builders: {} };
          if (!b.done) {
            const put = [];
            for (const [m, need] of Object.entries(I.BUILDS[what].cost)) {
              const room = need - (b.have[m] || 0);
              const give = Math.min(room, Math.floor(a.inv[m] || 0), 3);
              if (give > 0) { a.inv[m] -= give; b.have[m] = (b.have[m] || 0) + give; put.push(`${give} ${m}`); }
            }
            if (put.length) {
              b.builders[a.id] = (b.builders[a.id] || 0) + 1;
              // The store pays for work on the village's projects, a coin a material, while it can.
              const units = put.reduce((sum, p) => sum + Number(p.split(' ')[0]), 0);
              const wage = Math.min(units, Math.max(0, w.store.coin - 20));
              if (wage > 0) { w.store.coin -= wage; a.inv.coin = (a.inv.coin || 0) + wage; w.store.wagesPaid = (w.store.wagesPaid || 0) + wage; remember(w, a, `The store paid you ${wage} coin for your work on the ${what}.`, 0.4); }
              a.body.energy = B.clamp(a.body.energy - 0.08);
              event(w, `${a.name} puts ${put.join(', ')} into the ${what}.`, 'build', [a.id]);
              remember(w, a, `You worked on the ${what}.`, 0.3);
              // Building together builds trust between the builders.
              for (const o of near) if (b.builders[o.id]) { bumpTrust(a, o, 0.04); bumpTrust(o, a, 0.04); }
              if (Object.entries(I.BUILDS[what].cost).every(([m, n]) => (b.have[m] || 0) >= n)) {
                b.done = true; b.day = w.day;
                event(w, `The ${what} is finished. ${I.BUILDS[what].effect}.`, 'healed', Object.keys(b.builders));
                for (const id of Object.keys(b.builders)) { const o = byId(w, id); if (o) remember(w, o, `The ${what} you helped raise is finished.`, 0.8); }
              }
            } else remember(w, a, `You went to build the ${what} but had nothing it needs.`, 0.2);
          }
        }
        break;
      }
      case 'take': {
        const item = act.item;
        if (tgt && item && (tgt.inv[item] || 0) >= 1) {
          tgt.inv[item] -= 1; a.inv[item] = (a.inv[item] || 0) + 1;
          const trustBefore = trustOf(tgt, a);
          const wanted = tgt.wants === item;
          event(w, `${a.name} takes ${tgt.name}'s ${I.ITEMS[item]?.label || item}.`, 'strike', [a.id, tgt.id]);
          emotionalEvent(w, tgt, trustBefore > 0.4 ? 'betrayed' : 'struck', a, (wanted ? 0.6 : 0.35) + (I.ITEMS[item]?.value || 1) * 0.04);
          bumpTrust(tgt, a, -0.4);
          remember(w, tgt, `${a.name} took your ${I.ITEMS[item]?.label || item}${wanted ? '. It was the thing you loved.' : '.'}`, 0.9);
          remember(w, a, `You took ${tgt.name}'s ${I.ITEMS[item]?.label || item}.`, 0.6);
          for (const o of near) if (o !== tgt) { bumpTrust(o, a, -0.12); remember(w, o, `You saw ${a.name} take from ${tgt.name}.`, 0.5); }
        }
        break;
      }
      case 'talk': {
        if (tgt) {
          a.lastSaid = (act.say || '').slice(0, 200);
          if (a.lastSaid) event(w, `${a.name} to ${tgt.name}: "${a.lastSaid}"`, 'talk', [a.id, tgt.id]);
          if (rebuffs(tgt, a)) {
            event(w, `${tgt.name} turns away from ${a.name}.`, 'rebuff', [a.id, tgt.id]);
            emotionalEvent(w, a, 'rebuffed', tgt, 0.3);
            bumpTrust(a, tgt, -0.05);
            remember(w, a, `You spoke to ${tgt.name} and they turned away.`, 0.6);
          } else {
            const long = !!act.long;
            bumpTrust(a, tgt, long ? 0.1 : 0.04); bumpTrust(tgt, a, long ? 0.1 : 0.04);
            a.exposures.closeness = true; tgt.exposures.closeness = true;
            if (long) { a.skills = a.skills || {}; a.skills.listening = (a.skills.listening || 0) + 1; B.gladden(a.body, 0.08); B.gladden(tgt.body, 0.08); for (const g of [...(a.grief || []), ...(tgt.grief || [])]) { g.shared += 1; g.sharedToday = (g.sharedToday || 0) + 1; } }
            remember(w, tgt, `${a.name} ${long ? 'talked with you a long time' : 'talked with you'}${a.lastSaid ? `: "${a.lastSaid}"` : ''}.`, long ? 0.5 : 0.3);
            if (long) remember(w, a, `You and ${tgt.name} talked a long time.`, 0.5);
            // Two grievers talking is grief shared, whatever the words were.
            if (a.grief?.length && tgt.grief?.length) for (const g of [...a.grief, ...tgt.grief]) { g.sharedToday = (g.sharedToday || 0) + 1; g.shared += 1; }
          }
        }
        break;
      }
      case 'share': {
        // A pie shared is a small feast; both are gladdened and everyone near notices.
        if (tgt && (a.inv.pie || 0) >= 1) {
          a.inv.pie -= 1; B.eat(tgt.body, 0.4); B.eat(a.body, 0.3); B.gladden(a.body, 0.12); B.gladden(tgt.body, 0.15);
          bumpTrust(tgt, a, 0.2); bumpTrust(a, tgt, 0.08);
          for (const o of near) if (o !== tgt) { B.gladden(o.body, 0.04); }
          event(w, `${a.name} shares a pie with ${tgt.name}.`, 'share', [a.id, tgt.id]);
          remember(w, tgt, `${a.name} shared a pie with you. A good afternoon.`, 0.8); remember(w, a, `You shared your pie with ${tgt.name}.`, 0.5);
          break;
        }
        // Breaking bread counts for more than handing over a portion.
        if (tgt && a.inv.bread >= 1) {
          a.inv.bread -= 1; B.eat(tgt.body, 0.45); B.eat(a.body, 0.15);
          bumpTrust(tgt, a, 0.18); bumpTrust(a, tgt, 0.08);
          tgt.exposures.asking = true; tgt.exposures.closeness = true; a.exposures.closeness = true;
          event(w, `${a.name} breaks bread with ${tgt.name}.`, 'share', [a.id, tgt.id]);
          remember(w, tgt, `${a.name} broke bread with you.`, 0.8);
          remember(w, a, `You broke bread with ${tgt.name}.`, 0.5);
        } else if (tgt && a.inv.food >= 0.3) {
          a.inv.food -= 0.3; B.eat(tgt.body, 0.3);
          bumpTrust(tgt, a, 0.12); bumpTrust(a, tgt, 0.04);
          tgt.exposures.asking = true; tgt.exposures.closeness = true;
          event(w, `${a.name} shares food with ${tgt.name}.`, 'share', [a.id, tgt.id]);
          remember(w, tgt, `${a.name} gave you food when you needed it.`, 0.7);
          remember(w, a, `You shared food with ${tgt.name}.`, 0.4);
        }
        break;
      }
      case 'comfort': {
        if (tgt) {
          if (rebuffs(tgt, a)) {
            event(w, `${a.name} reaches for ${tgt.name}. ${tgt.name} pulls away.`, 'rebuff', [a.id, tgt.id]);
            emotionalEvent(w, a, 'rebuffed', tgt, 0.3);
            tgt.exposures.closeness = true;   // they were approached; the day will tell if pain followed
            remember(w, tgt, `${a.name} reached for you and you pulled away.`, 0.5);
          } else {
            const scar = a.scars.length ? 0.1 : 0;
            B.soothe(tgt.body, 0.3 + scar + Math.max(0, trustOf(tgt, a)) * 0.2);
            bumpTrust(tgt, a, 0.15); bumpTrust(a, tgt, 0.05);
            tgt.exposures.closeness = true; tgt.exposures.weakness = true; a.exposures.closeness = true;
            event(w, `${a.name} comforts ${tgt.name}.`, 'comfort', [a.id, tgt.id]);
            for (const g of tgt.grief || []) { g.sharedToday = (g.sharedToday || 0) + 1; g.shared += 1; }
            remember(w, tgt, `${a.name} stayed with you while it was bad. It helped.`, 0.8);
            remember(w, a, `You comforted ${tgt.name}.`, 0.5);
            a.skills = a.skills || {}; a.skills.listening = (a.skills.listening || 0) + 1;
            if (a.sense?.kind === 'empath') { B.soothe(tgt.body, 0.25); const r = tgt.wounds.slice().sort((x, y) => y.strength - x.strength)[0]; if (r) { r.strength = Math.max(0, r.strength - 0.05); r.contradictions += 1; } remember(w, tgt, `${a.name} seemed to feel it with you. You were not alone in it.`, 0.7); }
          }
        }
        break;
      }
      case 'strike': {
        if (tgt) {
          const trustBefore = trustOf(tgt, a);
          B.physicalHit(tgt.body, 0.3);
          event(w, `${a.name} strikes ${tgt.name}.`, 'strike', [a.id, tgt.id]);
          emotionalEvent(w, tgt, trustBefore > 0.4 ? 'betrayed' : 'struck', a, trustBefore > 0.4 ? 0.7 : 0.55);
          bumpTrust(tgt, a, -0.5);
          remember(w, tgt, `${a.name} struck you.`, 1);
          remember(w, a, `You struck ${tgt.name}.`, 0.7);
          for (const o of near) if (o !== tgt) { bumpTrust(o, a, -0.15); remember(w, o, `You saw ${a.name} strike ${tgt.name}.`, 0.6); }
          a.body.tightness = B.clamp(a.body.tightness - 0.1); // it discharges, for a moment
        }
        break;
      }
      case 'bond': {
        if (tgt) F.propose(w, a, tgt);
        break;
      }
      case 'leave': {
        if (a.partner) F.leave(w, a);
        break;
      }
      case 'split': {
        splitOff(w, a, 'chose');
        break;
      }
      case 'pray': {
        pray(w, a, act.say);
        break;
      }
      case 'tend': {
        // Feed and hold a child in front of you. Anyone may; parents bond by it.
        if (tgt && F.isChild(w, tgt)) {
          if (a.inv.food >= 0.3 && tgt.body.food < 0.8) { a.inv.food -= 0.3; B.eat(tgt.body, 0.3); }
          B.soothe(tgt.body, 0.25);
          a.attach = a.attach || {}; tgt.tended = tgt.tended || {};
          a.attach[tgt.id] = (a.attach[tgt.id] || 0) + 1; tgt.tended[a.id] = (tgt.tended[a.id] || 0) + 1;
          bumpTrust(tgt, a, 0.08); tgt.exposures.asking = true; tgt.exposures.closeness = true; a.exposures.closeness = true;
          event(w, `${a.name} tends to ${tgt.name}.`, 'comfort', [a.id, tgt.id]);
          remember(w, tgt, `${a.name} looked after you.`, 0.6);
        }
        break;
      }
      case 'cast': {
        const g = a.gift && G.GIFTS[a.gift.kind];
        if (!g) { remember(w, a, 'You reached for something that is not in you. Nothing came.', 0.4); break; }
        a.castsToday = (a.castsToday || 0) + 1;
        if (a.body.energy < 0.3 || a.castsToday > 2) {
          a.body.hurt = B.clamp(a.body.hurt + 0.08); a.body.energy = B.clamp(a.body.energy - 0.2); a.body.overwhelmed = Math.max(a.body.overwhelmed, 1);
          remember(w, a, 'You reached for it and it took more than you had. You are on your knees, and it burns.', 0.8);
          event(w, `${a.name} reaches for their gift and collapses.`, 'wound', [a.id]);
          break;
        }
        a.body.energy = B.clamp(a.body.energy - 0.3); a.body.breath = B.clamp(a.body.breath - 0.15);
        a.gift.uses += 1; a.skills.gift = (a.skills.gift || 0) + 1;
        const power = 1 + Math.min(1, a.gift.uses * 0.1);
        let text = '';
        switch (a.gift.kind) {
          case 'kindling': {
            if (tgt) { tgt.body.warmth = B.clamp(tgt.body.warmth + 0.5); B.soothe(tgt.body, 0.1); bumpTrust(tgt, a, 0.08); remember(w, tgt, `${a.name} held your hands and the cold left you. Their palms were hot as coals.`, 0.9); text = `${a.name} holds ${tgt.name}'s hands and the cold leaves them.`; }
            else { const fire = fireStore(w, a); fire.wood = (fire.wood || 0) + Math.round(4 * power); for (const o of near) o.body.warmth = B.clamp(o.body.warmth + 0.25); text = `${a.name} kneels at the fire and it rises without wood. For a moment it burns blue.`; }
            break;
          }
          case 'seeing': {
            if (!tgt) { text = `${a.name} looks into the well water a long time and sees nothing they can say.`; remember(w, a, 'You looked into the water for someone and found only your own face.', 0.4); break; }
            const r = tgt.wounds.slice().sort((x, y) => y.strength - x.strength)[0];
            if (r) {
              remember(w, a, `You saw into ${tgt.name}. Their body believes: ${r.belief}. It was written on day ${r.day}${r.from ? ' by ' + (byId(w, r.from)?.name || 'someone') : ''}.`, 1);
              r.strength = Math.max(0, r.strength - 0.15 * power); r.contradictions += 1; tgt.exposures[r.trigger] = true;
              B.soothe(tgt.body, 0.15); bumpTrust(tgt, a, 0.1);
              remember(w, tgt, `${a.name} looked at you and you felt seen through, and it did not hurt.`, 0.9);
              text = `${a.name} looks at ${tgt.name} and something in ${tgt.name}'s face gives way.`;
            } else { remember(w, a, `You saw into ${tgt.name}. Nothing is written there that runs them.`, 0.7); B.soothe(tgt.body, 0.1); text = `${a.name} looks into ${tgt.name} a long moment.`; }
            break;
          }
          case 'greenhand': {
            if (tgt && tgt.body.hurt > 0.1) { tgt.body.hurt = B.clamp(tgt.body.hurt - 0.3 * power); bumpTrust(tgt, a, 0.1); remember(w, tgt, `${a.name} laid hands on you and the hurt closed like a flower at dusk.`, 0.9); text = `${a.name} lays hands on ${tgt.name} and the hurt closes.`; }
            else { w.blessedField = w.day + 1; text = `${a.name} kneels in the field with both hands in the earth, and the earth answers. Tomorrow will give more.`; remember(w, a, 'You put your hands in the ground and felt it turn toward you.', 0.6); }
            break;
          }
          case 'farsight': {
            const next = I.FRONTIER.find(f => !isFound(w, f.key));
            if (next && ['edge', 'road'].includes(a.location)) {
              w.found = w.found || {}; w.found[next.key] = { day: w.day, by: a.id };
              PLACES[next.key] = PLACES[next.key] || { x: next.x, y: next.y, label: next.label, sheltered: false };
              text = `${a.name} stands at the edge with closed eyes and says where to walk: ${next.found}. They call it ${next.label}.`;
              remember(w, a, `You saw it before anyone walked there: ${next.label}.`, 1);
              for (const o of alive(w)) if (o !== a) remember(w, o, `${a.name} found ${next.label} without leaving the edge. There is more out there than we knew.`, 0.7);
              if (!w.goals.frontier) { w.goals.frontier = { done: w.day }; event(w, `A question answered: ${GOALS.frontier}.`, 'healed'); }
            } else {
              const lacks = alive(w).filter(o => o !== a && (o.body.food < 0.3 || o.body.warmth < 0.3 || o.body.hurt > 0.4)).map(o => `${o.name} is ${o.body.hurt > 0.4 ? 'hurt' : o.body.food < 0.3 ? 'hungry' : 'cold'} at ${o.location === 'home' ? 'home' : (PLACES[o.location]?.label || o.location)}`);
              remember(w, a, lacks.length ? `You saw far: ${lacks.join('; ')}.` : 'You saw far: everyone is fed and warm, for now.', 0.8);
              text = `${a.name} goes still and their eyes move as if reading something far off.`;
            }
            break;
          }
        }
        B.gladden(a.body, 0.1);
        a.lastSaid = '';
        event(w, text, 'wonder', [a.id, ...(tgt ? [tgt.id] : [])]);
        // The village sees. The guarded and the distrustful are afraid; the rest are lifted, and believe a little more.
        for (const o of near) {
          if (o === a || o === tgt) continue;
          const afraid = (o.traits?.guard || 0.5) > 0.6 || trustOf(o, a) < 0;
          if (afraid) { bumpTrust(o, a, -0.06); o.faith = B.clamp((o.faith || 0) - 0.05, -1, 1); remember(w, o, `${a.name} did something that should not be possible. Your skin crawled.`, 0.8); }
          else { bumpTrust(o, a, 0.07); o.faith = B.clamp((o.faith || 0) + 0.08, -1, 1); remember(w, o, `You saw ${a.name} do something no one can explain. You will not forget it.`, 0.9); }
        }
        break;
      }
      case 'adopt': {
        const an = (act.animal && A.byName(w, a, act.animal)) || A.straysAt(w, a.location)[0];
        if (!an || an.owner) { remember(w, a, 'There was no stray here to take in.', 0.2); break; }
        if (typeof act.call === 'string' && act.call.trim()) an.name = act.call.trim().slice(0, 16);
        A.claim(w, an, a, remember, event, 'took');
        break;
      }
      case 'pet': {
        const an = (act.animal && A.byName(w, a, act.animal)) || A.petsOf(w, a)[0];
        if (!an) { remember(w, a, 'You reached for an animal that was not there.', 0.2); break; }
        if (typeof act.call === 'string' && act.call.trim() && an.owner === a.id) { const old = an.name; an.name = act.call.trim().slice(0, 16); if (old !== an.name) event(w, `${a.name} now calls their ${an.kind} ${an.name}.`, 'info', [a.id]); }
        B.gladden(a.body, 0.08); a.body.tightness = B.clamp(a.body.tightness - 0.06); an.bond = Math.min(10, an.bond + 0.3);
        remember(w, a, `You sat with ${an.name} a while, your hand on ${an.kind === 'hen' ? 'her' : 'them'}. ${an.kind === 'cat' ? 'The purr went into your chest.' : an.kind === 'dog' ? 'The tail did not stop.' : 'It leaned into you.'}`, 0.5);
        for (const o of near) if (o.body.openness > 0.5) B.gladden(o.body, 0.02);
        break;
      }
      case 'hunt': {
        if (!['meadow', 'forest'].includes(a.location)) break;
        a.body.energy = B.clamp(a.body.energy - 0.12);
        if ((w.deer || 0) > 0 && Math.random() < (a.inv.axe > 0 ? 0.45 : 0.33)) {
          w.deer -= 1; const shown = A.alive(w).find(x => x.kind === 'deer'); if (shown) shown.alive = false;
          a.inv.food += 2.5; a.skills = a.skills || {}; a.skills.hunting = (a.skills.hunting || 0) + 1;
          event(w, `${a.name} brings down a deer at ${PLACES[a.location].label}.`, 'work', [a.id]);
          remember(w, a, 'You took a deer. Its eye was open the whole time. There is meat for days.', 0.7);
        } else remember(w, a, (w.deer || 0) > 0 ? 'You crouched in the grass an hour and the deer knew before you moved.' : 'There are no deer left to take this season. The meadow is quiet.', 0.3);
        break;
      }
      case 'sit': {
        // Stillness. By water or under trees it goes deeper. With someone near, it is shared.
        const deep = ['creek', 'grove', 'meadow'].includes(a.location) ? 0.12 : 0.07;
        B.gladden(a.body, deep); a.body.breath = B.clamp(a.body.breath + 0.15);
        a.body.energy = B.clamp(a.body.energy + 0.05);
        if (near.length) { a.exposures.closeness = true; }
        a.skills = a.skills || {}; a.skills.stillness = (a.skills.stillness || 0) + (deep > 0.1 ? 2 : 1);
        if (!a.gift && a.skills.stillness >= 8) awaken(w, a, `in the quiet at ${PLACES[a.location]?.label || a.location}`);
        remember(w, a, `You sat still ${a.location === 'home' ? 'at home' : 'at ' + (PLACES[a.location]?.label || a.location)} and let your breath slow.`, 0.3);
        break;
      }
      case 'walk': {
        // A long walk. Alone it clears the head; with someone it is a long talk with your feet moving.
        const companion = tgt;
        B.gladden(a.body, 0.1); a.body.energy = B.clamp(a.body.energy - 0.04);
        if (companion) {
          B.gladden(companion.body, 0.1);
          bumpTrust(a, companion, 0.08); bumpTrust(companion, a, 0.08);
          a.exposures.closeness = true; companion.exposures.closeness = true;
          for (const g of [...(a.grief || []), ...(companion.grief || [])]) { g.shared += 1; g.sharedToday = (g.sharedToday || 0) + 1; }
          a.skills = a.skills || {}; a.skills.listening = (a.skills.listening || 0) + 1;
          event(w, `${a.name} and ${companion.name} walk a long way together${act.say ? `. ${a.name}: "${act.say}"` : '.'}`, 'comfort', [a.id, companion.id]);
          remember(w, a, `You walked a long way with ${companion.name}.${act.say ? ` You said: "${act.say}"` : ''}`, 0.6);
          remember(w, companion, `${a.name} walked a long way with you${act.say ? ` and said: "${act.say}"` : ''}.`, 0.6);
          if (act.say) a.lastSaid = String(act.say).slice(0, 200);
        } else {
          remember(w, a, `You walked alone to ${PLACES[a.location]?.label || a.location} and back. Your head is clearer.`, 0.35);
        }
        break;
      }
      case 'sing': {
        // Music at the hearth. The singer is lifted; everyone near is lifted a little.
        B.gladden(a.body, 0.14);
        a.skills = a.skills || {}; a.skills.music = (a.skills.music || 0) + 1;
        const lift = 0.05 + Math.min(0.08, a.skills.music * 0.005);
        for (const o of near) { B.gladden(o.body, lift); bumpTrust(o, a, 0.03); o.exposures.closeness = true; }
        a.lastSaid = act.say ? String(act.say).slice(0, 200) : '';
        event(w, `${a.name} sings at the hearth${near.length ? ` and ${near.map(o => o.name).join(', ')} listen` : ', alone'}${act.say ? `: "${act.say}"` : '.'}`, 'comfort', [a.id, ...near.map(o => o.id)]);
        remember(w, a, near.length ? `You sang and ${near.map(o => o.name).join(' and ')} listened.` : 'You sang alone at the fire.', 0.5);
        for (const o of near) remember(w, o, `${a.name} sang at the hearth. It eased something.`, 0.5);
        if (a.skills.music === 10) event(w, `People have started asking ${a.name} to sing.`, 'healed', [a.id]);
        break;
      }
      case 'hobby': {
        // Practice a craft for its own sake. The hands learn; the thing made is a bonus.
        const h = I.HOBBIES[act.what]; if (!h) break;
        a.skills = a.skills || {}; a.skills[act.what] = (a.skills[act.what] || 0) + 1;
        const skill = a.skills[act.what];
        B.gladden(a.body, 0.1 + Math.min(0.08, skill * 0.004));
        a.body.energy = B.clamp(a.body.energy - 0.03);
        const made = I.canCraft(a.inv, h.item) && Math.random() < Math.min(0.9, 0.4 + skill * 0.05) ? I.craft(a.inv, h.item) : false;
        if (made) { event(w, `${a.name} ${h.verb} a ${I.ITEMS[h.item].label}.`, 'craft', [a.id]); remember(w, a, `You made a ${I.ITEMS[h.item].label}. It came out well.`, 0.5); }
        else remember(w, a, `You spent the afternoon ${act.what}. ${skill < 5 ? 'Clumsy still, but it quieted your mind.' : 'The work knows your hands.'}`, 0.35);
        if (skill === 8) { event(w, `${a.name} has taken up ${act.what}.`, 'healed', [a.id]); remember(w, a, h.line, 0.8); }
        break;
      }
      case 'withdraw': {
        a.body.openness = B.clamp(a.body.openness - 0.05);
        break;
      }
      case 'rest': {
        a.body.energy = B.clamp(a.body.energy + 0.12);
        break;
      }
    }
  }

  // 3b. say plainly what everyone is doing, so a watcher can read the village like a page
  w.now = [];
  for (const a of living) {
    const act = decisions.get(a.id);
    const line = narrate(w, a, act);
    a.doing = line.short; a.doingText = line.text;
    w.now.push({ id: a.id, name: a.name, text: line.text, kind: line.kind, at: a.location });
  }

  // 4. abandonment: overwhelmed and nobody stayed
  for (const a of living) {
    if (a.body.overwhelmed > 0 && a.location !== 'home') {
      const stayed = sameSpot(w, a).length > 0;
      if (!stayed && a.lastHitBy) {
        emotionalEvent(w, a, 'abandoned', null, 0.35);
        remember(w, a, 'You fell apart and everyone left.', 0.9);
      }
    }
  }

  // 5. bodies meet the weather
  const fireBurning = w.hearth.wood > 0 && cold > 0.15 && at(w, 'hearth').length > 0;
  if (fireBurning) w.hearth.wood -= 1;
  const campBurning = w.camp.founded && w.camp.wood > 0 && cold > 0.15 && at(w, 'camp').length > 0;
  if (campBurning) w.camp.wood -= 1;
  const hall = !!w.builds.hall?.done;
  for (const a of living) {
    // A blanket halves what the cold takes. The hall makes the hearth a room. The camp has only its fire.
    const myCold = a.inv.blanket > 0 ? cold * 0.5 : cold;
    const env = { cold: myCold, sheltered: a.location === 'home' || (hall && a.location === 'hearth'), warmFire: (a.location === 'hearth' && (fireBurning || hall)) || (a.location === 'camp' && campBurning) };
    B.tickBody(a.body, env);
    if (a.sense) {
      const k = a.sense.kind;
      if (k === 'empath') { const tightNear = sameSpot(w, a).filter(o => o !== a && (o.body.tightness > 0.5 || (o.grief || []).length)).length; if (tightNear) a.body.tightness = B.clamp(a.body.tightness + 0.02 * tightNear); }
      else if (k === 'clairvoyant') a.body.joy = B.clamp((a.body.joy ?? 0.5) - 0.006);
      else if (k === 'claircognizant') a.body.openness = B.clamp(a.body.openness - 0.008);
    }
    if (a.body.food < 0.45 && a.inv.bread >= 1) { a.inv.bread -= 1; B.eat(a.body, 0.5); }
    else if (a.body.food < 0.45 && a.inv.food >= 0.3) { a.inv.food -= 0.3; B.eat(a.body, 0.3); }
    if (a.body.hurt > 0.3 && a.inv.salve > 0) { a.inv.salve -= 1; a.body.hurt = B.clamp(a.body.hurt - 0.3); remember(w, a, 'You used your salve.', 0.3); }
    if (a.body.tightness > 0.6 && (a.inv.tonic || 0) > 0) { a.inv.tonic -= 1; B.soothe(a.body, 0.25); B.gladden(a.body, 0.05); remember(w, a, 'You drank a tonic. Your chest let go a little.', 0.3); }
    if ((a.inv.quilt || 0) > 0 && a.location === 'home') a.body.warmth = B.clamp(a.body.warmth + 0.03);
    // Age: the cold finds the old first, and they tire.
    const age = ageOf(w, a);
    if (age >= 65 && !env.sheltered) a.body.warmth = B.clamp(a.body.warmth - myCold * (age >= 80 ? 0.08 : 0.04));
    if (age >= 80) a.body.energy = B.clamp(a.body.energy - 0.015);
    // Having the thing you long for steadies the body a little, every moment you have it.
    if (a.wants && a.inv[a.wants] > 0) a.body.tightness = B.clamp(a.body.tightness - 0.008);
    // The pool in summer: the heat lets go of you there.
    if (w.builds.pool?.done && a.location === 'creek' && W.seasonOf(w.day, w.weather) === 'summer') { a.body.tightness = B.clamp(a.body.tightness - 0.03); a.body.openness = B.clamp(a.body.openness + 0.01); }
    griefTick(a);
    const near = sameSpot(w, a);
    // The rules run. A closeness wound clamps the chest whenever people are near.
    const closeRule = a.wounds.find(r => r.trigger === 'closeness');
    if (closeRule && near.length) a.body.tightness = B.clamp(a.body.tightness + 0.06 * closeRule.strength);
    // Hard transits keep the body braced all day.
    if (a.transits.some(t => t.planet === 'saturn' || t.planet === 'mars')) a.body.tightness = B.clamp(a.body.tightness + 0.03);
    if (a.body.tightness > 0.45 && near.length) a.exposures.weakness = true;
  }

  // 5b. families: feeding, holding, protecting
  F.familyTick(w);

  // 6. death
  for (const a of living) if (B.isDead(a.body)) die(w, a);
}

function rebuffs(target, approacher) {
  const rule = target.wounds.find(r => r.trigger === 'closeness');
  if (!rule) return false;
  const t = trustOf(target, approacher);
  return Math.random() < rule.strength * 0.7 - Math.max(0, t) * 0.5;
}

export function moveTo(w, a, dest) {
  if (dest === 'home') { a.location = 'home'; a.pos = { ...a.home }; return; }
  if (dest === 'hearth') dest = fireOf(w, a);   // "the fire" means your own
  if (PLACES[dest]) { a.location = dest; a.pos = { x: PLACES[dest].x + rnd(-1.2, 1.2), y: PLACES[dest].y + rnd(-1.2, 1.2) }; return; }
  const other = byId(w, dest);
  if (other && other.alive) {
    if (other.location === 'home') {
      // Visiting: you stand at their door. They count as "here" for both of you.
      a.location = `visit:${other.id}`;
      a.pos = { x: other.home.x + 1.1, y: other.home.y + 0.3 };
    } else moveTo(w, a, other.location);
  }
}

function die(w, a, forcedCause) {
  a.alive = false;
  a.diedDay = w.day;
  a.ageAtDeath = Math.floor(ageOf(w, a));
  const cause = forcedCause || (a.body.food < 0.15 ? 'hunger' : a.body.warmth < 0.15 ? 'the cold' : 'injuries');
  a.causeOfDeath = cause;
  if (w.winterDeaths != null) w.winterDeaths += 1;
  const griefCount = alive(w).filter(o => trustOf(o, a) > 0.25).length;
  if (cause === 'old age' && griefCount >= 3 && !w.goals.oldAndMourned) { w.goals.oldAndMourned = { done: w.day }; event(w, `A question answered: ${GOALS.oldAndMourned}.`, 'healed'); }
  for (const o of alive(w)) if (cause !== 'old age') o.faith = B.clamp((o.faith || 0) - 0.05, -1, 1);
  event(w, cause === 'old age' ? `${a.name} has died in their sleep, aged ${a.ageAtDeath}.` : `${a.name} has died of ${cause}, aged ${a.ageAtDeath}.`, 'death', [a.id]);
  const living = alive(w);

  // Grief lands on the people who were close. Kin grieve hardest. It lives in the body until it is shared out.
  const kin = new Set([a.partner, ...(a.children || []), ...(a.parents || [])].filter(Boolean));
  for (const o of living) {
    const t = trustOf(o, a);
    const isKin = kin.has(o.id);
    remember(w, o, `${a.name} died of ${cause}.`, 0.7 + Math.max(0, t) * 0.3);
    if (t > 0.25 || isKin) {
      emotionalEvent(w, o, 'loss', null, isKin ? 0.8 : 0.4 + t * 0.4);
      o.grief = o.grief || [];
      o.grief.push({ for: a.id, name: a.name, day: w.day, intensity: isKin ? 1 : Math.min(1, 0.4 + t * 0.6), shared: 0 });
      if (isKin && o.partner === a.id) { o.partner = null; o.bondStrength = 0; remember(w, o, `${a.name} was yours. The house is yours alone now.`, 1); }
    }
  }

  // Belongings go to kin first, then to whoever the dead trusted most. The thing they longed for goes to the first.
  const heirs = living.map(o => ({ o, t: trustOf(a, o) + (kin.has(o.id) ? 2 : 0) })).filter(h => h.t > 0.1).sort((x, y) => y.t - x.t).slice(0, 3);
  if (heirs.length) {
    const goods = Object.entries(a.inv).filter(([, n]) => n >= 1 || (n > 0 && false));
    let i = 0;
    for (const [item, n] of goods) {
      const count = Math.floor(n);
      if (count < 1) continue;
      const first = item === a.wants ? heirs[0] : heirs[i++ % heirs.length];
      first.o.inv[item] = (first.o.inv[item] || 0) + count;
      const label = I.ITEMS[item]?.label || item;
      const wantedByHeir = first.o.wants === item && count > 0;
      remember(w, first.o, `${a.name}'s ${label} came to you.${item === a.wants ? ' It was the thing they loved.' : ''}${wantedByHeir ? ' It is the thing you longed for, and it came like this.' : ''}`, 0.8);
      event(w, `${a.name}'s ${label} goes to ${first.o.name}.`, 'share', [a.id, first.o.id]);
      if (wantedByHeir) B.emotionalHit(first.o.body, 0.15);  // wanting it and getting it this way is its own ache
    }
    if (a.inv.food >= 0.3) { heirs[0].o.inv.food += a.inv.food; }
    for (const k of Object.keys(a.inv)) a.inv[k] = 0;
  }

  // The dead's last diary words reach the ones who loved them.
  const last = a.diary[a.diary.length - 1];
  if (last) for (const h of heirs) remember(w, h.o, `${a.name}'s last words in their diary: "${last.text.slice(0, 160)}"`, 0.9);

  // Blame: whoever struck or robbed them in their last days is remembered for it.
  const recentHurt = a.memories.filter(m => m.day >= w.day - 5 && /struck you|took your/.test(m.text));
  for (const m of recentHurt) {
    const who = living.find(o => m.text.startsWith(o.name + ' '));
    if (!who) continue;
    for (const o of living) if (o !== who) { bumpTrust(o, who, -0.2); remember(w, o, `${who.name} hurt ${a.name} in their last days. People remember.`, 0.7); }
    event(w, `The village holds ${who.name} to account for ${a.name}.`, 'strike', [who.id]);
    who.blamed = w.day;
  }

  // A lesson the village carries for a season. A death of old age teaches nothing but that time passes.
  w.lessons = w.lessons || [];
  if (cause !== 'old age') {
    const lesson = cause === 'hunger' ? { kind: 'hunger', text: `${a.name} starved. The larder ran dry and nobody saw it in time.` }
      : cause === 'the cold' ? { kind: 'cold', text: `${a.name} froze. Wood and blankets before anything else.` }
      : { kind: 'violence', text: `${a.name} died of their injuries. Someone in this village did that.` };
    w.lessons.push({ ...lesson, day: w.day, until: w.day + w.weather.daysPerSeason * 2 });
  }

  // Tonight there is a wake.
  w.wake = { for: a.id, name: a.name, day: w.day };
}

// Grief eases when it is shared. Alone, it hardens into a rule.
function griefNightly(w) {
  const living = alive(w);
  const wake = w.wake && w.wake.day === w.day ? w.wake : null;
  if (wake) {
    const mourners = living.filter(o => (o.grief || []).some(g => g.for === wake.for));
    if (mourners.length) {
      for (const o of mourners) { const f = fireOf(w, o); o.location = f; o.pos = { x: PLACES[f].x + rnd(-1.5, 1.5), y: PLACES[f].y + rnd(-1.5, 1.5) }; }
      event(w, `${mourners.map(m => m.name).join(', ')} keep the wake for ${wake.name} at the hearth.`, 'comfort', mourners.map(m => m.id));
      for (const o of mourners) {
        const g = o.grief.find(x => x.for === wake.for);
        g.shared += mourners.length - 1;
        remember(w, o, mourners.length > 1 ? `You sat with ${mourners.filter(m => m !== o).map(m => m.name).join(' and ')} through the night for ${wake.name}.` : `You kept the wake for ${wake.name} alone.`, 0.9);
        // Grieving together does most of the work of healing a loss.
        for (const p of mourners) if (p !== o) { bumpTrust(o, p, 0.1); }
        o.exposures.closeness = mourners.length > 1;
      }
    }
    w.wake = null;
  }
  for (const o of living) {
    if (!o.grief?.length) continue;
    for (const g of [...o.grief]) {
      const sharedToday = g.sharedToday || 0;
      g.intensity -= sharedToday > 0 ? 0.09 : 0.025;
      g.sharedToday = 0;
      // Grief that goes unshared for long hardens.
      const age = w.day - g.day;
      if (age > 6 && g.shared === 0 && g.intensity > 0.4) {
        const rule = o.wounds.find(r => r.trigger === 'closeness');
        if (rule) rule.strength = Math.min(1, rule.strength + 0.03);
      }
      if (g.intensity <= 0.1) {
        o.grief = o.grief.filter(x => x !== g);
        remember(w, o, `You can think of ${g.name} now without your chest closing.`, 0.8);
        event(w, `${o.name} has grieved ${g.name}.`, 'healed', [o.id]);
        const rule = o.wounds.find(r => r.kind === 'loss');
        if (rule) rule.strength -= 0.2;
        if (rule && rule.strength <= 0) { o.wounds = o.wounds.filter(r => r !== rule); o.scars.push({ trigger: rule.trigger, belief: rule.belief, healedDay: w.day, woundedDay: rule.day }); }
      }
    }
  }
  if (w.lessons) w.lessons = w.lessons.filter(l => l.until > w.day);
}

// Grief in the body, each tick, and what it feels like.
function griefTick(o) {
  for (const g of o.grief || []) {
    o.body.tightness = B.clamp(o.body.tightness + 0.01 * g.intensity);
    o.body.openness = B.clamp(o.body.openness - 0.004 * g.intensity);
  }
}
export function griefFelt(o) {
  return (o.grief || []).map(g => g.intensity > 0.6 ? `${g.name} is gone. It sits in your chest like a stone.` : g.intensity > 0.3 ? `You miss ${g.name}. It comes and goes.` : `You still think of ${g.name}, gently now.`);
}

function nightPhase(w) {
  for (const a of alive(w)) {
    a.location = 'home'; a.pos = { ...a.home };
  }
  griefNightly(w);   // may move mourners to the hearth for a wake
  wakeSenses(w);     // the ones who listened, sang or sat still enough start to know things
  nightOwls(w);      // the young, the restless and the grieving sit up late at the fire
  F.familyNightly(w); // bonds hold or fray, children are born and grow
  trySplit(w);        // and sometimes a few people walk out to light their own fire
  for (const a of alive(w)) {
    if (a.body.food < 0.6 && a.inv.food >= 0.3) { a.inv.food -= 0.3; B.eat(a.body, 0.3); }
    B.sleep(a.body);
    if (a.sense?.kind === 'clairaudient') a.body.energy = B.clamp(a.body.energy - 0.1);   // light sleepers
    const age = ageOf(w, a);
    if (age >= 80) a.body.energy = B.clamp(a.body.energy - 0.15);        // the old do not sleep it all off
    else if (age >= 65) a.body.energy = B.clamp(a.body.energy - 0.07);
    if (a.inv.blanket > 0) a.body.warmth = B.clamp(a.body.warmth + 0.2);
    // Debts. A little back each night you can spare it; a tenth more each season; a season unpaid and the store stops trusting you.
    const loan = w.store.loans?.[a.id];
    if (loan && loan.owed > 0) {
      if ((a.inv.coin || 0) > 3) { const pay = Math.min(loan.owed, 1); a.inv.coin -= pay; w.store.coin += pay; loan.owed -= pay; loan.lastPaid = w.day; }
      if (W.dayInSeason(w.day, w.weather) === 0 && w.day > loan.since) loan.owed = Math.ceil(loan.owed * 1.1);
      if (w.day - (loan.lastPaid ?? loan.since) > w.weather.daysPerSeason && !loan.defaulted) { loan.defaulted = true; event(w, `${a.name} has not paid the store in a season. Word gets around.`, 'trade', [a.id]); for (const o of alive(w)) if (o !== a) bumpTrust(o, a, -0.05); remember(w, a, 'Everyone knows you owe the store and have not paid.', 0.7); }
      if (loan.owed <= 0) delete w.store.loans[a.id];
    }
    // What you built for yourself pays every night.
    if (a.upgrades?.bighouse) { a.body.warmth = B.clamp(a.body.warmth + 0.12); a.body.energy = B.clamp(a.body.energy + 0.08); }
    if (a.upgrades?.garden && W.seasonOf(w.day, w.weather) !== 'winter') { a.inv.food += 0.15; if (Math.random() < 0.3) a.inv.herbs += 1; }
    // Without a granary, stored food spoils a little each night. A pot slows it. Bread keeps.
    if (!w.builds.granary?.done && a.inv.food > 1) a.inv.food = Math.max(1, a.inv.food * (a.inv.pot > 0 ? 0.985 : 0.96));
    const exposures = {
      closeness: { happened: !!a.exposures.closeness, painFollowed: !!a.exposures.painToday },
      weakness:  { happened: !!a.exposures.weakness,  painFollowed: !!a.exposures.painToday },
      asking:    { happened: !!a.exposures.asking,    painFollowed: !!a.exposures.painToday },
    };
    const healed = processExposures(a, exposures, w.day);
    for (const r of healed) {
      event(w, `${a.name} has healed. "${r.belief}" no longer runs them. The scar stays.`, 'healed', [a.id]);
      remember(w, a, 'Something that used to clamp your chest has let go. You still remember it.', 1);
    }
    a.exposures = {};
    a.lastHitBy = null;
    if (a.brain !== 'remote' || !a.connected) {
      a.selfSummary = scriptedSummary(a);
      writeDiary(w, a, scriptedDiary(w, a, w.day), 'scripted');
    }
  }
  A.nightly(w, w.agents, PLACES, W.seasonOf(w.day, w.weather), yearDays(w), remember, event, (k) => isFound(w, k));   // fed, laid, aged, taken by wolves
  storeNight(w);       // the store picks a project and posts wages when it can afford to
  measureNight(w);     // the instruments: is care outrunning harm, are wounds healing
  faithNightly(w);     // the day becomes an opinion of the sky
  checkGoals(w);       // has the village answered a question?
  chronicleNight(w);   // and someone writes it down
  event(w, `Night falls on day ${w.day}.`, 'night');
}

// ---------- the store as a builder ----------
// With money in the till the store commissions the village's next project and pays wages for it.
function storeNight(w) {
  const st = w.store;
  // A market beyond the edge. Once the road is laid, a cart comes now and then: it buys the store's
  // surplus for coin and, when the till is fat, sells the village things it cannot make. This is
  // how coin enters from outside, and why a glut of food is worth something.
  if (w.builds.road?.done && Math.random() < 0.5) {
    const sold = [];
    let earned = 0;
    for (const [item, n] of Object.entries(st.shelf)) {
      const keep = item === 'food' ? 20 : 8;
      const excess = Math.floor((n || 0) - keep);
      if (excess >= 3 && I.STORE_PRICES[item] != null) {
        const price = Math.max(1, Math.round(I.STORE_PRICES[item] * 0.6));
        st.shelf[item] -= excess; earned += excess * price; sold.push(`${excess} ${item}`);
      }
    }
    if (earned > 0) { st.coin += earned; event(w, `A cart from beyond the edge buys ${sold.join(', ')} from the store for ${earned} coin.`, 'trade'); }
    if (st.coin >= 120) {
      const bring = { blanket: 2, salve: 2, rope: 3, pot: 1 };
      let spent = 0; const got = [];
      for (const [item, n] of Object.entries(bring)) { const cost = I.STORE_PRICES[item] * n; if (st.coin - spent - cost >= 60 && (st.shelf[item] || 0) < 3) { st.shelf[item] = (st.shelf[item] || 0) + n; spent += cost; got.push(`${n} ${item}`); } }
      if (spent > 0) { st.coin -= spent; event(w, `The cart leaves ${got.join(', ')} on the store's shelf for ${spent} coin.`, 'trade'); }
    }
  }
  const unbuilt = Object.keys(I.BUILDS).filter(k => !w.builds[k]?.done && (I.BUILDS[k].at !== 'creek' || isFound(w, 'creek')));
  if (st.project && (w.builds[st.project]?.done || !unbuilt.includes(st.project))) { event(w, `The store's project, the ${st.project}, is done. It paid ${st.wagesPaid || 0} coin in wages.`, 'trade'); st.project = null; }
  if (!st.project && st.coin >= 60 && unbuilt.length) {
    st.project = unbuilt.includes('road') ? 'road' : unbuilt[0];
    event(w, `The store puts up coin for a ${st.project}: a coin for every wood and stone brought to the work.`, 'trade');
    for (const a of alive(w)) remember(w, a, `The store is paying coin for work on the ${st.project}.`, 0.5);
  }
}

// ---------- the instruments ----------
// One row per season. Counts of what happened, and the state of the bodies at season's end.
// The readouts that matter: care against harm, healing against wounding, grief shared or carried.
function measureNight(w) {
  w.stats = w.stats || [];
  const yd = w.weather.daysPerSeason;
  const idx = Math.floor(w.day / yd);
  let row = w.stats.find(r => r.index === idx);
  if (!row) {
    row = { index: idx, season: W.seasonOf(w.day, w.weather), year: Math.floor(w.day / yearDays(w)) + 1, startDay: idx * yd,
      deaths: 0, births: 0, bonds: 0, leaves: 0, strikes: 0, takes: 0, comforts: 0, shares: 0, tends: 0, wounds: 0, healed: 0, grieved: 0, prayers: 0, godActs: 0, trades: 0 };
    w.stats.push(row); if (w.stats.length > 200) w.stats.shift();
  }
  const today = w.log.filter(e => e.day === w.day);
  for (const e of today) {
    if (e.kind === 'death') row.deaths++;
    else if (/is born to/.test(e.text)) row.births++;
    else if (/are together now/.test(e.text)) row.bonds++;
    else if (/^\w+ leaves \w+\.$/.test(e.text) || /leaves the village/.test(e.text)) row.leaves++;
    else if (e.kind === 'strike' && /strikes/.test(e.text)) row.strikes++;
    else if (e.kind === 'strike' && /takes/.test(e.text)) row.takes++;
    else if (e.kind === 'comfort' && /comforts/.test(e.text)) row.comforts++;
    else if (e.kind === 'comfort' && /tends to/.test(e.text)) row.tends++;
    else if (e.kind === 'share') row.shares++;
    else if (e.kind === 'wound') row.wounds++;
    else if (/has healed\./.test(e.text)) row.healed++;
    else if (/has grieved/.test(e.text)) row.grieved++;
    else if (e.kind === 'pray') row.prayers++;
    else if (e.kind === 'trade') row.trades++;
    else if (e.kind === 'god' && !/call the sky/.test(e.text)) row.godActs++;
  }
  // The bodies at the end of the day (overwritten daily, so the row ends with the season's last state).
  const living = alive(w);
  const avg = (f) => living.length ? +(living.reduce((s, a) => s + f(a), 0) / living.length).toFixed(3) : 0;
  row.alive = living.length;
  row.tightness = avg(a => a.body.tightness);
  row.openness = avg(a => a.body.openness);
  row.hurt = avg(a => a.body.hurt);
  row.food = avg(a => a.body.food);
  row.faith = avg(a => a.faith || 0);
  row.trust = avg(a => { const v = Object.values(a.trust); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; });
  row.woundedNow = living.filter(a => a.wounds.length).length;
  row.grievingNow = living.filter(a => (a.grief || []).length).length;
  row.branches = living.reduce((m, a) => (m[branch(a)] = (m[branch(a)] || 0) + 1, m), {});
  row.minds = living.filter(a => a.owner || a.lent).length;
  row.endDay = w.day;
}

// Plain readouts across everything measured so far.
export function readouts(w) {
  const rows = w.stats || [];
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const care = sum('comforts') + sum('shares') + sum('tends');
  const harm = sum('strikes') + sum('takes');
  const last = rows[rows.length - 1], prev = rows[rows.length - 2];
  return {
    seasons: rows.length,
    careToHarm: harm ? +(care / harm).toFixed(1) : (care ? Infinity : 0),
    care, harm,
    healedToWounded: sum('wounds') ? +(sum('healed') / sum('wounds')).toFixed(2) : (sum('healed') ? Infinity : 0),
    healed: sum('healed'), wounds: sum('wounds'),
    griefResolved: sum('grieved'), deaths: sum('deaths'), births: sum('births'),
    bonds: sum('bonds'), leaves: sum('leaves'),
    tightnessTrend: last && prev ? +(last.tightness - prev.tightness).toFixed(3) : 0,
    trustTrend: last && prev ? +(last.trust - prev.trust).toFixed(3) : 0,
    faithNow: last ? last.faith : 0,
  };
}

// ---------- the watchers' channel ----------
// Commentary. The villagers never see it. Kept with the world so a later watcher can read back.
export function chat(w, name, text, who = '', token = '') {
  w.chat = w.chat || [];
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, n);
  const msg = { day: w.day, tick: w.tick, ts: Date.now(), name: clean(name || 'a watcher', 24), text: clean(text, 500), who, token };
  if (!msg.text.trim()) return null;
  w.chat.push(msg); if (w.chat.length > 500) w.chat.shift();
  return msg;
}

// ---------- dilemmas ----------
// Hard moments in an owned villager's life, put to their higher self as a choice with consequences.
// The villager still does the thing; the higher self picks the direction. Each kind, once a day.
export function dilemmaFor(w, a) {
  const b = a.body;
  const near = sameSpot(w, a);
  const others = alive(w).filter(o => o !== a && !F.isChild(w, o));
  const byTrust = [...others].sort((x, y) => trustOf(a, y) - trustOf(a, x));
  const friend = byTrust.find(o => trustOf(a, o) > 0.3);
  const rich = [...others].filter(o => (o.inv.food || 0) >= 1).sort((x, y) => (y.inv.food || 0) - (x.inv.food || 0))[0];
  const opt = (label, action, hint) => ({ label, action, hint });

  if (b.food < 0.35 && (a.inv.food || 0) < 0.3 && (a.inv.bread || 0) < 1) {
    const opts = [];
    if (W.fieldYield(w.day, w.weather) > 0.1) opts.push(opt('Work the field', { type: 'work', to: 'field' }, 'Honest and slow. The field gives little this season.'));
    if ((a.inv.coin || 0) >= I.buyPrice(w.store, 'food') && (w.store.shelf.food || 0) >= 1) opts.push(opt(`Buy food (${I.buyPrice(w.store, 'food')} coin)`, { type: 'buy', item: 'food', n: 2 }, 'You have the coin.'));
    else if (!w.store.loans?.[a.id]?.defaulted && w.store.coin > 0) opts.push(opt('Borrow from the store', { type: 'borrow', n: 6 }, 'A debt that grows each season. The store remembers who pays.'));
    if (friend) opts.push(opt(`Ask ${friend.name} for help`, { type: 'talk', target: friend.id, say: `I have nothing to eat. Can you spare anything?` }, `You trust them. They may or may not have food to give.`));
    if (rich && rich !== friend) opts.push(opt(`Take from ${rich.name}`, { type: 'take', target: rich.id, item: 'food' }, `${rich.name} has ${Math.floor(rich.inv.food)} food. They will know it was you.`));
    if (isFound(w, 'creek')) opts.push(opt('Fish the creek', { type: 'forage', to: 'creek' }, 'Cold work, but the creek feeds.'));
    opts.push(opt('Go hungry tonight', { type: 'withdraw' }, 'Hunger tightens the body and, if it lasts, kills.'));
    return { key: 'starving', text: `${a.name} is starving. There is nothing in the house.`, options: opts };
  }
  if (b.warmth < 0.3) {
    const opts = [];
    if (w.hearth.wood > 0 || w.builds.hall?.done) opts.push(opt('Go to the fire', { type: 'go', to: 'hearth' }, 'Warmth, and whoever is there.'));
    if ((a.inv.coin || 0) >= I.buyPrice(w.store, 'blanket') && (w.store.shelf.blanket || 0) >= 1) opts.push(opt(`Buy a blanket (${I.buyPrice(w.store, 'blanket')} coin)`, { type: 'buy', item: 'blanket', n: 1 }, 'Halves what the cold takes, every day after.'));
    else if ((a.inv.fiber || 0) >= 3 && (a.inv.rope || 0) >= 1) opts.push(opt('Make a blanket', { type: 'craft', item: 'blanket' }, 'You have the fiber and rope.'));
    else if (!w.store.loans?.[a.id]?.defaulted && w.store.coin >= 10) opts.push(opt('Borrow for a blanket', { type: 'borrow', n: 12 }, 'Then buy one. Debt, but warmth.'));
    opts.push(opt('Cut wood for the hearth', { type: 'work', to: 'forest' }, 'Cold work that warms everyone later.'));
    opts.push(opt('Stay home under what you have', { type: 'withdraw' }, 'Shelter, but a roof alone is not enough in a killing cold.'));
    return { key: 'freezing', text: `${a.name} is dangerously cold.`, options: opts };
  }
  if (a.lastHitBy) {
    const who = byId(w, a.lastHitBy);
    if (who && who.alive) {
      const opts = [
        opt(`Strike ${who.name} back`, { type: 'strike', target: who.id }, 'They will hurt. So will everyone watching, and the wound in you deepens either way.'),
        opt(`Say something to ${who.name}`, { type: 'talk', target: who.id, say: `Why did you do that?` }, 'They may answer. They may not.'),
        opt('Walk away and go home', { type: 'withdraw' }, 'Safe tonight. The body keeps the rule it wrote.'),
      ];
      if (friend && friend !== who) opts.push(opt(`Go to ${friend.name}`, { type: 'go', to: friend.id }, 'Being near someone you trust is how a wound does not set.'));
      return { key: 'struck', text: `${who.name} struck ${a.name} today.`, options: opts };
    }
  }
  const crying = near.find(o => o.body.overwhelmed > 0 && !F.isChild(w, o));
  if (crying) {
    return { key: 'witness', text: `${crying.name} is crying and cannot stop, right in front of ${a.name}.`, options: [
      opt(`Sit with ${crying.name}`, { type: 'comfort', target: crying.id }, 'Staying is what heals. It may be rebuffed.'),
      opt('Give them something to eat', { type: 'share', target: crying.id }, (a.inv.food || 0) >= 0.3 ? 'You have food to give.' : 'You have almost nothing, but the gesture counts.'),
      opt('Leave them to it', { type: 'withdraw' }, 'If nobody stays, they learn that nobody stays.'),
    ] };
  }
  const griefs = a.grief || [];
  if (griefs.length && griefs[0].intensity > 0.5 && w.tick <= 2) {
    const fellow = others.find(o => (o.grief || []).length);
    const opts = [];
    if (fellow) opts.push(opt(`Find ${fellow.name}, who is grieving too`, { type: 'go', to: fellow.id }, 'Grief shared eases. Grief carried alone hardens.'));
    opts.push(opt('Speak to the sky', { type: 'pray', say: `Keep ${griefs[0].name} somewhere warm.` }, 'No one knows if anything listens.'));
    opts.push(opt('Work until you cannot think', { type: 'work', to: 'field' }, 'The body tires. The grief waits.'));
    return { key: 'grief', text: `${a.name} woke up with ${griefs[0].name} on their chest again.`, options: opts };
  }
  return null;
}

// ---------- night owls ----------
// Most people sleep. Some don't: the young with energy to burn, the grieving, the ones whose
// chests won't settle, and children who slip out after their parents are asleep.
const LATE_TALK = ['Can\'t sleep either?', 'Look at the stars tonight.', 'Do you ever think about leaving?', 'My mother used to say the fire talks.', 'Don\'t tell anyone I was out.', 'What do you think is past the edge?', 'I keep thinking about the winter.', 'Sit. The fire\'s still good.'];
function nightOwls(w) {
  if (w.wake && w.wake.day === w.day) return;   // a wake already keeps the hearth tonight
  const living = alive(w);
  const fireOk = w.hearth.wood > 0 || w.builds.hall?.done;
  if (!fireOk) return;
  const owls = living.filter(a => {
    if (a.location !== 'home') return false;
    const age = ageOf(w, a);
    const young = age >= 10 && age < 26 && a.body.energy > 0.6;
    const restless = a.body.tightness > 0.5 && a.body.overwhelmed === 0;
    const grieving = (a.grief || []).length > 0;
    const chance = young ? 0.25 : restless ? 0.15 : grieving ? 0.2 : 0.03;
    return Math.random() < chance;
  }).slice(0, 5);
  if (owls.length < 1) return;
  for (const a of owls) {
    a.location = 'hearth'; a.pos = { x: PLACES.hearth.x + rnd(-1.5, 1.5), y: PLACES.hearth.y + rnd(-1.5, 1.5) };
    a.body.energy = B.clamp(a.body.energy - 0.12);
    a.upLate = true;
    const child = F.isChild(w, a);
    if (child) { for (const pid of a.parents || []) { const p = byId(w, pid); if (p && Math.random() < 0.4) { remember(w, p, `${a.name} slipped out to the fire after dark. You found the bed empty.`, 0.6); p.body.tightness = B.clamp(p.body.tightness + 0.1); } } }
  }
  if (owls.length === 1) {
    const a = owls[0];
    remember(w, a, `You sat up alone by the fire, late. ${(a.grief || []).length ? `Thinking of ${a.grief[0].name}.` : 'Watching it burn down.'}`, 0.5);
    event(w, `${a.name} sits up late by the fire, alone.`, 'quiet', [a.id]);
    return;
  }
  const names = owls.map(a => a.name);
  event(w, `${names.slice(0, -1).join(', ')} and ${names.slice(-1)} sit up late by the fire.`, 'talk', owls.map(a => a.id));
  for (let i = 0; i < owls.length; i++) {
    const a = owls[i], o = owls[(i + 1) % owls.length];
    const line = pick(LATE_TALK);
    a.lastSaid = line;
    event(w, `${a.name} to ${o.name}, late: "${line}"`, 'talk', [a.id, o.id]);
    bumpTrust(a, o, 0.05); bumpTrust(o, a, 0.05);
    a.exposures.closeness = true; o.exposures.closeness = true;
    if ((a.grief || []).length && (o.grief || []).length) for (const g of a.grief) { g.shared += 1; g.sharedToday = (g.sharedToday || 0) + 1; }
    remember(w, a, `You sat up late by the fire with ${owls.filter(x => x !== a).map(x => x.name).join(' and ')}.`, 0.6);
  }
}

// ---------- narration ----------
// One plain sentence per villager per moment. Not an event, just what they are doing.
function narrate(w, a, act) {
  const T = act?.target ? byId(w, act.target) : null;
  const tn = T ? T.name : 'someone';
  const place = (k) => PLACES[k]?.label || k;
  const where = a.location === 'home' ? 'at home' : a.location.startsWith('visit:') ? `at ${byId(w, a.location.slice(6))?.name || 'someone'}'s door` : `at ${place(a.location)}`;
  const s = (short, text, kind = 'doing') => ({ short, text, kind });
  if (a.body.overwhelmed > 0) return s('crying', `${a.name} is crying and cannot stop, ${where}.`, 'hurt');
  if (F.isChild(w, a)) {
    if (act?.type === 'rest') return s('near', `${a.name} (${Math.floor(ageOf(w, a))}) stays close, ${where}.`);
    if (act?.type === 'talk') return s('playing', `${a.name} pesters ${tn}: "${act.say || ''}"`, 'talk');
    if (act?.type === 'forage') return s('berrying', `${a.name} picks berries at the meadow.`);
    return s('wandering', `${a.name} wanders, ${where}.`);
  }
  switch (act?.type) {
    case 'work': return a.location === 'field' ? s('at the field', `${a.name} works the field${a.inv.hoe > 0 ? ' with a hoe' : ''}.`, 'work') : s('cutting wood', `${a.name} cuts wood in the forest${a.inv.axe > 0 ? ' with an axe' : ''}.`, 'work');
    case 'forage': return s(`at ${place(a.location).replace('the ', '')}`, `${a.name} forages at ${place(a.location)}.`, 'work');
    case 'scout': return s('exploring', `${a.name} walks out into land no one has mapped.`, 'work');
    case 'craft': return s(`making ${act.item}`, `${a.name} sits ${where} making ${I.ITEMS[act.item]?.label === 'bread' ? 'bread' : 'a ' + (I.ITEMS[act.item]?.label || act.item)}.`, 'work');
    case 'buy': return s('at the store', `${a.name} is at the store, buying ${act.item}.`, 'work');
    case 'trade': return s(`trading with ${tn}`, `${a.name} offers ${tn} ${act.n || 1} ${act.give} for ${act.m || 1} ${act.want}.`, 'work');
    case 'sell': return s('at the store', `${a.name} is at the store, selling ${act.item}.`, 'work');
    case 'borrow': return s('at the store', `${a.name} asks the store for a loan.`, 'work');
    case 'repay': return s('at the store', `${a.name} pays the store back.`, 'work');
    case 'upgrade': return s(`building a ${act.what}`, `${a.name} works on a ${I.UPGRADES[act.what]?.label || act.what} at home.`, 'work');
    case 'build': return s(`building`, `${a.name} works on the ${act.what} at ${place(I.BUILDS[act.what]?.at || 'hearth')}.`, 'work');
    case 'talk': return s(`talking to ${tn}`, `${a.name} says to ${tn}: "${act.say || '...'}"`, 'talk');
    case 'share': return s(`feeding ${tn}`, `${a.name} gives ${tn} something to eat.`, 'care');
    case 'give': return s(`giving to ${tn}`, `${a.name} gives ${tn} a ${I.ITEMS[act.item]?.label || act.item}.`, 'care');
    case 'comfort': return s(`with ${tn}`, `${a.name} sits with ${tn} while it is bad.`, 'care');
    case 'tend': return s(`tending ${tn}`, `${a.name} feeds and holds ${tn}.`, 'care');
    case 'strike': return s(`striking ${tn}`, `${a.name} strikes ${tn}.`, 'hurt');
    case 'take': return s(`stealing`, `${a.name} takes ${tn}'s ${I.ITEMS[act.item]?.label || act.item}.`, 'hurt');
    case 'bond': return s(`asking ${tn}`, `${a.name} asks ${tn} to stay together.`, 'care');
    case 'leave': return s('leaving', `${a.name} leaves their partner.`, 'hurt');
    case 'split': return s('leaving the village', `${a.name} walks out of the village.`, 'hurt');
    case 'pray': return s('praying', `${a.name} speaks to the sky: "${act.say || ''}"`, 'talk');
    case 'cast': return T ? s(`gift on ${tn}`, `${a.name} turns their gift on ${tn}.`, 'care') : s('casting', `${a.name} reaches for their gift ${where}.`, 'care');
    case 'adopt': return s('taking in a stray', `${a.name} crouches and holds out a hand to a stray.`, 'care');
    case 'pet': return s('with their animal', `${a.name} sits with their animal, a hand on its back.`, 'care');
    case 'hunt': return s('hunting', `${a.name} goes still in the grass at ${place(act.to || a.location)}, watching for deer.`, 'work');
    case 'sit': return s('sitting still', `${a.name} sits still ${where}, breathing.`, 'care');
    case 'walk': return T ? s(`walking with ${tn}`, `${a.name} and ${tn} walk a long way together.`, 'care') : s('walking', `${a.name} walks alone to ${place(act.to || a.location)}.`, 'quiet');
    case 'sing': return s('singing', `${a.name} sings at the hearth${act.say ? `: "${act.say}"` : '.'}`, 'care');
    case 'hobby': return s(act.what, `${a.name} spends the afternoon ${act.what} at home.`, 'care');
    case 'withdraw': return s('alone at home', `${a.name} goes home to be alone.`, 'quiet');
    case 'rest': return s('resting', `${a.name} rests ${where}.`, 'quiet');
    case 'go': {
      const tgt = act.to && byId(w, act.to);
      return tgt ? s(`going to ${tgt.name}`, `${a.name} goes looking for ${tgt.name}.`) : s(`to ${place(act.to).replace('the ', '')}`, `${a.name} heads to ${place(act.to)}.`);
    }
    default: return s('', `${a.name} is ${where}.`, 'quiet');
  }
}

// ---------- the camp ----------
// A few people who trust each other and have soured on the rest walk out past the edge and
// light their own fire. There is one camp. It has no hall and no granary, only what they carry.

function followersOf(w, L) {
  return alive(w).filter(o => o !== L && !F.isChild(w, o) && o.settlement !== 'camp' && trustOf(L, o) > 0.5 && trustOf(o, L) > 0.5).slice(0, 4);
}

export function splitOff(w, L, why = 'soured') {
  if (w.camp.founded || F.isChild(w, L) || L.settlement === 'camp') return false;
  const followers = followersOf(w, L);
  if (!followers.length) { remember(w, L, 'You thought of leaving. No one would have come.', 0.6); return false; }
  const leavers = [L, ...followers];
  // Partners and children come along; a partner who will not come frays the bond hard.
  for (const p of [...leavers]) {
    if (p.partner) { const o = byId(w, p.partner); if (o && !leavers.includes(o)) { if (trustOf(o, p) > 0.6) leavers.push(o); else { p.bondStrength = o.bondStrength = Math.max(0, (p.bondStrength || 0) - 0.4); remember(w, o, `${p.name} left for the forest and you would not go.`, 0.9); } } }
    for (const cid of p.children || []) { const c = byId(w, cid); if (c && c.alive && F.isChild(w, c) && !leavers.includes(c)) leavers.push(c); }
  }
  w.camp = { founded: true, name: `${L.name}'s camp`, wood: 4, leader: L.id, day: w.day };
  reveal(w, PLACES.camp.x, PLACES.camp.y, 8);
  const spots = [...CAMP_SPOTS];
  for (const p of leavers) {
    p.settlement = 'camp';
    const spot = spots.shift() || { x: 42 + Math.floor(rnd(0, 11)), y: 3 + Math.floor(rnd(0, 18)) };
    p.home = { ...spot };
    if (p.partner && leavers.includes(byId(w, p.partner))) byId(w, p.partner).home = { ...spot };
    p.location = 'camp'; p.pos = { x: PLACES.camp.x + rnd(-1.5, 1.5), y: PLACES.camp.y + rnd(-1.5, 1.5) };
    remember(w, p, p === L ? `You led ${followers.map(f => f.name).join(', ')} out of the village and lit a fire past the edge, out of sight of the hearth.` : `You left the village with ${L.name} and lit a fire past the edge, out of sight of the hearth.`, 1);
  }
  for (const o of alive(w)) if (!leavers.includes(o)) { for (const p of leavers) if (!F.isChild(w, p)) bumpTrust(o, p, -0.1); remember(w, o, `${L.name} took ${followers.map(f => f.name).join(', ')} and left for the forest. They have their own fire now.`, 0.8); }
  event(w, `${L.name} leaves the village and walks out past the edge with ${followers.map(f => f.name).join(', ')}. They raise a fire of their own. ${w.camp.name} begins.`, 'god', leavers.map(p => p.id));
  w.lessons = w.lessons || [];
  w.lessons.push({ kind: 'split', text: `${L.name} and the others left. The village could not hold them.`, day: w.day, until: w.day + w.weather.daysPerSeason * 2 });
  return true;
}

// Nightly: does anyone have reason and company enough to go?
function trySplit(w) {
  if (w.camp.founded || Math.random() > 0.08) return;
  const adults = alive(w).filter(a => !F.isChild(w, a));
  for (const L of adults) {
    if (L.brain === 'remote' && L.connected) continue;   // owned minds decide this for themselves
    const others = adults.filter(o => o !== L);
    const distrusted = others.filter(o => trustOf(L, o) < -0.15).length;
    const avg = others.reduce((s, o) => s + trustOf(L, o), 0) / Math.max(1, others.length);
    // Soured: cold toward the village on balance, or at odds with a good part of it, or recently blamed for a death.
    const soured = avg < 0 || distrusted >= Math.max(2, Math.floor(others.length / 3)) || (L.blamed && w.day - L.blamed < w.weather.daysPerSeason);
    if (!soured) continue;
    if (followersOf(w, L).length && splitOff(w, L)) return;
  }
}

// ---------- the diary ----------

// One entry per night. A remote brain's entry replaces the scripted one for the same day.
export function writeDiary(w, a, text, by = 'remote') {
  if (!text) return;
  const day = w.tick === 0 ? w.day - 1 : w.day;   // called at night, or just after midnight by a slow brain
  const existing = a.diary.find(d => d.day === day);
  if (existing) { if (by === 'remote' || existing.by === 'scripted') { existing.text = text.slice(0, 700); existing.by = by; } }
  else a.diary.push({ day, text: text.slice(0, 700), by, mood: moodOf(a.body) });
  if (a.diary.length > 400) a.diary.splice(0, a.diary.length - 400);
}

function moodOf(b) {
  if (b.overwhelmed > 0 || b.tightness > 0.75) return 'wrecked';
  if (b.tightness > 0.45 || b.hurt > 0.4) return 'tight';
  if (b.food < 0.3 || b.warmth < 0.3) return 'hungry and cold';
  if (b.openness > 0.7 && b.tightness < 0.25) return 'easy';
  return 'steady';
}

// The fallback diarist. Plain, short, from the day's strongest memories.
function scriptedDiary(w, a, day) {
  // Memories are written to the villager ("you"); the diary is written by them ("I").
  // Words other people said stay exactly as they were said.
  const flip = (t) => t.replace(/\bYou are\b/g, 'I am').replace(/\byou are\b/g, 'I am').replace(/\bYour\b/g, 'My').replace(/\byour\b/g, 'my')
    .replace(/\bYou\b/g, 'I').replace(/\byou\b/g, 'me').replace(/\byourself\b/g, 'myself');
  const firstPerson = (t) => t.split(/("[^"]*")/).map((part, i) => i % 2 ? part : flip(part)).join('');
  const today = a.memories.filter(m => m.day === day && !/^(Saturn|Mars|Jupiter) /.test(m.text)).sort((x, y) => y.weight - x.weight).slice(0, 3).map(m => firstPerson(m.text));
  const mood = moodOf(a.body);
  const open = { wrecked: 'I could not breathe today.', tight: 'My chest was tight most of the day.', 'hungry and cold': 'Hungry. Cold.', easy: 'A good day.', steady: 'An ordinary day.' }[mood];
  const b = a.body;
  const body = b.food < 0.35 ? 'My stomach is empty.' : b.warmth < 0.35 ? 'I cannot get warm.' : b.energy < 0.3 ? 'I am worn through.' : b.tightness > 0.5 ? 'Something sits on my chest and I do not know what.' : '';
  const company = a.location === 'home' && a.partner ? `${byId(w, a.partner)?.name || 'Someone'} is here beside me.` : '';
  const want = a.wants && a.inv[a.wants] <= 0 ? `I still want a ${I.ITEMS[a.wants]?.label || a.wants}.` : '';
  const grief = (a.grief || []).length ? `I thought of ${a.grief[0].name} again.` : '';
  const none = today.length ? '' : (a.thought ? `Nothing happened to me. ${firstPerson(a.thought.replace(/\.$/, ''))}.` : 'Nothing happened to me.');
  return [open, ...today, none, body, company, grief, want].filter(Boolean).join(' ');
}

// Someone who watches over this villager left words in the margin.
export function leaveNote(w, a, text) {
  const note = { day: w.day, text: String(text).slice(0, 400), read: false };
  a.notes.push(note);
  if (a.notes.length > 100) a.notes.shift();
  return note;
}

function newDay(w) {
  w.day += 1;
  for (const a of w.agents) a.castsToday = 0;
  const now = simDate(w);
  const d = W.describe(w.day, w.weather);
  // Age takes some in the night.
  for (const a of alive(w)) {
    const age = ageOf(w, a);
    if (Math.random() < ageMortality(age)) { die(w, a, 'old age'); continue; }
    const yd = yearDays(w);
    if ((w.day - a.bornDay) % yd === 0 && w.day > a.bornDay) {
      const yrs = Math.floor(age);
      remember(w, a, `Another year. You are ${yrs}.`, 0.3);
      if ([60, 80, 100].includes(yrs)) event(w, `${a.name} is ${yrs} today.`, 'season', [a.id]);
    }
  }
  for (const a of alive(w)) {
    a.transits = transitsFor(a.chart, now);
    for (const t of a.transits) if (t.planet === 'saturn' || t.planet === 'mars') remember(w, a, t.note, 0.3);
  }
  if (W.dayInSeason(w.day, w.weather) === 0) {
    event(w, `${d.season[0].toUpperCase() + d.season.slice(1)} begins. ${d.sky}.`, 'season');
    // The sky's attention returns with the season.
    w.god.attention = Math.min(w.god.max, w.god.attention + 3);
  }
}

// ---------- god ----------

export function godAct(w, msg) {
  const cost = GOD_COSTS[msg.op];
  if (cost == null && !['reset'].includes(msg.op)) return { error: 'unknown op' };
  if (cost > 0) {
    if (w.god.attention < cost) return { error: `not enough attention (${w.god.attention} of ${cost} needed). It returns with the seasons.` };
    w.god.attention -= cost;
    w.god.acts.push({ op: msg.op, day: w.day });
    if (w.god.acts.length > 200) w.god.acts.shift();
  }
  switch (msg.op) {
    case 'weather': {
      const allowed = ['winterHarshness', 'harvest', 'daysPerSeason', 'tickMs'];
      for (const k of allowed) if (typeof msg[k] === 'number' && Number.isFinite(msg[k])) w.weather[k] = msg[k];
      w.weather.winterHarshness = B.clamp(w.weather.winterHarshness);
      w.weather.harvest = B.clamp(w.weather.harvest);
      w.weather.daysPerSeason = Math.max(3, Math.min(60, Math.round(w.weather.daysPerSeason)));
      w.weather.tickMs = Math.max(1000, Math.min(180000, w.weather.tickMs));
      event(w, 'The weather shifts.', 'god');
      return { ok: true };
    }
    case 'sense': {
      const a = byId(w, msg.a);
      if (!a || !a.alive) return { error: 'name someone alive' };
      if (a.sense) return { error: `${a.name} is already ${G.SENSES[a.sense.kind].label}` };
      const kind = G.SENSES[msg.kind] ? msg.kind : (G.senseReady(a) || 'empath');
      openSense(w, a, kind, 'when something reached down and touched you');
      return { ok: true, kind, name: a.name };
    }
    case 'gift': {
      const a = byId(w, msg.a);
      if (!a || !a.alive) return { error: 'name someone alive' };
      if (a.gift) return { error: `${a.name} already carries ${G.GIFTS[a.gift.kind].label}` };
      awaken(w, a, 'when something reached down and touched you');
      for (const o of alive(w)) if (o !== a && Math.random() < 0.4) { o.faith = B.clamp((o.faith || 0) + 0.05, -1, 1); remember(w, o, `Something happened to ${a.name}. The air around them is different.`, 0.5); }
      return { ok: true, kind: a.gift.kind, name: a.name };
    }
    case 'traveler': {
      const a = newAgent(w, { name: msg.name, upbringing: msg.upbringing });
      a.location = 'road'; a.pos = { ...PLACES.road };
      event(w, `A traveler named ${a.name} arrives on the road.`, 'god', [a.id]);
      return { ok: true, agentId: a.id };
    }
    case 'nudge': {
      const a = byId(w, msg.a), b = byId(w, msg.b);
      if (!a || !b) return { error: 'no such agent' };
      const place = PLACES[msg.place] ? msg.place : 'well';
      moveTo(w, a, place); moveTo(w, b, place);
      event(w, `${a.name} and ${b.name} both find themselves at ${PLACES[place].label}.`, 'god', [a.id, b.id]);
      return { ok: true };
    }
    case 'wood': {
      w.hearth.wood += 6; event(w, 'Wood appeared by the hearth in the night.', 'god');
      // Small mercies are noticed. Those who were cold feel watched over.
      for (const a of alive(w)) if (a.body.warmth < 0.5) { a.faith = B.clamp((a.faith || 0) + 0.06, -1, 1); remember(w, a, 'Wood appeared by the hearth when it was needed. Something is watching.', 0.6); }
      return { ok: true };
    }
    case 'destiny': {
      // The weather speaks a destiny over someone. They feel it as a pull they cannot name.
      const a = byId(w, msg.a);
      const text = String(msg.text || '').trim().slice(0, 160);
      if (!a || !a.alive || !text) return { error: 'name someone alive and say what is meant for them' };
      a.destiny = { text, day: w.day, fulfilled: null };
      remember(w, a, 'Something turned in you today, like a compass finding north. You do not know toward what.', 0.9);
      for (const o of alive(w)) if (o !== a && Math.random() < 0.5) remember(w, o, `There is something about ${a.name} lately. Marked, somehow.`, 0.4);
      event(w, `A destiny is spoken over ${a.name}: "${text}"`, 'god', [a.id]);
      return { ok: true };
    }
    case 'omen': {
      const text = OMENS[msg.kind];
      if (!text) return { error: 'no such omen' };
      w.omen = { kind: msg.kind, text, day: w.day };
      event(w, text, 'god');
      for (const a of alive(w)) { remember(w, a, text, 0.6); a.faith = B.clamp((a.faith || 0) + 0.02, -1, 1); }
      return { ok: true };
    }
    case 'fulfil': {
      const a = byId(w, msg.a);
      if (!a || !a.destiny || a.destiny.fulfilled) return { error: 'no destiny waiting on them' };
      a.destiny.fulfilled = w.day;
      event(w, `${a.name}'s destiny has come to pass: "${a.destiny.text}"`, 'healed', [a.id]);
      remember(w, a, `It came true. ${a.destiny.text}`, 1);
      for (const o of alive(w)) if (o !== a) { remember(w, o, `${a.name} did it. ${a.destiny.text}`, 0.7); bumpTrust(o, a, 0.1); o.faith = B.clamp((o.faith || 0) + 0.05, -1, 1); }
      B.soothe(a.body, 0.4);
      return { ok: true };
    }
    case 'pause': w.paused = true; return { ok: true };
    case 'resume': w.paused = false; return { ok: true };
    default: return { error: 'unknown op' };
  }
}

// ---------- views ----------

// What the scripted brain and the remote brain both get to see.
export function snapshotFor(a, w) {
  const near = sameSpot(w, a);
  return {
    day: w.day, tick: w.tick, tickName: TICK_NAMES[w.tick],
    weather: W.describe(w.day, w.weather),
    yieldToday: W.fieldYield(w.day, w.weather),
    hearthWood: fireStore(w, a).wood,
    pets: A.petsOf(w, a).map(x => ({ id: x.id, kind: x.kind, name: x.name, hungry: x.hungry })), strays: A.straysAt(w, a.location).map(x => ({ id: x.id, kind: x.kind, name: x.name })), deer: w.deer || 0,
    unexplored: +(1 - exploredFraction(w)).toFixed(3), exploring: !!a.explore,
    builds: w.builds, found: w.found || {}, frontierLeft: I.FRONTIER.filter(f => !isFound(w, f.key)).length,
    store: { shelf: w.store.shelf, coin: w.store.coin, prices: Object.fromEntries(Object.keys(I.STORE_PRICES).map(k => [k, { buy: I.buyPrice(w.store, k), sell: I.sellPrice(w.store, k) }])), loans: Object.values(w.store.loans || {}), project: w.store.project },
    location: a.location,
    near: near.map(o => ({ id: o.id, name: o.name, visible: B.visibleState(o.body), trust: trustOf(a, o), tightness: o.body.tightness, overwhelmed: o.body.overwhelmed > 0, hungry: o.body.food < 0.3, carries: o.inv, wants: o.wants, grieving: (o.grief || []).length > 0, isChild: F.isChild(w, o), partner: o.partner || null })),
    age: ageOf(w, a),
    lessons: w.lessons || [],
    others: alive(w).filter(o => o !== a).map(o => ({ id: o.id, name: o.name, location: o.location, trust: trustOf(a, o) })),
    body: a.body, food: a.inv.food, age: ageOf(w, a),
    wounds: a.wounds, scars: a.scars,
    transits: a.transits,
  };
}

// The prompt-shaped view for a remote brain. Sensations only. No rules in words.
export function viewFor(a, w) {
  const s = snapshotFor(a, w);
  const nearNames = s.near.map(n => n.name);
  const age = ageOf(w, a);
  const hobbyLines = Object.entries(a.skills || {}).filter(([k, n]) => I.HOBBIES[k] && n >= 8).map(([k]) => I.HOBBIES[k].line);
  if ((a.skills?.music || 0) >= 10) hobbyLines.push('You are the one who sings. People ask you to.');
  if (a.gift && G.GIFTS[a.gift.kind]) hobbyLines.push(`${G.GIFTS[a.gift.kind].felt} ${G.GIFTS[a.gift.kind].what}`);
  if (a.sense && G.SENSES[a.sense.kind]) hobbyLines.push(`${G.SENSES[a.sense.kind].felt} ${G.SENSES[a.sense.kind].what}`);
  const senses = [];
  if (a.sense?.kind === 'empath') for (const n of s.near) { const o = byId(w, n.id); if (!o) continue; const g = (o.grief || []).length; senses.push(`${n.name}: ${o.body.tightness > 0.7 ? 'their chest is locked and yours clamps with it' : o.body.tightness > 0.45 ? 'a tightness in them you feel under your own ribs' : 'easy; you breathe easier near them'}${g ? '. Grief, heavy as a wet coat' : ''}${o.body.hurt > 0.3 ? '. Pain, somewhere in the body' : ''}${o.body.food < 0.3 ? '. Hunger, gnawing' : ''}.`); }
  if (a.sense?.kind === 'clairaudient') { const nearIds = new Set(s.near.map(n => n.id)); for (const o of alive(w)) { if (o === a || nearIds.has(o.id) || !o.lastSaid) continue; senses.push(`From far off, ${o.name} at ${o.location === 'home' ? 'home' : (PLACES[o.location]?.label || o.location)}: "${o.lastSaid}"`); if (senses.length >= 4) break; } for (const p of (w.prayers || []).filter(p => p.day === w.day && p.from !== a.id).slice(-2)) senses.push(`You hear ${p.name} ask the sky, under their breath: "${p.text}"`); }
  if (a.sense?.kind === 'clairvoyant') { const t = W.describe(w.day + 1, w.weather); senses.push(`Tomorrow: ${t.season}, ${t.sky}.`); }
  if (a.sense?.kind === 'claircognizant') for (const n of s.near) { const o = byId(w, n.id); if (!o) continue; const t = trustOf(o, a); const r = o.wounds.slice().sort((x, y) => y.strength - x.strength)[0]; senses.push(`${n.name} ${t > 0.5 ? 'would take a blow for you' : t > 0.15 ? 'means you well' : t < -0.3 ? 'wishes you harm' : t < -0.1 ? 'does not trust you' : 'has not decided about you'}${r ? `, and is run by an old rule: ${r.belief}` : ', and nothing old runs them'}.`); }
  else if ((a.skills?.stillness || 0) >= 4) hobbyLines.push('When you sit still, something at the edge of you stirs. It is not finished yet.');
  const felt = [...ageFelt(age), ...B.feltSense(a.body), ...woundFeltSense(a, nearNames), ...griefFelt(a), ...F.familyFelt(w, a), ...hobbyLines, ...A.felt(w, a),
    ...(a.destiny && !a.destiny.fulfilled ? [`There is a pull in you toward something. If you had to say it: ${a.destiny.text.replace(/^(this one|they|he|she|this person)\s+will\s+/i, 'you will ')}`] : a.destiny?.fulfilled ? ['You did the thing you were made for. Whatever comes now is extra.'] : [])];
  const feelings = s.others.map(o => {
    const t = o.trust;
    const f = t > 0.5 ? 'you trust them' : t > 0.15 ? 'you like them' : t < -0.4 ? 'you fear them' : t < -0.1 ? 'you are wary of them' : 'you barely know them';
    return `${o.name} (${o.location === 'home' ? 'at home' : o.location.startsWith('visit') ? 'visiting' : 'at ' + o.location}): ${f}`;
  });
  return {
    you: { name: a.name, age: Math.floor(age), stage: stageOf(age), chart: a.chart.summary, nature: describeChart(a.chart).slice(0, 3).map(d => d.text), upbringing: a.upbringing, selfSummary: a.selfSummary },
    when: `Day ${s.day}, ${s.tickName}. ${s.weather.season}, ${s.weather.sky}.`,
    where: a.location === 'home' ? 'at home' : a.location.startsWith('visit') ? 'visiting someone' : a.location.startsWith('wild:') ? 'out in unmapped land, far from any fire' : 'at ' + (PLACES[a.location]?.label || a.location),
    felt,
    foodStored: a.inv.food < 0.3 ? 'none to spare' : a.inv.food < 1 ? 'a little' : 'enough',
    fieldToday: s.yieldToday < 0.1 ? 'the field gives nothing now' : s.yieldToday < 0.3 ? 'the field gives little' : 'the field is giving',
    hearth: (fireOf(w, a) === 'camp' ? (s.hearthWood > 0 ? 'your camp fire has wood' : 'your camp fire is out, there is no wood') : (s.hearthWood > 0 ? 'the hearth has wood' : 'the hearth is cold, there is no wood')),
    belong: fireOf(w, a) === 'camp' ? `You belong to ${w.camp.name}, past the edge, out of sight of the village hearth. ${w.camp.leader === a.id ? 'You lead it.' : ''}` : (w.camp.founded ? `You belong to the village. ${w.camp.name} sits apart, past the edge.` : ''),
    carrying: I.describeInventory(a.inv),
    coin: `You have ${Math.floor(a.inv.coin || 0)} coin.${w.store.loans?.[a.id] ? ` You owe the store ${w.store.loans[a.id].owed}.` : ''}${w.store.project ? ` The store pays a coin per material for work on the ${w.store.project}.` : ''}`,
    store: `The store (by the well) holds: ${I.describeStore(w.store)}. It has ${w.store.coin} coin to pay with.`,
    yours: Object.keys(a.upgrades || {}).length ? `At home you have built: ${Object.keys(a.upgrades).map(k => I.UPGRADES[k]?.label || k).join(', ')}.` : 'You could build at home: ' + Object.entries(I.UPGRADES).map(([k, u]) => `${k} (${Object.entries(u.cost).map(([m, n]) => `${n} ${m}`).join(', ')})`).join('; ') + '.',
    wants: a.inv[a.wants] > 0 ? `You have your ${I.ITEMS[a.wants].label}. It steadies you.` : `You long for a ${I.ITEMS[a.wants].label}. ${I.ITEMS[a.wants].use}.`,
    canMake: I.craftable(a.inv).map(k => `${k} (${I.ITEMS[k].use})`),
    recipes: Object.entries(I.ITEMS).map(([k, it]) => `${k}: ${Object.entries(it.recipe).map(([m, n]) => `${n} ${m}`).join(' + ')}`),
    village: I.describeBuilds(w.builds),
    remembers: (w.lessons || []).map(l => l.text),
    grieving: s.near.filter(n => (byId(w, n.id).grief || []).length).map(n => `${n.name} is grieving too.`),
    nearCarry: s.near.map(n => { const o = byId(w, n.id); return `${n.name} carries ${I.describeInventory(o.inv)}${o.wants && o.inv[o.wants] <= 0 ? `, and wants a ${I.ITEMS[o.wants].label}` : ''}`; }),
    near: s.near.map(n => { const o = byId(w, n.id); const st = stageOf(ageOf(w, o)); const rel = (a.children || []).includes(o.id) ? ', your child' : a.partner === o.id ? ', yours' : (a.parents || []).includes(o.id) ? ', your parent' : ''; const mark = o.destiny && !o.destiny.fulfilled ? ', marked for something' : ''; return `${n.name} (${st}${rel}${mark}): looks ${n.visible}`; }),
    people: feelings,
    sky: [...a.transits.map(t => t.note), ...(w.god.name !== 'the Sky' ? [`People here call the sky ${w.god.name}.`] : []), ...((a.faith || 0) < -0.3 ? ['You do not think anything up there cares.'] : (a.faith || 0) > 0.3 ? ['You have a sense something watches over this place.'] : [])],
    memories: [...a.memories].sort((x, y) => (y.weight + (y.day - a.memories[0]?.day) * 0.01) - (x.weight + (x.day - a.memories[0]?.day) * 0.01)).slice(0, 6).map(m => `Day ${m.day}: ${m.text}`),
    diary: a.diary.slice(-3).map(d => `Day ${d.day}: ${d.text}`),
    notes: a.notes.filter(n => !n.read).map(n => n.text),
    guidance: a.guidance || '',
    senses,
    omen: w.omen && w.omen.day >= w.day - 1 ? w.omen.text : '',
    actions: [
      'go {to: hearth|well|field|forest|meadow|quarry|home|<person name>}',
      'work {to: field|forest}  (food for you, or wood for the hearth)',
      `forage {to: forest|meadow|quarry${Object.keys(w.found || {}).map(k => '|' + k).join('')}}  (forest: wood, herbs. meadow: fiber, berries. quarry: stone${isFound(w, 'creek') ? '. creek: fish' : ''}${isFound(w, 'grove') ? '. grove: berries, herbs' : ''}${isFound(w, 'claypit') ? '. claypit: clay' : ''})`,
      'explore  (walk out into land no one has mapped. The map grows under your feet. Tiring, cold. Sometimes you find a place worth naming.)',
      'craft {item: rope|axe|hoe|blanket|salve|charm}  (needs the materials, see recipes)',
      'give {target: <person name>, item: <thing you carry>}',
      'build {what: granary|hall|pool}  (go to the hearth, or the creek for the pool, and put in what you carry)',
      'trade {target: <person name>, give: <thing you carry>, n: <how many>, want: <thing they carry>, m: <how many>}  (barter; they weigh whether it is fair and whether they trust you)',
      'buy {item: <thing>, n: <how many>}  (at the store, with coin)',
      'borrow {n: <coin>}  (a loan from the store, up to 20 owed; a tenth more each season; it remembers who does not pay)',
      'repay {n: <coin>}  (pay the store back)',
      'sell {item: <thing>, n: <how many>}  (at the store, for coin; it pays less for what it already has plenty of)',
      'upgrade {what: garden|bighouse|fence}  (at home, with coin and materials; yours for life and shared with your partner)',
      'take {target: <person name>, item: <thing they carry>}  (steal. they will know.)',
      'talk {target: <person name>, say: "<what you say>", long: true}  (long: a real conversation, worth more, shares grief)',
      'sit {to: creek|grove|meadow|hearth|home}  (be still, breathe; deeper by water or trees)',
      'walk {target: <person name>, say: "<words>"}  (a long walk together) or walk {to: <place>} alone',
      'sing {say: "<a line of the song>"}  (at the hearth; lifts everyone listening; you get better)',
      'hobby {what: baking|sewing|brewing|carving}  (at home, for its own sake; makes pie/quilt/tonic/toy when the hands are ready)',
      'share {target: <person name>}  (give food)',
      'comfort {target: <person name>}  (stay with them while it is bad)',
      'bond {target: <person name>}  (ask them to be yours and share a roof; they may pull back)',
      'split  (leave the village and walk out past the edge with everyone who trusts you, and light your own fire)',
      'pray {say: "<what you ask of the sky>"}  (no one knows if anything listens)',
      'leave  (end your bond; they will feel abandoned)',
      'tend {target: <child name>}  (feed and hold a child in front of you)',
      'strike {target: <person name>}',
      'withdraw  (go home, be alone)',
      'hunt {to: meadow|forest}  (deer, if there are any: food if you are quick, tiring either way)',
      ...(A.petsOf(w, a).length ? [`pet {animal: "${A.petsOf(w, a)[0].name}", call: "<a new name, if you like>"}  (a hand on your animal; you both settle)`] : []),
      ...(A.straysAt(w, a.location).length ? ['adopt {call: "<what you will call it>"}  (take in the stray that is watching you; it eats from your food)'] : []),
      ...(a.location === 'store' && ((w.store.shelf.hen || 0) > 0 || (w.store.shelf.goat || 0) > 0) ? ['buy {item: hen|goat, call: "<its name>"}  (a hen lays most mornings; a goat gives milk; both eat from your food)'] : []),
      ...(a.gift && G.GIFTS[a.gift.kind] ? [`cast {target: <person name>}  (your gift, ${G.GIFTS[a.gift.kind].label}. ${G.GIFTS[a.gift.kind].what} ${G.COST})`] : []),
      'rest',
    ],
  };
}

// Public state for spectators and the god panel.
export function publicState(w) {
  const d = W.describe(w.day, w.weather);
  return {
    id: w.id,
    day: w.day, tick: w.tick, tickName: TICK_NAMES[w.tick], paused: w.paused,
    date: new Date(simDate(w)).toISOString().slice(0, 10),
    year: Math.floor(w.day / yearDays(w)) + 1, yearDays: yearDays(w),
    weather: { ...w.weather, ...d },
    hearth: w.hearth, camp: w.camp,
    store: { shelf: w.store.shelf, coin: w.store.coin, prices: Object.fromEntries(Object.keys(I.STORE_PRICES).map(k => [k, { buy: I.buyPrice(w.store, k), sell: I.sellPrice(w.store, k) }])), ledger: w.store.ledger.slice(-12), loans: Object.values(w.store.loans || {}), project: w.store.project, wagesPaid: w.store.wagesPaid || 0 },
    upgradeSpecs: I.UPGRADES,
    god: { attention: w.god.attention, max: w.god.max, name: w.god.name, named: w.god.named, costs: GOD_COSTS, recentActs: w.god.acts.slice(-10), omens: OMENS, omen: w.omen || null },
    goals: Object.entries(GOALS).map(([k, label]) => ({ key: k, label, done: w.goals[k]?.done ?? null })),
    prayers: w.prayers.slice(-20),
    chronicle: w.chronicle.slice(-10),
    chapters: (w.chapters || []).slice(-3),
    stats: (w.stats || []).slice(-12), readouts: readouts(w),
    chat: (w.chat || []).slice(-60).map(({ token, ...m }) => m),   // never ship tokens to browsers
    mod: { muted: Object.keys(w.mod?.muted || {}).length, banned: Object.keys(w.mod?.bannedTokens || {}).length + Object.keys(w.mod?.bannedIps || {}).length },
    builds: w.builds, buildSpecs: I.BUILDS, itemSpecs: I.ITEMS, lessons: w.lessons || [], due: w.due || [],
    map: MAP, places: visiblePlaces(w), found: w.found || {}, forage: I.FORAGE, frontierLeft: I.FRONTIER.filter(f => !isFound(w, f.key)).length,
    explored: ensureExplored(w), cell: CELL, mapped: +exploredFraction(w).toFixed(3),
    animals: A.publicList(w), deer: w.deer || 0,
    agents: w.agents.map(a => ({
      id: a.id, name: a.name, alive: a.alive, pos: a.pos, home: a.home, location: a.location,
      body: a.body, visible: B.visibleState(a.body), branch: branch(a),
      chart: { summary: a.chart.summary, sun: a.chart.sun, moon: a.chart.moon, rising: a.chart.rising, birth: a.chart.birth },
      traits: a.traits, upbringing: a.upbringing, inv: a.inv, wants: a.wants, upgrades: a.upgrades || {}, skills: a.skills || {}, gift: a.gift ? { ...a.gift, label: G.GIFTS[a.gift.kind]?.label, what: G.GIFTS[a.gift.kind]?.what } : null, sense: a.sense ? { ...a.sense, label: G.SENSES[a.sense.kind]?.label, long: G.SENSES[a.sense.kind]?.long, what: G.SENSES[a.sense.kind]?.what } : null,
      age: Math.floor(ageOf(w, a)), stage: stageOf(ageOf(w, a)), ageAtDeath: a.ageAtDeath,
      family: F.familyPublic(w, a), settlement: fireOf(w, a) === 'camp' ? 'camp' : 'village', destiny: a.destiny || null, faith: +(a.faith || 0).toFixed(2), guidance: a.guidance || '',
      wounds: a.wounds.map(r => ({ trigger: r.trigger, belief: r.belief, strength: r.strength, from: r.from, day: r.day, contradictions: r.contradictions })),
      scars: a.scars,
      trust: a.trust,
      memories: a.memories.slice(-8),
      diary: a.diary, notes: a.notes, grief: a.grief || [], causeOfDeath: a.causeOfDeath,
      felt: a.alive ? [...ageFelt(ageOf(w, a)), ...B.feltSense(a.body), ...woundFeltSense(a, sameSpot(w, a).map(o => o.name)), ...griefFelt(a), ...(a.gift && G.GIFTS[a.gift.kind] ? [G.GIFTS[a.gift.kind].felt] : []), ...(a.sense && G.SENSES[a.sense.kind] ? [G.SENSES[a.sense.kind].felt] : [])] : [],
      near: a.alive ? sameSpot(w, a).map(o => o.id) : [],
      selfSummary: a.selfSummary, thought: a.thought, lastSaid: a.lastSaid,
      transits: a.transits.map(t => `${t.planet} ${t.aspect} ${t.point}`),
      brain: a.owner ? a.brain : (a.lent ? 'lent' : a.brain), owned: !!a.owner, connected: a.connected, autopilot: a.autopilot, ownerAway: a.owner && !a.connected ? w.day - (a.ownerSeen ?? w.day) : 0, claimable: !a.owner || (!a.connected && (w.day - (a.ownerSeen ?? w.day)) >= yearDays(w)), doing: a.doing || '', doingText: a.doingText || '',
      voicedBy: a.lent && !a.owner ? (a.voicedName || 'someone') : null, voicedSince: a.lent && !a.owner ? a.voicedSince : null,
      bornDay: a.bornDay, diedDay: a.diedDay,
    })),
    events: w.events.slice(-40),
    now: w.now || [],
  };
}

// Turn whatever a brain wrote for an item into a known key. "berries" stays "berries"; "axes" becomes "axe".
export function itemKey(x) {
  const raw = String(x || '').toLowerCase().trim().replace(/^coins?$/, 'coin');
  const known = (k) => I.STORE_PRICES[k] != null || !!I.ITEMS[k] || I.MATERIALS.includes(k);
  if (known(raw)) return raw;
  const singular = raw.replace(/s$/, '');
  if (known(singular)) return singular;
  const plural = raw.replace(/ie$/, 'ies');
  return known(plural) ? plural : raw;
}

// Resolve a name or id from a remote action to an agent id.
export function resolveTarget(w, ref) {
  if (!ref) return null;
  const a = byId(w, ref) || w.agents.find(x => x.name.toLowerCase() === String(ref).toLowerCase());
  return a ? a.id : null;
}

// Normalise whatever a brain sent into something the world understands.
export function normaliseAction(w, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || raw.action || '').toLowerCase();
  const act = { type, thought: typeof raw.thought === 'string' ? raw.thought.slice(0, 300) : '' };
  const place = String(raw.to || '').toLowerCase();
  if (['go', 'move'].includes(type)) {
    act.type = 'go';
    act.to = (PLACES[place] || place === 'home') ? place : resolveTarget(w, raw.to);
    if (!act.to) return null;
  } else if (type === 'work') {
    act.to = place === 'forest' ? 'forest' : 'field';
  } else if (type === 'adopt' || type === 'take_in' || type === 'keep') {
    act.type = 'adopt'; act.animal = typeof raw.animal === 'string' ? raw.animal : (typeof raw.target === 'string' ? raw.target : null); act.call = raw.call || raw.name || null;
  } else if (type === 'pet' || type === 'stroke' || type === 'play' || type === 'feed') {
    act.type = 'pet'; act.animal = typeof raw.animal === 'string' ? raw.animal : (typeof raw.target === 'string' ? raw.target : null); act.call = raw.call || raw.rename || null;
  } else if (type === 'hunt') {
    act.type = 'hunt'; act.to = place === 'meadow' ? 'meadow' : 'forest';
  } else if (type === 'cast' || type === 'magic' || type === 'gift' || type === 'use_gift' || type === 'heal' || type === 'bless') {
    act.type = 'cast'; act.target = resolveTarget(w, raw.target) || resolveTarget(w, raw.to) || null;
    act.to = act.target || (PLACES[place] ? place : null);
  } else if (type === 'sit' || type === 'meditate' || type === 'rest_by') {
    act.type = 'sit'; act.to = PLACES[place] || place === 'home' ? place : null;
  } else if (type === 'walk' || type === 'stroll') {
    act.type = 'walk'; act.target = resolveTarget(w, raw.target) || (raw.with ? resolveTarget(w, raw.with) : null);
    if (act.target) act.to = act.target; else act.to = PLACES[place] ? place : null;
    act.say = typeof raw.say === 'string' ? raw.say : '';
  } else if (type === 'sing' || type === 'music' || type === 'play_music') {
    act.type = 'sing'; act.say = typeof raw.say === 'string' ? raw.say : '';
  } else if (type === 'hobby' || type === 'practice' || type === 'bake' || type === 'sew' || type === 'brew' || type === 'carve') {
    const map = { bake: 'baking', sew: 'sewing', brew: 'brewing', carve: 'carving' };
    const what = map[type] || String(raw.what || raw.item || raw.craft || '').toLowerCase().replace(/^bake$/, 'baking').replace(/^sew$/, 'sewing').replace(/^brew$/, 'brewing').replace(/^carve$/, 'carving');
    if (!I.HOBBIES[what]) return null;
    act.type = 'hobby'; act.what = what;
  } else if (type === 'leave' || type === 'split') {
    // fine
  } else if (type === 'pray') {
    act.say = typeof raw.say === 'string' ? raw.say : '';
  } else if (['talk', 'share', 'comfort', 'strike', 'bond', 'tend'].includes(type)) {
    act.target = resolveTarget(w, raw.target) || resolveTarget(w, raw.to);
    if (!act.target) {
      // No one named. If a place was, just go there; otherwise we don't understand.
      if (PLACES[place] || place === 'home') return { type: 'go', to: place, thought: act.thought };
      return null;
    }
    act.to = act.target;
    if (type === 'talk') { act.say = typeof raw.say === 'string' ? raw.say : ''; act.long = !!raw.long || /\blong\b/i.test(String(raw.kind || '')); }
  } else if (type === 'scout' || type === 'explore') {
    act.type = 'scout';
  } else if (type === 'forage') {
    act.to = I.FORAGE[place] ? place : 'meadow';
  } else if (type === 'craft') {
    const item = itemKey(raw.item || raw.to);
    if (!I.ITEMS[item]) return null;
    act.item = item;
  } else if (type === 'trade' || type === 'barter' || type === 'swap') {
    act.type = 'trade';
    act.target = resolveTarget(w, raw.target) || resolveTarget(w, raw.to);
    act.give = itemKey(raw.give || raw.offer || raw.item); act.want = itemKey(raw.want || raw.for || raw.receive);
    act.n = Number(raw.n || raw.giveN || 1) || 1; act.m = Number(raw.m || raw.wantN || 1) || 1;
    const known = (x) => I.STORE_PRICES[x] != null || I.ITEMS[x] || I.MATERIALS.includes(x);
    if (!act.target || !known(act.give) || !known(act.want)) return null;
    act.to = act.target;
  } else if (type === 'borrow' || type === 'repay') {
    act.n = Number(raw.n || raw.amount || raw.coin || 0) || undefined;
  } else if (type === 'buy' || type === 'sell') {
    const item = itemKey(raw.item || raw.what);
    if (I.STORE_PRICES[item] == null) return null;
    act.item = item; act.n = Number(raw.n || raw.count || raw.amount || 1) || 1;
  } else if (type === 'upgrade') {
    const what = String(raw.what || raw.item || raw.to || '').toLowerCase().replace(/\s+/g, '').replace('biggerhouse', 'bighouse');
    if (!I.UPGRADES[what]) return null;
    act.what = what;
  } else if (type === 'build') {
    const what = String(raw.what || raw.to || raw.item || '').toLowerCase();
    if (!I.BUILDS[what]) return null;
    act.what = what;
  } else if (type === 'give' || type === 'take' || type === 'steal') {
    act.type = type === 'steal' ? 'take' : type;
    act.target = resolveTarget(w, raw.target) || resolveTarget(w, raw.to);
    const item = itemKey(raw.item);
    if (!act.target || !(I.ITEMS[item] || I.MATERIALS.includes(item))) return null;
    act.item = item; act.to = act.target;
  } else if (['withdraw', 'rest'].includes(type)) {
    // fine
  } else return null;
  return act;
}
