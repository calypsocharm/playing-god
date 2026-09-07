import * as World from '../server/world.js';
const w = World.createWorld(null); w.weather.daysPerSeason = 3; const acts = new Map();
for (let i = 0; i < 2 * World.TICKS_PER_DAY; i++) World.step(w, acts);
const [a, b] = World.alive(w); a.alive = false; a.diedDay = w.day - 8; a.ageAtDeath = 70; a.causeOfDeath = 'old age'; b.grief = [{ for: a.id, name: a.name, day: a.diedDay, intensity: 0.8, shared: 0 }];
w.funerals = [];   // as on the live world: died before funerals existed
console.log('before:', World.whyLines(w).filter(l => /grieving/.test(l)));
const seen = new Set();
for (let i = 0; i < 2 * World.TICKS_PER_DAY; i++) { World.step(w, acts); for (const e of w.events) { const k = e.day + e.tick + e.text; if (seen.has(k) || !/buries/.test(e.text)) continue; seen.add(k); console.log(`d${e.day} t${e.tick} ${e.text.slice(0, 160)}`); } }
console.log('graves', w.graves.map(g => g.name), 'grief buried', b.grief.map(g => !!g.buried), 'after:', World.whyLines(w).filter(l => /grieving/.test(l)));
console.log('SMOKE DONE');
