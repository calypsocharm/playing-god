// A rival fire past the pale. Another people, out where the map runs out: they hunt the same deer,
// they trade when they are friendly, they raid when they are hungry and cold toward the village.
// They are not villagers; they are a pressure with a name. The sky can show both fires the same
// star, and the villagers can carry food out to the edge for them. Later, a second Creator may
// hold their fire.

import * as B from './body.js';
import * as I from './items.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const SPOT = { x: 66, y: 27 };
const NAMES = ['the far fire', 'the lake people', 'the fire beyond the hills', 'the eastern fire'];
const LEADERS = ['Harrow', 'Vesk', 'Oda', 'Brann', 'Sil', 'Maren'];

export function ensure(w) {
  if (!w.rival) w.rival = { name: pick(NAMES), leader: pick(LEADERS), x: SPOT.x, y: SPOT.y, seen: null, people: 8, food: 6, wood: 8, mood: 0, strength: 3, lastTrade: -99, lastRaid: -99, trades: 0, sent: 0, raids: [], trader: null, hungryNights: 0, log: [] };
  return w.rival;
}
export const moodWord = (m) => m > 0.4 ? 'friendly' : m > 0.1 ? 'warm' : m > -0.2 ? 'wary' : m > -0.5 ? 'cold' : 'hostile';
const log = (w, text) => { w.rival.log.push({ day: w.day, text }); if (w.rival.log.length > 30) w.rival.log.shift(); };

function see(w, c, how) {
  const r = w.rival; r.seen = w.day;
  c.reveal(r.x, r.y, 5);
  c.event(`${how} There is another fire out past the pale: ${r.name}, ${r.people} of them, under someone called ${r.leader}.`, 'god');
  for (const a of c.alive()) c.remember(a, `${how} There are other people out there, past the pale: ${r.name}. No one knows what they want.`, 0.9);
  log(w, `The village first saw ${r.name}.`);
}

// Every night.
export function nightly(w, c) {
  const r = ensure(w);
  // Found: a scout walks near, or by the middle of the second year their smoke is seen anyway.
  if (!r.seen) {
    const near = c.alive().some(a => Math.hypot(a.pos.x - r.x, a.pos.y - r.y) < 12);
    if (near) see(w, c, 'A scout comes back with the news: smoke, and tents, and dogs barking in the dark.');
    else if (w.day >= c.yearDays() * 1.5 && Math.random() < 0.1) see(w, c, 'Smoke on the far hills at dusk, where no one has walked.');
    else return;
  }
  // Their own life: they eat, they hunt the same deer, they grow or shrink.
  r.food -= 1 + r.people * 0.05;
  r.food += Math.random() < 0.5 ? 2 : 0;   // fish and small game of their own
  if (r.food < 4 && (w.deer || 0) > 0 && Math.random() < 0.35) { w.deer -= 1; r.food += 3; if (Math.random() < 0.3) c.event(`Deer tracks lead east out of the wood. ${r.name[0].toUpperCase() + r.name.slice(1)} hunt these woods too.`, 'info'); }
  if (r.food <= 0) { r.food = 0; r.hungryNights += 1; if (r.hungryNights >= 6 && r.people > 3) { r.people -= 1; r.hungryNights = 0; log(w, 'One of them died hungry.'); } }
  else r.hungryNights = 0;
  if (r.food > 6 && r.people < 20 && Math.random() < 0.03) { r.people += 1; log(w, 'A child born, or a stranger taken in.'); }
  // Mood drifts home; scarcity sours it.
  r.mood += (0 - r.mood) * 0.01;
  if ((w.deer || 0) < 3) r.mood -= 0.015;
  r.mood = B.clamp(r.mood, -1, 1);
  r.trader = null;
  // Trade, when they are warm enough and it has been a while, or the sky asked.
  if ((r.mood > -0.25 && w.day - r.lastTrade > 8 && Math.random() < 0.22) || r.parley === w.day - 1) trade(w, c);
  // Raid, when they are cold toward the village and hungry, and not too soon after the last.
  else if (r.mood < -0.4 && w.day - r.lastRaid > 20 && (r.food < 2 || Math.random() < 0.12)) raid(w, c);
}

