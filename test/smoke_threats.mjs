// Headless smoke: threats roll, warn, land, season report, attention earned, end condition. Never writes data/.
import { readFileSync } from 'node:fs';
import * as World from '../server/world.js';

const seen = new Set();
function drain(w, tag) {
  for (const e of w.events) {
    const k = `${e.day}.${e.tick}.${e.text}`; if (seen.has(k)) continue; seen.add(k);
    if (/begins\.|weighed|lands\.|coming|Raiders|Wolves|drought|flood|frost|fire|sickness|cold|book|question answered|died|born/i.test(e.text) && ['season', 'god', 'death', 'wound', 'healed'].includes(e.kind)) console.log(`${tag} d${e.day} [${e.kind}] ${e.text}`);
  }
}

function runFresh() {
  const w = World.createWorld(null);
  w.weather.daysPerSeason = 8;
  w.threat = null; World; // re-roll for the short season
  // roll again with the short season via a season turn: cheat by moving to the last day of season 0
  console.log('--- fresh world, 8 days a season, 3 seasons ---');
  console.log('first threat', w.threat, 'attention', w.god.attention);
  const acts = new Map();
  let warned = false, landed = 0, reports = 0; const prep = new Set();
  for (let i = 0; i < 8 * 3 * World.TICKS_PER_DAY + 2; i++) {
    World.step(w, acts);
    if (w.threat && !w.threat.landed && !w.threat.known && w.threat.lands - w.day <= 3 && !warned) {
      const before = w.god.attention;
      const r = World.godAct(w, { op: 'warn' });
      console.log(`d${w.day} WARN ->`, r, `attention ${before} -> ${w.god.attention}`, 'readiness', w.threat.readiness);
      warned = true;
      const r2 = World.godAct(w, { op: 'warn' }); console.log('second warn ->', r2, 'attention', w.god.attention);
    }
    if (w.threat?.landed && w.threat.landed === w.day && w.tick === 1) { landed++; console.log(`d${w.day} LANDED ${w.threat.kind} readiness ${w.threat.readiness}:`, w.threat.text); }
    if ((w.reports || []).length > reports) { reports = w.reports.length; const r = w.reports.at(-1); console.log(`d${w.day} REPORT ${r.season} y${r.year} earned ${r.earned}:`, r.why.join('; '), '| attention now', w.god.attention, '| next threat', w.threat && `${w.threat.kind} lands d${w.threat.lands}`); }
    if (w.threat?.known && !w.threat.landed) for (const x of World.alive(w)) if (x.thought && /Before the cold|Wood\.|Fiber for|Salve, before|Herbs\. Everyone|Lay it by|Bring it in|in my hands|Wood for an axe|Stone does not|Not out here|Bring them in|Together, at the fire/.test(x.thought)) prep.add(x.thought);
    drain(w, 'F');
    if (w.ended) { console.log('ENDED', w.ended); break; }
  }
  // public state and a villager view render without throwing
  const ps = World.publicState(w); console.log('publicState.threat', ps.threat && { kind: ps.threat.kind, daysLeft: ps.threat.daysLeft, word: ps.threat.word }, 'reports', ps.reports.length, 'ended', ps.ended);
  const a = World.alive(w)[0]; const v = World.viewFor(a, w); console.log('felt lines mentioning coming:', v.felt.filter(x => /coming|landed|before it came/.test(x)));
  console.log('scripted prep thoughts seen while warned:', [...prep]);
  return w;
}

function runEnd() {
  console.log('--- despair path: force three untimely deaths a season, twice ---');
  const w = World.createWorld(null);
  w.weather.daysPerSeason = 6;
  const acts = new Map();
  for (let i = 0; i < 6 * 3 * World.TICKS_PER_DAY; i++) {
    World.step(w, acts);
    if (w.tick === 1 && [3, 9].includes(w.day)) w.seasonDeaths.push({ name: 'A', cause: 'hunger' }, { name: 'B', cause: 'the cold' }, { name: 'C', cause: 'injuries' });
    if ((w.reports || []).length && w.reports.at(-1).day === w.day && w.tick === 1) console.log(`d${w.day} report earned ${w.reports.at(-1).earned} despair ${w.despair} attention ${w.god.attention}`);
    if (w.ended) { console.log('ENDED', w.ended, 'paused', w.paused); break; }
  }
  if (!w.ended) console.log('did not end (deaths may not have landed in the window); despair', w.despair, 'alive', World.alive(w).length);
}

function runSaved() {
  console.log('--- migration: the laptop village in data/world.json (read only) ---');
  const saved = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url), 'utf8'));
  const w = World.createWorld(saved);
  console.log('day', w.day, 'seasonStartDay', w.seasonStartDay, 'threat', w.threat && { kind: w.threat.kind, lands: w.threat.lands, readiness: w.threat.readiness }, 'reports', (w.reports || []).length, 'alive', World.alive(w).length);
  const acts = new Map();
  for (let i = 0; i < w.weather.daysPerSeason * 2 * World.TICKS_PER_DAY; i++) { World.step(w, acts); drain(w, 'S'); if (w.ended) { console.log('ENDED', w.ended); break; } }
  console.log('after 2 seasons: day', w.day, 'reports', (w.reports || []).map(r => `${r.season} ${r.earned}`), 'threatLog', (w.threatLog || []).map(t => `${t.kind}@${t.day} r${t.readiness}`), 'attention', w.god.attention);
  World.publicState(w); for (const a of World.alive(w)) World.viewFor(a, w);
}

runFresh(); runEnd(); runSaved();
console.log('SMOKE DONE');
