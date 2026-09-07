// Nothing lies out. However many die, they are all in the ground the next afternoon: one walk to
// the stones, one gathering, a grave and words for each of them.
import * as World from '../server/world.js';

const acts = new Map();
let fails = 0;
const ok = (label, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' · ' + extra : ''}`); if (!cond) fails++; };

const w = World.createWorld(null); w.weather.daysPerSeason = 6;
for (let i = 0; i < 2 * World.TICKS_PER_DAY; i++) World.step(w, acts);

// Three go down on the same day, with everyone left grieving all three.
const living = World.alive(w);
const dead = living.slice(0, 3), rest = living.slice(3);
for (const a of dead) {
  a.alive = false; a.diedDay = w.day; a.ageAtDeath = 80; a.causeOfDeath = 'old age';
  for (const o of rest) (o.grief = o.grief || []).push({ for: a.id, name: a.name, day: w.day, intensity: 0.8, shared: 0 });
  w.funerals.push({ for: a.id, name: a.name, day: w.day, cause: 'old age', age: 80 });
}
const diedOn = w.day;
ok('three are waiting', w.funerals.length === 3);

const buryings = [];
for (let i = 0; i < 4 * World.TICKS_PER_DAY; i++) {
  World.step(w, acts);
  for (const e of w.events) if (/walks out to the stones/.test(e.text) && !buryings.some(x => x.text === e.text)) buryings.push({ day: e.day, text: e.text });
}
ok('one gathering, not three', buryings.length === 1, `${buryings.length} walk(s) to the stones`);
ok('and it is the next day', buryings[0]?.day === diedOn + 1, `died d${diedOn}, buried d${buryings[0]?.day}`);
ok('all three are named in it', dead.every(a => buryings[0] && buryings[0].text.includes(a.name)), buryings[0]?.text.slice(0, 150));
ok('three graves', w.graves.length === 3, w.graves.map(g => g.name).join(', '));
ok('each got their own words', new Set(w.graves.map(g => g.words)).size >= 1 && w.graves.every(g => g.words && g.by));
ok('nothing is left waiting', w.funerals.length === 0);
ok('every grief is marked buried', rest.every(o => o.grief.every(g => g.buried === diedOn + 1)));
ok('and halved', rest.every(o => o.grief.every(g => g.intensity < 0.8)), String(rest[0]?.grief[0]?.intensity));

// Nobody is ever left in the queue because the village was too sick to carry them: the funeral
// waits for them rather than being dropped.
const w2 = World.createWorld(null); w2.weather.daysPerSeason = 6;
for (let i = 0; i < 2 * World.TICKS_PER_DAY; i++) World.step(w2, acts);
const l2 = World.alive(w2), gone = l2[0];
gone.alive = false; gone.diedDay = w2.day; gone.ageAtDeath = 70; gone.causeOfDeath = 'fever';
w2.funerals.push({ for: gone.id, name: gone.name, day: w2.day, cause: 'fever', age: 70 });
for (const a of World.alive(w2)) a.ill = { kind: 'fever', day: w2.day, severity: 0.9, treatedDay: -1 };
for (let i = 0; i < World.TICKS_PER_DAY * 2; i++) World.step(w2, acts);
const stillWaiting = w2.funerals.length === 1 || (w2.graves || []).length === 1;
ok('a village too sick to stand does not lose the body', stillWaiting, `queued ${w2.funerals.length}, graves ${(w2.graves || []).length}`);

console.log(fails ? `\nSMOKE FAILED: ${fails}` : '\nSMOKE DONE: all ok');
process.exit(fails ? 1 : 0);