function trade(w, c) {
  const r = w.rival, st = w.store;
  const brought = { fish: 3, clay: 2, stone: 3, charm: Math.random() < 0.3 ? 1 : 0 };
  const sold = []; let earned = 0;
  for (const [item, n] of Object.entries(brought)) { if (!n) continue; const p = I.sellPrice(st, item); if (p == null || p <= 0 || st.coin - earned < p * n + 10) continue; st.shelf[item] = (st.shelf[item] || 0) + n; earned += p * n; sold.push(`${n} ${item}`); }
  st.coin -= earned;
  let bought = 0;
  if ((st.shelf.food || 0) > 10) { const p = I.buyPrice(st, 'food'); bought = Math.min(4, Math.floor(earned / Math.max(1, p))); st.shelf.food -= bought; st.coin += bought * p; r.food += bought; }
  r.lastTrade = w.day; r.trades += 1; r.trader = { day: w.day, name: r.leader, sold, bought };
  r.mood = B.clamp(r.mood + 0.06, -1, 1);
  c.event(`A trader from ${r.name} comes to the edge with ${sold.join(', ') || 'nothing to sell'}${bought ? ` and leaves with ${bought} food` : ''}. ${r.leader} speaks for them.`, 'trade');
  for (const a of c.alive()) c.remember(a, `${r.leader} from ${r.name} traded at the edge today${sold.length ? `: ${sold.join(', ')}` : ''}. They looked at the houses a long time.`, 0.5);
  log(w, `Traded: ${sold.join(', ') || 'nothing'} for ${bought} food.`);
}

function raid(w, c) {
  const r = w.rival, living = c.alive();
  const dogs = c.animals().filter(x => x.kind === 'dog' && x.owner).length;
  const atHearth = living.filter(a => a.location === 'hearth' || a.location === 'well' || a.location === 'store');
  const armed = atHearth.filter(a => a.inv.axe > 0);
  const defence = dogs + armed.length * 1.5 + (w.builds.hall?.done ? 1 : 0) + living.filter(a => a.upgrades?.fence).length * 0.3;
  r.lastRaid = w.day;
  if (defence >= r.strength) {
    r.strength = Math.max(1, r.strength - 1); r.people = Math.max(2, r.people - 1); r.mood = B.clamp(r.mood - 0.1, -1, 1);
    for (const a of armed) { c.remember(a, `Raiders came out of the dark from ${r.name} and you stood at the hearth with an axe until they went.`, 1); for (const o of living) if (o !== a) c.bumpTrust(o, a, 0.08); }
    for (const a of living) if (!armed.includes(a)) c.remember(a, `Raiders from ${r.name} came in the night. ${armed.length ? armed.map(x => x.name).join(', ') + ' held the hearth' : 'The dogs held them'}. They went back to the dark.`, 0.8);
    c.event(`Raiders from ${r.name} come in the night and are driven off${armed.length ? ` by ${armed.map(x => x.name).join(', ')}` : ' by the dogs'}. One of them does not go home.`, 'healed');
    r.raids.push({ day: w.day, repelled: true }); log(w, 'Raided the village and were driven off.');
  } else {
    const food = Math.round((w.store.shelf.food || 0) * 0.3), wood = Math.round(w.hearth.wood * 0.4), coin = Math.round(w.store.coin * 0.2);
    w.store.shelf.food = Math.max(0, (w.store.shelf.food || 0) - food); w.hearth.wood -= wood; w.store.coin -= coin; r.food += food; r.wood += wood;
    for (const a of atHearth) B.physicalHit(a.body, 0.25);
    for (const a of living) { c.remember(a, `Raiders from ${r.name} came in the night and took what they wanted: ${food} food, ${wood} wood, ${coin} coin. No one could stop them.`, 1); a.faith = B.clamp((a.faith || 0) - 0.03, -1, 1); }
    c.event(`Raiders from ${r.name} come in the night and take ${food} food, ${wood} wood and ${coin} coin from the village. ${atHearth.length ? atHearth.map(x => x.name).join(', ') + (atHearth.length === 1 ? ' is' : ' are') + ' hurt.' : 'No one was awake to stop them.'}`, 'wound');
    r.raids.push({ day: w.day, repelled: false, food, wood, coin }); log(w, `Raided the village and took ${food} food, ${wood} wood, ${coin} coin.`);
  }
}

