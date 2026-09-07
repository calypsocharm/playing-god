// The village's three departments. The store keeps the shelf. The bank keeps the coin: savings
// no one can steal, loans to people, and loans to the council. The council is the villagers
// governing themselves: a ballot at the meeting house, a project the most of them chose, coin
// borrowed from the bank to pay wages, and a tithe from the till to pay it back. Nothing here is
// the Creator's to decide; the sky can only watch what they choose.

import * as B from './body.js';
import * as I from './items.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const BALLOT_DAYS = 3;          // how long a ballot stays open
export const LOAN_CAP = 20;            // most a person may owe the bank
export const INTEREST = 0.05;          // paid on savings when the season turns
export const BANK_FLOAT = 30;          // the bank keeps this much back from the council

export function newBank() { return { coin: 150, savings: {}, loans: {}, civic: { owed: 0, lent: 0, repaid: 0 }, ledger: [], interestPaid: 0 }; }
export function newCouncil() { return { project: null, ballot: null, coin: 0, wagesPaid: 0, income: 0, built: [], lastBallot: -99, votesCast: 0 }; }

// Older worlds had a store that was also the bank and the builder. Split it.
export function ensure(w) {
  if (!w.bank) {
    w.bank = newBank();
    const half = Math.floor((w.store.coin || 0) / 2);
    w.bank.coin = half; w.store.coin -= half;
    w.bank.loans = w.store.loans || {};
    w.store.loans = {};
  }
  if (!w.council) {
    w.council = newCouncil();
    w.council.project = w.store.project || null;
    w.council.wagesPaid = w.store.wagesPaid || 0;
    w.store.project = null;
  }
  w.bank.savings = w.bank.savings || {}; w.bank.loans = w.bank.loans || {}; w.bank.civic = w.bank.civic || { owed: 0, lent: 0, repaid: 0 }; w.bank.ledger = w.bank.ledger || [];
  w.council.built = w.council.built || []; w.council.ballot = w.council.ballot || null;
  return w;
}

const note = (w, entry) => { w.bank.ledger.push({ day: w.day, ...entry }); if (w.bank.ledger.length > 200) w.bank.ledger.shift(); };

