import { readFileSync } from 'node:fs';
import * as World from '../server/world.js';
const errs = []; const origErr = console.error; console.error = (...a) => { errs.push(a.join(' ')); };
const w = World.createWorld(null); w.weather.daysPerSeason = 8;
const acts = new Map();
for (let i = 0; i < 12 * World.TICKS_PER_DAY; i++) World.step(w, acts);   // let the village get a little history first
for (const a of World.alive(w)) { a.inv.wood += 10; a.inv.stone += 5; }
console.log('deck', w.deck.length, 'cards so far (sky turns)', w.cards.length);
for (let n = 0; n < 78; n++) {
  w.god.attention = 8; w.paused = false;
  const r = World.godAct(w, { op: 'draw' });
  if (r.error) { console.log('ERR', r.error); break; }
  console.log(`${String(n + 1).padStart(2)} ${r.text.slice(0, 150)}`);
  for (let i = 0; i < World.TICKS_PER_DAY; i++) World.step(w, acts);
  if (w.ended) { console.log('ended', w.ended); break; }
}
console.log('deck left', w.deck.length, 'alive', World.alive(w).length, 'effect errors:', errs.length); for (const e of errs) console.log('  ', e.slice(0, 300));
World.publicState(w); for (const a of World.alive(w)) World.viewFor(a, w);
const saved = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url), 'utf8'));
const s = World.createWorld(saved); console.log('saved world deck', s.deck.length, 'cards', s.cards.length);
for (let i = 0; i < s.weather.daysPerSeason * World.TICKS_PER_DAY + 6; i++) World.step(s, acts);
console.log('after a season: sky drew', s.cards.map(c => `${c.name} (${c.by}) d${c.day}`));
console.log('SMOKE DONE');
