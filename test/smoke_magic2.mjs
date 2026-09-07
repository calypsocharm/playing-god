import * as World from '../server/world.js';
const w = World.createWorld(null); w.weather.daysPerSeason = 8; const acts = new Map(); const seen = new Set();
const scout = World.alive(w)[1]; console.log('scout', scout.name, 'belief', scout.belief);
let found = null;
for (let i = 0; i < 8 * 4 * World.TICKS_PER_DAY && !found; i++) {
  acts.set(scout.id, { type: 'scout', thought: 'out' }); scout.body.energy = 1; scout.body.food = 1; scout.body.warmth = 1;
  World.step(w, acts);
  for (const e of w.events) { const k = e.day + e.tick + e.text; if (seen.has(k)) continue; seen.add(k); if (/rose-coloured/.test(e.text)) { found = e.text; console.log(`d${e.day} ${e.text}`); } }
}
for (let i = 0; i < 3 * World.TICKS_PER_DAY; i++) World.step(w, acts);
console.log('found?', !!found, 'wearer', scout.inv.glasses, 'belief now', scout.belief, 'felt:', World.viewFor(scout, w).felt.filter(x => /rose|believe/.test(x)));
console.log('why:', World.whyLines(w).filter(l => /rose/.test(l)));
console.log(World.chronicleNightText ? '' : 'SMOKE DONE');
