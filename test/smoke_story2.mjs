import * as World from '../server/world.js';
const w = World.createWorld(null); w.weather.daysPerSeason = 8; const acts = new Map();
for (let i = 0; i < 2 * World.TICKS_PER_DAY; i++) World.step(w, acts);
const [a, b, c] = World.alive(w); a.partner = b.id; b.partner = a.id; a.children = [c.id]; c.parents = [a.id];
a.alive = false; a.diedDay = w.day; a.ageAtDeath = 44; a.causeOfDeath = 'the cold';
b.grief = [{ for: a.id, name: a.name, day: w.day, intensity: 1, shared: 0 }]; c.grief = [{ for: a.id, name: a.name, day: w.day, intensity: 0.8, shared: 0 }];
c.ill = { kind: 'fever', severity: 0.5, day: w.day - 2 };
console.log(World.whyLines(w).join('\n'));
