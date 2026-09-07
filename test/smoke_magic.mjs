import { readFileSync } from 'node:fs';
import * as World from '../server/world.js';
const w = World.createWorld(null); w.weather.daysPerSeason = 8; const acts = new Map(); const seen = new Set();
console.log('beliefs at start', World.alive(w).map(a => `${a.name}(${a.upbringing}) ${a.belief}`).join(', '));
let found = null;
for (let i = 0; i < 8 * 6 * World.TICKS_PER_DAY; i++) {
  World.step(w, acts);
  for (const e of w.events) { const k = e.day + e.tick + e.text; if (seen.has(k)) continue; seen.add(k); if (/rose-coloured/.test(e.text)) { found = e.text; console.log(`d${e.day} ${e.text}`); } }
}
console.log('found?', !!found, 'wearer', World.alive(w).find(a => a.inv.glasses > 0)?.name, 'beliefs now', World.alive(w).map(a => `${a.name} ${a.belief}`).join(', '));
const a = World.alive(w)[0]; const v = World.viewFor(a, w); console.log('felt:', v.felt.filter(x => /believe|rose/.test(x)));
const ps = World.publicState(w); console.log('public', ps.agents[0].belief, ps.agents[0].beliefWord, ps.agents.filter(x => x.wears?.length).map(x => x.name));
const saved = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url), 'utf8')); const s = World.createWorld(saved); console.log('saved beliefs', s.agents.filter(x => x.alive).slice(0, 5).map(a => `${a.name} ${a.belief}`).join(', '), 'inv.glasses key', s.agents[0].inv.glasses);
for (let i = 0; i < 6 * World.TICKS_PER_DAY; i++) World.step(s, acts);
console.log('SMOKE DONE');