// ---------- the bank ----------
export function deposit(w, a, n, remember, event) {
  n = Math.max(1, Math.min(Math.floor(a.inv.coin || 0), Math.floor(n || 0)));
  if (n < 1) { remember(w, a, 'You went to the bank with nothing to put in.', 0.2); return false; }
  a.inv.coin -= n; w.bank.savings[a.id] = (w.bank.savings[a.id] || 0) + n; w.bank.coin += n;
  note(w, { who: a.name, put: n });
  event(w, `${a.name} puts ${n} coin in the bank.`, 'trade', [a.id]);
  remember(w, a, `You put ${n} coin in the bank. It is ${w.bank.savings[a.id]} there now, where no one can take it.`, 0.4);
  B.soothe(a.body, 0.03);
  return true;
}
export function withdraw(w, a, n, remember, event) {
  const have = Math.floor(w.bank.savings[a.id] || 0);
  n = Math.max(1, Math.min(have, Math.floor(n || have)));
  if (have < 1) { remember(w, a, 'You have nothing in the bank.', 0.3); return false; }
  const can = Math.min(n, Math.floor(w.bank.coin));
  if (can < 1) { remember(w, a, 'The bank has lent your coin out and cannot give it back today.', 0.6); B.soothe(a.body, -0.05); return false; }
  w.bank.savings[a.id] -= can; if (w.bank.savings[a.id] <= 0) delete w.bank.savings[a.id];
  w.bank.coin -= can; a.inv.coin = (a.inv.coin || 0) + can;
  note(w, { who: a.name, took: can });
  event(w, `${a.name} takes ${can} coin out of the bank.`, 'trade', [a.id]);
  remember(w, a, `You took ${can} coin out of the bank${w.bank.savings[a.id] ? `; ${w.bank.savings[a.id]} is still there` : ''}.`, 0.3);
  return true;
}
export function borrow(w, a, n, remember, event) {
  n = Math.max(1, Math.min(LOAN_CAP, Math.floor(n || 5)));
  const loan = w.bank.loans[a.id]; const owed = loan?.owed || 0;
  if (loan?.defaulted) { remember(w, a, 'The bank will not lend to you. You did not pay last time.', 0.5); return false; }
  const room = Math.min(n, LOAN_CAP - owed, Math.floor(w.bank.coin));
  if (room < 1) { remember(w, a, owed >= LOAN_CAP ? 'You already owe the bank all it will lend.' : 'The bank had nothing to lend.', 0.4); return false; }
  w.bank.coin -= room; a.inv.coin = (a.inv.coin || 0) + room;
  w.bank.loans[a.id] = { owed: owed + room, since: loan?.since ?? w.day, name: a.name, lastPaid: loan?.lastPaid };
  note(w, { who: a.name, lent: room });
  event(w, `${a.name} borrows ${room} coin from the bank.`, 'trade', [a.id]);
  remember(w, a, `You borrowed ${room} coin. You owe the bank ${owed + room}.`, 0.5);
  return true;
}
export function repay(w, a, n, remember, event) {
  const loan = w.bank.loans[a.id]; if (!loan) return false;
  n = Math.min(Math.floor(a.inv.coin || 0), loan.owed, Math.max(1, Math.floor(n || loan.owed)));
  if (n < 1) return false;
  a.inv.coin -= n; w.bank.coin += n; loan.owed -= n; loan.lastPaid = w.day;
  note(w, { who: a.name, repaid: n });
  event(w, `${a.name} pays ${n} coin back to the bank.`, 'trade', [a.id]);
  remember(w, a, loan.owed <= 0 ? 'You paid the bank off. Nothing hangs over you.' : `You paid ${n} back. You still owe ${loan.owed}.`, 0.5);
  if (loan.owed <= 0) { delete w.bank.loans[a.id]; B.soothe(a.body, 0.1); }
  return true;
}
// Every night: a coin back on each debt when it can be spared; a tenth more each season; a season unpaid and word gets round.
export function loansNightly(w, a, seasonStart, daysPerSeason, remember, event, bumpTrust, living) {
  const loan = w.bank.loans[a.id]; if (!loan || loan.owed <= 0) { if (loan) delete w.bank.loans[a.id]; return; }
  if ((a.inv.coin || 0) > 3) { const pay = Math.min(loan.owed, 1); a.inv.coin -= pay; w.bank.coin += pay; loan.owed -= pay; loan.lastPaid = w.day; }
  if (seasonStart && w.day > loan.since) loan.owed = Math.ceil(loan.owed * 1.1);
  if (w.day - (loan.lastPaid ?? loan.since) > daysPerSeason && !loan.defaulted) { loan.defaulted = true; event(w, `${a.name} has not paid the bank in a season. Word gets around.`, 'trade', [a.id]); for (const o of living) if (o !== a) bumpTrust(o, a, -0.05); remember(w, a, 'Everyone knows you owe the bank and have not paid.', 0.7); }
  if (loan.owed <= 0) delete w.bank.loans[a.id];
}
// When the season turns, savings grow, if the bank can pay it.
export function interest(w, byId, remember) {
  let paid = 0;
  for (const [id, n] of Object.entries(w.bank.savings)) {
    const gain = Math.floor(n * INTEREST);
    if (gain < 1 || w.bank.coin < gain) continue;
    w.bank.savings[id] = n + gain; w.bank.coin -= gain; paid += gain;
    const a = byId(w, id); if (a && a.alive) remember(w, a, `The bank added ${gain} coin to what you keep there. It is ${w.bank.savings[id]} now.`, 0.3);
  }
  w.bank.interestPaid = (w.bank.interestPaid || 0) + paid;
  return paid;
}
// A death: savings pass to the heir the world names, or to the council if there is none.
export function inherit(w, a, heir) {
  const n = Math.floor(w.bank.savings[a.id] || 0); if (!n) return 0;
  delete w.bank.savings[a.id];
  if (heir) w.bank.savings[heir.id] = (w.bank.savings[heir.id] || 0) + n; else { w.bank.coin -= n; w.council.coin += n; }
  return n;
}

