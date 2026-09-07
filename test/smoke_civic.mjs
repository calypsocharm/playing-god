// Headless smoke for the departments: ballot -> votes -> commission -> wages -> finished; savings, loans, interest; migration. Never writes data/.
import { readFileSync } from 'node:fs';
import * as World from '../server/world.js';

const seen = new Set();
function drain(w, tag, re) {
  for (const e of w.events) {
    const k = `${e.day}.${e.tick}.${e.text}`; if (seen.has(k)) continue; seen.add(k);
    if (re.test(e.text)) console.log(`${tag} d${w.day} [${e.kind}] ${e.text}`);
  }
}
const RE = /ballot|votes for|council|bank|meeting house|is finished|strongbox|tithe|interest/i;

function runFresh() {
  console.log('--- fresh world, 8 days a season, 5 seasons, hands full of materials ---');
  const w = World.createWorld(null);
  w.weather.daysPerSeason = 8;
  for (const a of World.alive(w)) { a.inv.wood += 30; a.inv.stone += 15; a.inv.fiber += 10; a.inv.clay += 6; a.inv.coin += 20; a.inv.food += 6; }
  console.log('bank', w.bank.coin, 'store', w.store.coin, 'council', w.council);
  const acts = new Map();
  const counts = { vote: 0, deposit: 0, withdraw: 0, borrow: 0, repay: 0, build: 0 };
  let brainedVote = false;
  for (let i = 0; i < 8 * 5 * World.TICKS_PER_DAY; i++) {
    // one villager acts like a brained mind: vote by label through normaliseAction, and save some coin
    if (w.council.ballot && !brainedVote) {
      const a = World.alive(w)[0];
      const act = World.normaliseAction(w, { type: 'vote', for: 'the ' + w.council.ballot.options[1] });
      const dep = World.normaliseAction(w, { type: 'save', amount: 5 });
      console.log(`d${w.day} normalised vote ->`, act, 'deposit ->', dep);
      acts.set(a.id, act); brainedVote = true;
    }
    World.step(w, acts); acts.clear();
    for (const a of World.alive(w)) { const t = (a.thought || '') + ' ' + (a.doingText || ''); }
    drain(w, 'F', RE);
    for (const e of w.events) { const k = 'c' + e.day + e.tick + e.text; if (seen.has(k)) continue; seen.add(k); if (/votes for/.test(e.text)) counts.vote++; if (/puts \d+ coin in the bank/.test(e.text)) counts.deposit++; if (/takes \d+ coin out/.test(e.text)) counts.withdraw++; if (/borrows \d+ coin from the bank/.test(e.text)) counts.borrow++; if (/pays \d+ coin back to the bank/.test(e.text)) counts.repay++; if (/puts .* into the/.test(e.text)) counts.build++; }
    if (w.ended) { console.log('ENDED', w.ended); break; }
  }
  console.log('counts', counts);
  console.log('council', { project: w.council.project, coin: w.council.coin, wagesPaid: w.council.wagesPaid, income: w.council.income, built: w.council.built, lastResult: w.council.lastResult });
  console.log('bank', { coin: w.bank.coin, savings: w.bank.savings, loans: Object.keys(w.bank.loans).length, civic: w.bank.civic, interestPaid: w.bank.interestPaid });
  console.log('builds done', Object.entries(w.builds).filter(([, b]) => b.done).map(([k]) => k));
  const ps = World.publicState(w); console.log('publicState council', ps.council.ballot ? 'ballot open' : ps.council.project || 'idle', 'bank savings rows', ps.bank.savings.length, 'agent0 savings', ps.agents[0].savings);
  const a = World.alive(w)[0]; const v = World.viewFor(a, w); console.log('coin line:', v.coin); console.log('civic felt:', v.felt.filter(x => /vote|council|bank/i.test(x)));
  console.log('actions mention vote:', v.actions.filter(x => /^vote|^deposit|^withdraw|^borrow/.test(x)).map(x => x.slice(0, 90)));
}

function runSaved() {
  console.log('--- migration: data/world.json (read only) ---');
  const saved = JSON.parse(readFileSync(new URL('../data/world.json', import.meta.url), 'utf8'));
  const before = { store: saved.store.coin, loans: Object.keys(saved.store.loans || {}).length, project: saved.store.project };
  const w = World.createWorld(saved);
  console.log('before', before, '-> store', w.store.coin, 'bank', w.bank.coin, 'bank loans', Object.keys(w.bank.loans).length, 'council project', w.council.project);
  const acts = new Map();
  for (let i = 0; i < w.weather.daysPerSeason * 2 * World.TICKS_PER_DAY; i++) { World.step(w, acts); drain(w, 'S', RE); if (w.ended) { console.log('ENDED', w.ended); break; } }
  console.log('after 2 seasons: council', { project: w.council.project, coin: w.council.coin, wagesPaid: w.council.wagesPaid, built: w.council.built.map(b => b.key), lastResult: w.council.lastResult }, 'bank', { coin: w.bank.coin, savers: Object.keys(w.bank.savings).length, civic: w.bank.civic });
  World.publicState(w); for (const a of World.alive(w)) World.viewFor(a, w);
}

runFresh(); runSaved();
console.log('SMOKE DONE');
