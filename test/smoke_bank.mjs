// The bank, and whether a village with food on the shelf lets anyone starve.
// Her world reached day 1941 with the bank owing 10,735 coin and holding none, and buried eight
// people for hunger in fifteen days in a summer the chronicle called "the fields full".
import * as World from '../server/world.js';
import * as C from '../server/civic.js';

const acts = new Map();
let fails = 0;
const ok = (label, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' · ' + extra : ''}`); if (!cond) fails++; };

// ---- a bank may not pay interest it has not earned ----
const w = World.createWorld(null);
w.bank.coin = 0; w.bank.savings = { a: 2733, b: 2525 };
ok('an empty bank pays nobody', C.interest(w, () => null, () => {}) === 0, `free reserve ${C.freeReserve(w)}`);

const w2 = World.createWorld(null);
w2.bank.coin = 1000; w2.bank.savings = { a: 400, b: 200 };
const paid = C.interest(w2, () => null, () => {});
ok('a bank that has earned something pays it', paid > 0, `${paid} coin`);
ok('and is still solvent afterwards', C.owedToSavers(w2) <= w2.bank.coin, `owes ${C.owedToSavers(w2)}, holds ${w2.bank.coin}`);

// two hundred seasons of compounding, the thing that broke her world
const w3 = World.createWorld(null);
w3.bank.coin = 1000; w3.bank.savings = { a: 500 };
for (let i = 0; i < 200; i++) C.interest(w3, () => null, () => {});
ok('two hundred seasons later it still holds what it owes', C.owedToSavers(w3) <= w3.bank.coin,
  `owes ${C.owedToSavers(w3)}, holds ${w3.bank.coin}`);
ok('and savings did not run away to the moon', C.owedToSavers(w3) <= 1000, String(C.owedToSavers(w3)));

// ---- an old world that was already broken is put right once ----
const w4 = World.createWorld(null);
w4.bank.coin = 261; w4.bank.savings = { a: 2733, b: 2525, c: 1533, d: 1432, e: 823, f: 792, g: 465, h: 375, i: 25, j: 16, k: 16 };
const before = C.owedToSavers(w4);
const written = C.reconcileBank(w4, () => {});
ok('the write-down happens', written > 0, `${written} coin of ink`);
ok('and leaves the bank able to pay everyone', C.owedToSavers(w4) <= w4.bank.coin, `owes ${C.owedToSavers(w4)}, holds ${w4.bank.coin}`);
ok('savers keep something rather than nothing', C.owedToSavers(w4) > 0, String(C.owedToSavers(w4)));
ok('running it again changes nothing', C.reconcileBank(w4, () => {}) === 0);
ok('it only ever takes, never invents', C.owedToSavers(w4) < before);

// ---- and a solvent bank can be drawn on and can lend ----
const w5 = World.createWorld(null);
const saver = World.alive(w5)[0];
w5.bank.coin = 500; w5.bank.savings = { [saver.id]: 100 };
saver.inv.coin = 0;
ok('you can take your own coin out again', C.withdraw(w5, saver, 20, () => {}, () => {}) === true, `now holds ${saver.inv.coin}`);

// ---- nobody starves with food on the shelf ----
const w6 = World.createWorld(null); w6.weather.daysPerSeason = 6;
for (let i = 0; i < 2 * World.TICKS_PER_DAY; i++) World.step(w6, acts);
const broke = World.alive(w6)[0];
broke.body.food = 0.1; broke.inv.food = 0; broke.inv.coin = 0;
w6.store.shelf.food = 40;
const shelfWas = w6.store.shelf.food;
for (let i = 0; i < World.TICKS_PER_DAY; i++) World.step(w6, acts);
ok('the shelf feeds someone who has nothing', (broke.inv.food || 0) > 0 || broke.body.food > 0.3, `food in hand ${(broke.inv.food || 0).toFixed(1)}, belly ${broke.body.food.toFixed(2)}`);
ok('and it comes off the shelf', w6.store.shelf.food < shelfWas, `${shelfWas} -> ${w6.store.shelf.food}`);
ok('the village is told', w6.events.some(e => /given (food|bread) off the shelf/.test(e.text)));

// someone who can pay is left to pay
const w7 = World.createWorld(null);
for (let i = 0; i < 2 * World.TICKS_PER_DAY; i++) World.step(w7, acts);
const flush = World.alive(w7)[0];
flush.body.food = 0.1; flush.inv.food = 0; flush.inv.coin = 50;
w7.store.shelf.food = 40;
const was7 = w7.store.shelf.food;
World.step(w7, acts);
ok('someone with coin in their pocket is not given charity', w7.store.shelf.food === was7 || !w7.events.some(e => new RegExp(flush.name + ' has nothing').test(e.text)));

// a bare shelf cannot feed anyone, and must not invent food
const w8 = World.createWorld(null);
for (let i = 0; i < 2 * World.TICKS_PER_DAY; i++) World.step(w8, acts);
const doomed = World.alive(w8)[0];
doomed.body.food = 0.1; doomed.inv.food = 0; doomed.inv.coin = 0;
w8.store.shelf.food = 0; w8.store.shelf.bread = 0;
World.step(w8, acts);
ok('an empty shelf does not conjure a loaf', (doomed.inv.food || 0) === 0, String(doomed.inv.food));

// ---- the long run: a village that is fed does not bury people for hunger ----
const w9 = World.createWorld(null); w9.weather.daysPerSeason = 6; w9.weather.harvest = 1; w9.weather.winterHarshness = 0.05;
let hunger = 0; const seen = new Set();
for (let i = 0; i < 300 * World.TICKS_PER_DAY; i++) {
  World.step(w9, acts);
  for (const e of w9.events) { const k = e.day + '|' + e.tick + '|' + e.text; if (seen.has(k)) continue; seen.add(k); if (/died of hunger/.test(e.text)) hunger++; }
  if (seen.size > 20000) seen.clear();
}
ok('300 days of full fields and a mild winter buries nobody for hunger', hunger === 0, `${hunger} hunger death(s), ${World.alive(w9).length} alive, shelf ${Math.floor(w9.store.shelf.food || 0)}`);
// A bank that lends is illiquid on purpose; what matters is that it is solvent (the coin it holds
// plus what is out on loan covers what it owes) and that the box is never scraped empty.
ok('and the bank is still solvent at the end', Math.floor(w9.bank.coin) + C.outstanding(w9) >= C.owedToSavers(w9),
  `owes ${C.owedToSavers(w9)}, holds ${Math.floor(w9.bank.coin)}, out on loan ${C.outstanding(w9)}`);
ok('and never scraped its box empty', C.owedToSavers(w9) === 0 || Math.floor(w9.bank.coin) > 0, `holds ${Math.floor(w9.bank.coin)} against ${C.owedToSavers(w9)} owed`);
ok('it always keeps something back to lend the hungry', C.lendable(w9) <= Math.floor(w9.bank.coin));

console.log(fails ? `\nSMOKE FAILED: ${fails}` : '\nSMOKE DONE: all ok');
process.exit(fails ? 1 : 0);