// ---------- the council ----------
export function candidates(w, isFound) {
  return Object.keys(I.BUILDS).filter(k => !w.builds[k]?.done && (I.BUILDS[k].at !== 'creek' || isFound(w, 'creek')));
}
export function openBallot(w, isFound, event, remember, living) {
  const c = w.council; if (c.project || c.ballot) return null;
  const all = candidates(w, isFound); if (!all.length) return null;
  const civic = all.filter(k => I.BUILDS[k].civic), old = all.filter(k => !I.BUILDS[k].civic);
  const slate = [...civic.sort(() => Math.random() - 0.5).slice(0, 3), ...old.sort(() => Math.random() - 0.5).slice(0, 2)].slice(0, 4);
  c.ballot = { id: `${w.day}`, opened: w.day, closes: w.day + BALLOT_DAYS, options: slate, votes: {} };
  c.lastBallot = w.day;
  event(w, `A ballot opens at the meeting house: ${slate.map(k => `the ${I.BUILDS[k].label}`).join(', ')}. It closes in ${BALLOT_DAYS} days.`, 'build');
  for (const a of living) remember(w, a, `There is a vote at the meeting house on what the village builds next: ${slate.map(k => `the ${I.BUILDS[k].label} (${I.BUILDS[k].effect})`).join('; ')}. Go and put your hand up for one.`, 0.6);
  return c.ballot;
}
export function vote(w, a, key, remember, event) {
  const bt = w.council.ballot;
  if (!bt) { remember(w, a, 'There was no vote open at the meeting house.', 0.2); return false; }
  if (!bt.options.includes(key)) key = bt.options[0];
  const changed = bt.votes[a.id] && bt.votes[a.id] !== key;
  if (!bt.votes[a.id]) w.council.votesCast = (w.council.votesCast || 0) + 1;
  bt.votes[a.id] = key;
  event(w, `${a.name} votes for the ${I.BUILDS[key].label}.`, 'build', [a.id]);
  remember(w, a, `You put your hand up for the ${I.BUILDS[key].label}${changed ? ', changing your mind' : ''}.`, 0.4);
  return true;
}
export function tally(bt) {
  const n = {}; for (const k of bt.options) n[k] = 0;
  for (const k of Object.values(bt.votes)) n[k] = (n[k] || 0) + 1;
  return n;
}
export function closeBallot(w, event, remember, living) {
  const c = w.council, bt = c.ballot; if (!bt) return null;
  const n = tally(bt);
  const open = bt.options.filter(k => !w.builds[k]?.done);
  const top = open.length ? Math.max(...open.map(k => n[k] || 0)) : 0;
  const winners = open.filter(k => (n[k] || 0) === top);
  const key = top > 0 ? pick(winners) : null;
  c.ballot = null; c.lastResult = { day: w.day, tally: n, winner: key, cast: Object.keys(bt.votes).length };
  if (!key) { event(w, open.length ? 'The ballot closes with no hands raised. Nothing is chosen.' : 'The ballot closes; everything on it already stands.', 'build'); return null; }
  event(w, `The ballot closes: the ${I.BUILDS[key].label}, ${n[key]} of ${Object.keys(bt.votes).length} hands${winners.length > 1 ? ', by lot after a tie' : ''}.`, 'build');
  for (const a of living) remember(w, a, `The village chose the ${I.BUILDS[key].label}${bt.votes[a.id] === key ? ', as you did' : bt.votes[a.id] ? `, not the ${I.BUILDS[bt.votes[a.id]].label} you wanted` : ''}. ${I.BUILDS[key].effect}.`, 0.5);
  commission(w, key, event, remember, living);
  return key;
}
// The council takes the project on: it borrows from the bank for the coin the build needs and for wages.
export function commission(w, key, event, remember, living) {
  const c = w.council, spec = I.BUILDS[key];
  c.project = key; c.since = w.day;
  const b = w.builds[key] = w.builds[key] || { have: {}, done: false, builders: {} };
  const coinNeed = Math.max(0, (spec.cost.coin || 0) - (b.have.coin || 0));
  const units = Object.entries(spec.cost).filter(([m]) => m !== 'coin').reduce((s, [m, n]) => s + Math.max(0, n - (b.have[m] || 0)), 0);
  const want = coinNeed + Math.min(units, 60) - c.coin;
  const lend = Math.max(0, Math.min(want, Math.floor(w.bank.coin) - BANK_FLOAT));
  if (lend > 0) { w.bank.coin -= lend; c.coin += lend; w.bank.civic.owed += lend; w.bank.civic.lent += lend; note(w, { who: 'the council', lent: lend }); }
  if (coinNeed > 0 && c.coin >= coinNeed) { c.coin -= coinNeed; b.have.coin = (b.have.coin || 0) + coinNeed; }
  event(w, `The council takes on the ${spec.label}${lend ? ` and borrows ${lend} coin from the bank` : ''}: a coin for every material brought to the work${c.coin ? '' : ', once the council has coin to pay'}.`, 'build');
  for (const a of living) remember(w, a, `The council is paying coin for work on the ${spec.label}.`, 0.5);
}
// The council pays for work, a coin a material, while it has coin.
export function payWage(w, a, units, remember) {
  const wage = Math.min(units, Math.floor(w.council.coin));
  if (wage <= 0) return 0;
  w.council.coin -= wage; a.inv.coin = (a.inv.coin || 0) + wage; w.council.wagesPaid = (w.council.wagesPaid || 0) + wage;
  remember(w, a, `The council paid you ${wage} coin for your work on the ${I.BUILDS[w.council.project]?.label || w.council.project}.`, 0.4);
  return wage;
}
// Every night: the tithe from the till, the debt paid down, the project checked, a new ballot when there is none, and what the buildings do.
export function nightly(w, living, isFound, event, remember, isChild) {
  const c = w.council;
  // the tithe
  if (w.store.coin > 40) { const t = Math.max(1, Math.floor(w.store.coin * 0.02)); w.store.coin -= t; c.coin += t; c.income = (c.income || 0) + t; }
  // the project
  if (c.project && w.builds[c.project]?.done) {
    const spec = I.BUILDS[c.project];
    c.built.push({ key: c.project, day: w.day, wages: c.wagesPaid });
    w.seasonBuilt = (w.seasonBuilt || 0) + 1;
    event(w, `The ${spec.label} is finished. ${spec.effect}. The council paid ${c.wagesPaid} coin in wages${w.bank.civic.owed ? ` and owes the bank ${w.bank.civic.owed}` : ''}.`, 'healed');
    for (const a of living) { remember(w, a, `The ${spec.label} stands. ${spec.effect}. The village chose it and raised it.`, 0.8); B.gladden(a.body, 0.1); a.faith = B.clamp((a.faith || 0) + 0.01, -1, 1); }
    c.project = null; c.wagesPaid = 0;
  }
  // the debt: paid down between projects, and a little even during one
  if (w.bank.civic.owed > 0 && c.coin > (c.project ? 25 : 5)) {
    const pay = Math.min(w.bank.civic.owed, c.coin - (c.project ? 25 : 5));
    c.coin -= pay; w.bank.coin += pay; w.bank.civic.owed -= pay; w.bank.civic.repaid += pay;
  }
  // the ballot
  if (c.ballot && w.day >= c.ballot.closes) closeBallot(w, event, remember, living);
  // A new ballot when there is no project, and the council is not too deep in debt to borrow for another (or a season has passed anyway).
  else if (!c.project && !c.ballot && w.day - c.lastBallot >= 5 && living.length >= 3 && (w.bank.civic.owed <= 60 || w.day - c.lastBallot >= w.weather.daysPerSeason)) openBallot(w, isFound, event, remember, living);
  // what the buildings do
  const done = (k) => !!w.builds[k]?.done;
  for (const a of living) {
    if (done('commons')) B.gladden(a.body, a.location === 'hearth' ? 0.03 : 0.012);
    if (done('bathhouse')) { a.body.tightness = B.clamp(a.body.tightness - 0.008); if (a.ill) a.ill.severity = B.clamp(a.ill.severity - 0.04, 0, 1); }
    if (done('school') && isChild(w, a)) { a.body.openness = B.clamp(a.body.openness + 0.008); if (Math.random() < 0.15) { a.skills = a.skills || {}; const k = pick(['baking', 'sewing', 'brewing', 'carving', 'music']); a.skills[k] = (a.skills[k] || 0) + 1; } }
  }
}

