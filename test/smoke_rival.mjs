import { readFileSync } from 'node:fs';
import * as World from '../server/world.js';
const w = World.createWorld(null); w.weather.daysPerSeason = 8; const acts = new Map(); const seen = new Set();
const RE = /far fire|lake people|beyond the hills|eastern fire|Raiders from|trader from|both fires|Deer tracks|carries .* food out/i;
w.rival.mood = -0.6; w.rival.food = 1;   // make them hostile and hungry so a raid comes
for (let i = 0; i < 8 * 8 * World.TICKS_PER_DAY; i++) {
  World.step(w, acts);
  for (const e of w.events) { const k = e.day + e.tick + e.text; if (seen.has(k) || !RE.test(e.text)) continue; seen.add(k); console.log(`d${e.day} [${e.kind}] ${e.text.slice(0, 170)}`); }
  if (w.rival.seen && !w.parleyed) { w.god.attention = 8; const r = World.godAct(w, { op: 'parley' }); console.log('PARLEY ->', r); w.parleyed = true; }
}
console.log('rival', { seen: w.rival.seen, people: w.rival.people, mood: w.rival.mood.toFixed(2), trades: w.rival.trades, raids: w.rival.raids, sent: w.rival.sent, deer: w.deer });
const ps = World.publicState(w); console.log('places has rival', !!ps.places.rival, 'public', ps.rival.mood); const a = World.alive(w)[0]; const v = World.viewFor(a, w); console.log('felt', v.felt.filter(x => /fire|Raiders/.test(x)), 'actions', v.actions.filter(x => /^send/.test(x)));
console.log('normalise send', World.normaliseAction(w, { type: 'send', n: 3 }));
const saved = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url), 'utf8')); const s = World.createWorld(saved); for (let i = 0; i < 40 * World.TICKS_PER_DAY; i++) World.step(s, acts); console.log('saved: rival', s.rival.name, 'seen', s.rival.seen, 'mood', s.rival.mood.toFixed(2)); console.log('SMOKE DONE');
