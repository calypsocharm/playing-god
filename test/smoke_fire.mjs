// The second Creator: whoever holds the far fire. Every op, the gates on them, the weighing,
// and the migration of a world saved before any of this existed.
import { readFileSync } from 'node:fs';
import * as World from '../server/world.js';
import * as Fire from '../server/fire.js';

const acts = new Map();
let fails = 0;
const ok = (label, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' · ' + extra : ''}`); if (!cond) fails++; };

const w = World.createWorld(null);
w.weather.daysPerSeason = 8;
const r = w.rival, g = Fire.ensureGod(w);
ok('the far fire has a sky of its own', g && g.max === 6 && g.attention === 4, `${g.attention} of ${g.max}`);

// ---- before the two fires have seen each other ----
ok('cannot reach across the pale unseen', World.fireAct(w, { op: 'raid' }).error != null, World.fireAct(w, { op: 'raid' }).error);
ok('can still feed their own unseen', World.fireAct(w, { op: 'feed' }).ok === true);
ok('feeding cost 1', g.attention === 3, String(g.attention));

// ---- naming is free ----
World.fireAct(w, { op: 'name', text: 'the Long Dark' });
ok('naming is free and sticks', g.name === 'the Long Dark' && g.named === w.day && g.attention === 3);
ok('an empty name is refused', World.fireAct(w, { op: 'name', text: '  ' }).error != null);

// ---- the village sees them ----
r.seen = w.day;
const before = { people: r.people, strength: r.strength, food: r.food };
g.attention = 6;

ok('kin adds a body', World.fireAct(w, { op: 'kin' }).ok && r.people === before.people + 1);
ok('the village sees the smoke stand double', w.events.some(e => /smoke past the pale stands double/i.test(e.text)));
ok('harden sharpens and is heard', World.fireAct(w, { op: 'harden' }).ok && r.strength === before.strength + 1 && w.events.some(e => /Axes ring/i.test(e.text)));

// ---- refusal costs nothing ----
const attnBefore = g.attention;
ok('refusing a star nobody stood is an error', World.fireAct(w, { op: 'refuse' }).error != null);
ok('a refused op spends nothing', g.attention === attnBefore, String(g.attention));

// ---- the edge ----
g.attention = 6; r.food = 10;
const shelfBefore = w.store.shelf.food || 0;
const offer = World.fireAct(w, { op: 'offer' });
ok('offering moves food onto their shelf', offer.ok && (w.store.shelf.food || 0) > shelfBefore, `${shelfBefore} -> ${w.store.shelf.food}`);
ok('the village remembers who left it', World.alive(w).some(a => a.memories.some(m => /left \d+ food at the edge for us/i.test(m.text))));

r.food = 0;
ok('cannot offer what you do not have', World.fireAct(w, { op: 'offer' }).error != null);

// ---- what they do tonight is the Creator's to say ----
g.attention = 6; r.mood = 0.9; r.lastRaid = -99;   // warm: they would never raid on their own
World.fireAct(w, { op: 'raid' });
ok('a raid is latched, not fired on the spot', r.willRaid === true);
World.step(w, acts); for (let i = 0; i < World.TICKS_PER_DAY * 2; i++) World.step(w, acts);
ok('the latch fires in the night and clears', r.willRaid === false && r.raids.length > 0, `${r.raids.length} raid(s)`);

g.attention = 6; r.mood = -0.9; r.food = 0; r.lastRaid = -99;   // hostile and starving: they would raid
World.fireAct(w, { op: 'hold' });
const raidsAtHold = r.raids.length;
for (let i = 0; i < World.TICKS_PER_DAY; i++) World.step(w, acts);
ok('holding beats hunger and mood for the night', r.raids.length === raidsAtHold, `${raidsAtHold} -> ${r.raids.length}`);
ok('the hold is spent after one night', r.willHold === false);

// ---- the sky and the fire meet over a star ----
w.god.attention = 8; r.mood = 0; r.seen = w.day;
const p = World.godAct(w, { op: 'parley' });
ok('the sky can stand a star over both fires', p.ok === true);
g.attention = 6;
const moodAtStar = r.mood;
const refused = World.fireAct(w, { op: 'refuse' });
ok('the far fire can put its own fire out under it', refused.ok && r.mood < moodAtStar && r.parley == null, `${moodAtStar.toFixed(2)} -> ${r.mood.toFixed(2)}`);
ok('the village feels the refusal', w.events.some(e => /went out under it/i.test(e.text)));

// ---- attention is a wall ----
g.attention = 0;
ok('no attention, no act', World.fireAct(w, { op: 'kin' }).error != null, World.fireAct(w, { op: 'kin' }).error);
ok('but holding is always free', World.fireAct(w, { op: 'hold' }).ok === true);
ok('unknown ops are refused', World.fireAct(w, { op: 'smite' }).error != null);

// ---- weighed on their own terms ----
r.season = { deaths: 0, born: 0, trades: 1, took: 1, repelled: 0, offered: 2, sent: 0 };
r.food = 8; g.attention = 0;
const rep = Fire.weighFire(w);
ok('the season is weighed at the fire', rep && rep.earned > 0, rep ? `+${rep.earned}: ${rep.why.join('; ')}` : 'no report');
ok('the weighing pays out', g.attention === Math.min(g.max, rep.earned), String(g.attention));
ok('the counters reset', (r.season.trades || 0) === 0 && (r.season.took || 0) === 0);
ok('none of it reaches the village log', !w.events.some(e => /weighed at the fire/i.test(e.text)));
g.attention = 0; r.season = { deaths: 3, born: 0, trades: 0, took: 0, repelled: 2, offered: 0, sent: 0 }; r.food = 0;
const bad = Fire.weighFire(w);
ok('a bad season takes it away', bad.earned < 0 && g.attention === 0, `${bad.earned}`);

// ---- what each Creator is shown ----
const ps = World.publicState(w);
ok('the far fire gets its own state block', ps.fire && ps.fire.god && ps.fire.god.costs.raid === 2);
ok('the village Creator can see the fire is held', ps.rival.held && ps.rival.held.name === 'the Long Dark', JSON.stringify(ps.rival.held));
ok('the fire sees what the village carried out', typeof ps.fire.sentToUs === 'number' && typeof ps.fire.offered === 'number');
ok('the fire is not handed the villagers', ps.fire.agents === undefined && ps.fire.store === undefined);

// ---- a season turn does not throw with a fire in play ----
const w2 = World.createWorld(null); w2.weather.daysPerSeason = 3; w2.rival.seen = 1;
for (let i = 0; i < World.TICKS_PER_DAY * 10; i++) World.step(w2, acts);
ok('ten days with a held fire run clean', w2.day > 1 && !w2.ended, `day ${w2.day}`);

// ---- a world saved before any of this ----
const saved = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url), 'utf8'));
const day0 = saved.day;   // createWorld adopts the object; read the day before it does
const s = World.createWorld(saved);
ok('an old world is given a fire sky', s.rival.god && s.rival.god.max === 6, `${s.rival.god?.attention} of ${s.rival.god?.max}`);
ok('an old world can be acted on', World.fireAct(s, { op: 'hold' }).ok === true);
for (let i = 0; i < World.TICKS_PER_DAY * 5; i++) World.step(s, acts);
ok('and keeps running', s.day > day0, `${day0} -> ${s.day}`);

console.log(fails ? `\nSMOKE FAILED: ${fails}` : '\nSMOKE DONE: all ok');
process.exit(fails ? 1 : 0);