// A villager carries food out to the edge and leaves it for them.
export function send(w, a, n, c) {
  const r = ensure(w);
  if (!r.seen) { c.remember(a, 'You carried food to the edge for people you have only heard of, and left it on a stone.', 0.4); }
  n = Math.max(1, Math.min(Math.floor(a.inv.food), Math.floor(n || 2)));
  if (n < 1) { c.remember(a, 'You went to the edge with nothing to leave.', 0.2); return false; }
  a.inv.food -= n; r.food += n; r.sent += n;
  r.mood = B.clamp(r.mood + Math.min(0.2, 0.05 * n), -1, 1);
  c.event(`${a.name} carries ${n} food out to the edge and leaves it for ${r.name}.`, 'share', [a.id]);
  c.remember(a, `You left ${n} food at the edge for ${r.name}. Someone was watching from the grass; you felt it.`, 0.7);
  for (const o of c.alive()) if (o !== a && Math.random() < 0.5) { c.bumpTrust(o, a, 0.03); c.remember(o, `${a.name} carried food out to ${r.name}. Some say it is wise. Some say it is feeding wolves.`, 0.4); }
  log(w, `${a.name} left ${n} food at the edge.`);
  return true;
}

// The sky shows both fires the same star.
export function parley(w, c) {
  const r = ensure(w);
  if (!r.seen) return { error: 'the village has not seen another fire yet' };
  r.mood = B.clamp(r.mood + 0.3, -1, 1); r.parley = w.day;
  c.event(`The same star stands over both fires all night, ${r.name} and the village, and everyone at both sees it.`, 'god');
  for (const a of c.alive()) { c.remember(a, `A star stood over the village all night, and over ${r.name} too; you could see their fire lit under it. It felt like being told something.`, 0.8); a.faith = B.clamp((a.faith || 0) + 0.03, -1, 1); }
  log(w, 'The sky stood a star over both fires.');
  return { ok: true, text: `Both fires under one star. ${r.name[0].toUpperCase() + r.name.slice(1)} are ${moodWord(r.mood)} now, and a trader will come in the morning.` };
}

// A deer taken by the village, with them watching.
export function deerTaken(w) { const r = w.rival; if (r?.seen) r.mood = B.clamp(r.mood - 0.03, -1, 1); }

export function snapshot(w, a) {
  const r = w.rival; if (!r?.seen) return null;
  return { name: r.name, mood: moodWord(r.mood), traderHere: r.trader?.day === w.day, raidedRecently: r.raids.some(x => w.day - x.day <= 5 && !x.repelled) };
}
export function felt(w, a) {
  const r = w.rival; if (!r?.seen) return [];
  const out = [`Out past the pale there is another fire, ${r.name}, and they are ${moodWord(r.mood)} toward the village${r.mood < -0.3 ? '. People lock their doors' : r.mood > 0.3 ? '. Their trader is welcome at the edge' : ''}.`];
  if (r.trader?.day === w.day) out.push(`${r.leader} from ${r.name} is at the edge today, trading.`);
  const raid = r.raids.slice(-1)[0]; if (raid && w.day - raid.day <= 5) out.push(raid.repelled ? `Raiders from ${r.name} came ${w.day - raid.day} nights ago and were driven off.` : `Raiders from ${r.name} came ${w.day - raid.day} nights ago and took what they wanted.`);
  return out;
}
export function publicState(w) {
  const r = w.rival; if (!r) return null;
  return { name: r.name, leader: r.leader, x: r.x, y: r.y, seen: r.seen, people: r.seen ? r.people : null, mood: r.seen ? moodWord(r.mood) : null, moodN: r.seen ? +r.mood.toFixed(2) : null, food: r.seen ? Math.round(r.food) : null, strength: r.seen ? r.strength : null, trader: r.trader, trades: r.trades, sent: r.sent, raids: r.raids.slice(-6), log: r.log.slice(-8), lastTrade: r.lastTrade, lastRaid: r.lastRaid };
}