// What a villager may know of the departments, for the scripted brain and the prompt.
export function snapshot(w, a) {
  const bt = w.council.ballot;
  return {
    bank: { coin: Math.floor(w.bank.coin), savings: Math.floor(w.bank.savings[a.id] || 0), owed: w.bank.loans[a.id]?.owed || 0, defaulted: !!w.bank.loans[a.id]?.defaulted },
    ballot: bt ? { id: bt.id, options: bt.options, voted: bt.votes[a.id] || null, closes: bt.closes, tally: tally(bt) } : null,
    council: { project: w.council.project, coin: Math.floor(w.council.coin) },
  };
}
export function felt(w, a) {
  const out = [];
  const bt = w.council.ballot;
  if (bt) out.push(bt.votes[a.id] ? `You voted for the ${I.BUILDS[bt.votes[a.id]].label}; the ballot closes in ${Math.max(0, bt.closes - w.day)} day${bt.closes - w.day === 1 ? '' : 's'}.` : `A vote is open at the meeting house on what the village builds next: ${bt.options.map(k => `the ${I.BUILDS[k].label} (${I.BUILDS[k].effect})`).join('; ')}. It closes in ${Math.max(0, bt.closes - w.day)} day${bt.closes - w.day === 1 ? '' : 's'}.`);
  if (w.council.project) out.push(`The council is raising the ${I.BUILDS[w.council.project].label}${w.council.coin > 0 ? ' and pays a coin for every material brought to it' : ', but has no coin left for wages'}.`);
  return out;
}
export function publicState(w) {
  const bt = w.council.ballot;
  return {
    bank: { coin: Math.floor(w.bank.coin), savings: Object.entries(w.bank.savings).map(([id, n]) => ({ id, n: Math.floor(n) })), savingsTotal: Math.floor(Object.values(w.bank.savings).reduce((s, n) => s + n, 0)), loans: Object.values(w.bank.loans), civic: w.bank.civic, ledger: w.bank.ledger.slice(-12), interestPaid: w.bank.interestPaid || 0 },
    council: { project: w.council.project, coin: Math.floor(w.council.coin), wagesPaid: w.council.wagesPaid || 0, income: w.council.income || 0, built: w.council.built, lastResult: w.council.lastResult || null, votesCast: w.council.votesCast || 0,
      ballot: bt ? { opened: bt.opened, closes: bt.closes, options: bt.options, tally: tally(bt), votes: bt.votes } : null },
  };
}
