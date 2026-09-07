import * as World from '../server/world.js';
const w = World.createWorld(null); w.weather.daysPerSeason = 8; const acts = new Map(); const seen = new Set();
const scout = World.alive(w)[1]; const finds = [];
for (let i = 0; i < 8 * 8 * World.TICKS_PER_DAY && finds.length < 2; i++) {
  acts.set(scout.id, { type: 'scout' }); scout.body.energy = 1; scout.body.food = 1; scout.body.warmth = 1; if (!scout.explore && i % 6 === 0) scout.location = 'edge';
  World.step(w, acts);
  for (const e of w.events) { const k = e.day + e.tick + e.text; if (seen.has(k)) continue; seen.add(k); if (/finds (rose|necklace)/.test(e.text)) { finds.push(e.text); console.log(`d${e.day} ${e.text}`); } }
}
const coin0 = scout.inv.coin; for (let i = 0; i < 5 * World.TICKS_PER_DAY; i++) World.step(w, acts);
console.log('wears', scout.inv.glasses, scout.inv.plenty, 'coin', coin0, '->', scout.inv.coin, 'belief', scout.belief);
console.log('felt', World.viewFor(scout, w).felt.filter(x => /necklace|rose/.test(x))); console.log('why', World.whyLines(w).filter(l => /necklace/.test(l)));
console.log('recipes ok', World.viewFor(scout, w).recipes.length, 'SMOKE DONE');
