// Families. Two people bond and try to stay together to raise a child.
// Attachment is the receipt for the labour: it grows only for whoever does the tending.
// Villagers have no sex; any bonded pair can have a child. Who ends up giving everything
// and who rides on it comes from wounds, traits and minds, not from a rule.

import * as B from './body.js';
import * as W from './weather.js';
import { trustOf, bumpTrust, remember, event, byId, alive, sameSpot, emotionalEvent, newAgent, ageOf, stageOf, simDate, PLACES, HOME_SPOTS, moveTo } from './world.js';
import { branch } from './wounds.js';
import { compatibility, compatibilityWords } from './chart.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const CHILD_NAMES = ['Fen', 'Lark', 'Moss', 'Rue', 'Teal', 'Ives', 'Sorrel', 'Kit', 'Ada', 'Bram', 'Wick', 'Pim', 'Nan', 'Tarn', 'Elm', 'Sky'];

export const isChild = (w, a) => ageOf(w, a) < 16;
const isAdult = (w, a) => { const age = ageOf(w, a); return age >= 18 && age <= 75; };
const strongClose = (a) => a.wounds.some(r => r.trigger === 'closeness' && r.strength > 0.5);

export function ensure(a) {
  a.partner = a.partner ?? null;
  a.children = a.children || [];
  a.parents = a.parents || [];
  a.attach = a.attach || {};        // childId -> acts of care given
  a.tended = a.tended || {};        // (children) carerId -> acts of care received
  a.bondStrength = a.bondStrength ?? 0;
  a.togetherToday = a.togetherToday || false;
  a.neglectDays = a.neglectDays || 0;
  a.childDays = a.childDays || 0;
}

// ---------- bonding ----------

export function canBond(w, a, o) {
  return a !== o && a.alive && o.alive && !a.partner && !o.partner && isAdult(w, a) && isAdult(w, o)
    && !a.parents.includes(o.id) && !o.parents.includes(a.id);
}

// Returns true if they are together now; false if the other pulled away.
export function propose(w, a, o) {
  ensure(a); ensure(o);
  if (!canBond(w, a, o)) return false;
  const t = trustOf(o, a);
  const stars = compatibility(a.chart, o.chart);
  // Trust opens the door; the stars decide how easily they walk through it.
  const accepts = t > 0.45 - (stars - 0.5) * 0.3 && !strongClose(o) && Math.random() < 0.3 + t * 0.4 + (stars - 0.5) * 0.6;
  if (!accepts) {
    event(w, `${a.name} asks ${o.name} to stay together. ${o.name} pulls back.`, 'rebuff', [a.id, o.id]);
    emotionalEvent(w, a, 'rebuffed', o, 0.35);
    remember(w, a, `You asked ${o.name} to be yours and they pulled back.`, 0.8);
    remember(w, o, `${a.name} asked you to stay together. You could not.`, 0.6);
    return false;
  }
  bond(w, a, o);
  return true;
}

function bond(w, a, o) {
  a.partner = o.id; o.partner = a.id; a.bondSince = o.bondSince = w.day;
  a.stars = o.stars = compatibility(a.chart, o.chart);
  a.bondStrength = o.bondStrength = 0.4 + a.stars * 0.3;
  o.home = { ...a.home };                                   // they share a roof now
  bumpTrust(a, o, 0.15); bumpTrust(o, a, 0.15);
  a.exposures.closeness = true; o.exposures.closeness = true;
  event(w, `${a.name} and ${o.name} are together now. ${o.name} moves into ${a.name}'s house.`, 'share', [a.id, o.id]);
  remember(w, a, `${o.name} said yes. You share a roof now.`, 1);
  remember(w, o, `You moved in with ${a.name}. You share a roof now.`, 1);
}

export function leave(w, a, reason = 'left') {
  ensure(a);
  const o = byId(w, a.partner);
  a.partner = null; a.bondStrength = 0;
  if (!o) return;
  o.partner = null; o.bondStrength = 0;
  // The leaver finds an empty house. Children stay with whoever tended them more.
  const used = new Set(alive(w).filter(x => x !== a).map(x => `${x.home.x},${x.home.y}`));
  const spot = HOME_SPOTS.find(h => !used.has(`${h.x},${h.y}`));
  if (spot) a.home = { ...spot };
  for (const cid of [...a.children]) {
    const c = byId(w, cid); if (!c || !c.alive || !isChild(w, c)) continue;
    const stays = (o.attach[cid] || 0) >= (a.attach[cid] || 0) ? o : a;
    c.home = { ...stays.home };
    remember(w, c, `${a.name} and ${o.name} are no longer together. You live with ${stays.name} now.`, 0.9);
    if (stays !== a) emotionalEvent(w, c, 'abandoned', a, 0.5);
  }
  event(w, `${a.name} leaves ${o.name}.`, 'strike', [a.id, o.id]);
  emotionalEvent(w, o, 'abandoned', a, 0.7);
  remember(w, o, `${a.name} left you.`, 1);
  remember(w, a, `You left ${o.name}.`, 0.8);
  bumpTrust(o, a, -0.4);
}

// ---------- children ----------

export function tryConceive(w) {
  w.due = w.due || [];
  const season = W.seasonOf(w.day, w.weather);
  if (!['spring', 'summer'].includes(season)) return;
  const seen = new Set();
  for (const a of alive(w)) {
    ensure(a);
    if (!a.partner || seen.has(a.id)) continue;
    const o = byId(w, a.partner); if (!o || !o.alive) continue;
    seen.add(a.id); seen.add(o.id);
    const ageA = ageOf(w, a), ageO = ageOf(w, o);
    if (ageA < 18 || ageA > 50 || ageO < 18 || ageO > 50) continue;
    if (a.bondStrength < 0.5 || a.inv.food < 1.2 || o.inv.food < 1.2) continue;
    const young = [...a.children, ...o.children].some(id => { const c = byId(w, id); return c && c.alive && ageOf(w, c) < 4; });
    if (young || w.due.some(d => d.parents.includes(a.id))) continue;
    if (Math.random() < 0.03) {
      w.due.push({ parents: [a.id, o.id], day: w.day + w.weather.daysPerSeason });
      event(w, `${a.name} and ${o.name} are expecting a child.`, 'season', [a.id, o.id]);
      remember(w, a, `A child is coming.`, 0.9); remember(w, o, `A child is coming.`, 0.9);
    }
  }
}

export function births(w) {
  w.due = w.due || [];
  for (const d of [...w.due]) {
    if (d.day > w.day) continue;
    w.due = w.due.filter(x => x !== d);
    const [p1, p2] = d.parents.map(id => byId(w, id));
    const carer = (p1 && p1.alive) ? p1 : (p2 && p2.alive) ? p2 : null;
    if (!carer) continue;
    const used = new Set(w.agents.map(a => a.name));
    const name = CHILD_NAMES.find(n => !used.has(n)) || `Little-${Math.random().toString(36).slice(2, 5)}`;
    const c = newAgent(w, { name, upbringing: 'raised', birthMs: simDate(w), brain: 'scripted' });
    ensure(c);
    c.ageAtArrival = 0;
    c.wounds = [];                       // a newborn has no rules yet. The village writes them.
    c.body = B.newBody({ openness: 0.7, tightness: 0.1 });
    c.inv.food = 0;
    c.home = { ...carer.home }; c.pos = { ...c.home }; c.location = 'home';
    c.parents = d.parents.filter(id => byId(w, id));
    for (const pid of c.parents) { const p = byId(w, pid); if (p) { ensure(p); p.children.push(c.id); p.attach[c.id] = 1; remember(w, p, `${c.name} was born. Yours.`, 1); } }
    c.memories = [{ day: w.day, tick: w.tick, text: `You were born to ${c.parents.map(id => byId(w, id).name).join(' and ')}.`, weight: 1 }];
    const names = c.parents.map(id => byId(w, id).name).join(' and ');
    event(w, `A child is born to ${names}. They name them ${c.name}.`, 'healed', [c.id, ...c.parents]);
    (w.seasonBorn = w.seasonBorn || []).push({ name: c.name });
  }
}

// What a child does. Small children stay near a parent; older ones roam a little.
export function childDecide(w, c) {
  ensure(c);
  const age = ageOf(w, c);
  const parents = c.parents.map(id => byId(w, id)).filter(p => p && p.alive);
  const near = sameSpot(w, c);
  if (c.body.overwhelmed > 0) return { type: 'rest', thought: age < 6 ? 'Crying.' : 'Can\'t stop crying.' };
  if (age < 6) {
    const p = parents.find(p => near.includes(p));
    if (p) return { type: 'rest', thought: 'Near.' };
    const home = parents.find(p => p.location === 'home');
    return home ? { type: 'withdraw', thought: 'Home.' } : { type: 'rest', thought: 'Waiting.' };
  }
  // 6 to 15: follow a parent, play at the hearth, forage berries when older.
  const p = pick(parents.length ? parents : [null]);
  if (age >= 10 && c.body.food < 0.5 && W.seasonOf(w.day, w.weather) !== 'winter' && Math.random() < 0.5) return { type: 'forage', to: 'meadow', thought: 'Berries.' };
  if (p && p.location !== 'home' && Math.random() < 0.6) return { type: 'go', to: p.id, thought: `Where ${p.name} is.` };
  if (near.length && Math.random() < 0.5) return { type: 'talk', target: pick(near).id, say: pick(CHILD_TALK), thought: 'Play.' };
  return Math.random() < 0.5 ? { type: 'go', to: 'hearth', thought: 'The fire.' } : { type: 'withdraw', thought: 'Home.' };
}
const CHILD_TALK = ['Look what I found.', 'Are you sad?', 'I\'m hungry.', 'Tell me about before.', 'Why is the sky like that?', 'Watch me!'];

// ---------- each tick: needs, tending, attachment ----------

export function familyTick(w) {
  const living = alive(w);
  for (const a of living) ensure(a);
  // Partners who spent a moment together today.
  for (const a of living) if (a.partner) { const o = byId(w, a.partner); if (o && sameSpot(w, a).includes(o)) a.togetherToday = true; }

  for (const c of living) {
    if (!isChild(w, c)) continue;
    const near = sameSpot(w, c);
    const age = ageOf(w, c);
    // Feeding. Parents first, then any adult with plenty. The village raises children too.
    if (c.body.food < 0.5) {
      const carers = [...c.parents.map(id => byId(w, id)).filter(p => p && p.alive && near.includes(p) && p.inv.food >= 0.3),
        ...near.filter(o => !c.parents.includes(o.id) && !isChild(w, o) && o.inv.food >= 1 && branch(o) !== 'outward')];
      const p = carers[0];
      if (p) {
        p.inv.food -= 0.3; B.eat(c.body, 0.3);
        tend(w, p, c, 'fed');
      }
    }
    // Comfort. An attached or open adult sits with a crying child. A wounded one may not.
    if (c.body.overwhelmed > 0 || c.body.tightness > 0.55) {
      const adults = near.filter(o => !isChild(w, o));
      const p = adults.find(o => (o.attach[c.id] || 0) > 2 && branch(o) !== 'inward') || adults.find(o => ['open', 'healed'].includes(branch(o)));
      if (p) { B.soothe(c.body, 0.35); tend(w, p, c, 'held'); c.exposures.closeness = true; }
    }
    // Small children outdoors without a grown-up: cold and frightened.
    if (age < 6 && c.location !== 'home' && !near.some(o => !isChild(w, o))) {
      c.body.tightness = B.clamp(c.body.tightness + 0.08);
      c.aloneTicks = (c.aloneTicks || 0) + 1;
    }
    // A hungry, cold, or crying child with no one near: neglect, and the body writes it.
    if ((c.body.food < 0.3 || c.body.warmth < 0.3 || c.body.overwhelmed > 0) && !near.some(o => !isChild(w, o))) {
      c.neglectTicks = (c.neglectTicks || 0) + 1;
      if (c.neglectTicks % 4 === 0) emotionalEvent(w, c, 'abandoned', null, 0.35);
    }
  }
  // Protectiveness: a parent whose child is hurt or crying nearby feels it in their own body.
  for (const p of living) {
    for (const cid of p.children) {
      const c = byId(w, cid); if (!c || !c.alive || !isChild(w, c)) continue;
      if ((p.attach[cid] || 0) < 3) continue;
      if (c.lastHitBy && sameSpot(w, p).includes(c)) {
        const who = byId(w, c.lastHitBy);
        p.body.tightness = B.clamp(p.body.tightness + 0.25);
        if (who && who !== p) { bumpTrust(p, who, -0.6); remember(w, p, `${who.name} hurt your child.`, 1); p.avenge = who.id; }
      } else if (c.body.overwhelmed > 0 && sameSpot(w, p).includes(c)) p.body.tightness = B.clamp(p.body.tightness + 0.06);
    }
  }
}

function tend(w, p, c, what) {
  p.attach[c.id] = (p.attach[c.id] || 0) + 1;
  c.tended[p.id] = (c.tended[p.id] || 0) + 1;
  bumpTrust(c, p, 0.06);
  c.exposures.asking = true;
  if ((p.attach[c.id] || 0) % 20 === 0) remember(w, p, `You have ${what} ${c.name} more times than you can count. They are part of you now.`, 0.8);
  if (what === 'held') { remember(w, c, `${p.name} held you while you cried.`, 0.7); p.exposures.closeness = true; }
}

// ---------- nightly: bonds, births, growing up ----------

export function familyNightly(w) {
  tryConceive(w);
  births(w);
  const living = alive(w);
  const seen = new Set();
  for (const a of living) {
    ensure(a);
    if (a.partner && !seen.has(a.id)) {
      const o = byId(w, a.partner);
      if (!o || !o.alive) { a.partner = null; a.bondStrength = 0; continue; }
      seen.add(a.id); seen.add(o.id);
      // Sleeping under one roof warms both. Tending each other and the children holds the bond.
      a.body.warmth = B.clamp(a.body.warmth + 0.1); o.body.warmth = B.clamp(o.body.warmth + 0.1);
      const together = a.togetherToday || o.togetherToday;
      const cared = a.children.some(cid => (a.attach[cid] || 0) > 0 && (o.attach[cid] || 0) > 0);
      // When the stars sit well the bond holds on its own. When they pull, it needs tending every day.
      const stars = a.stars ?? compatibility(a.chart, o.chart);
      let d = (together ? 0.03 : -0.05) + (stars - 0.5) * 0.06;
      if (cared) d += 0.02;
      // One partner doing all the tending wears the bond thin on both sides.
      const mine = a.children.reduce((s, cid) => s + (a.attach[cid] || 0), 0), theirs = a.children.reduce((s, cid) => s + (o.attach[cid] || 0), 0);
      if (mine + theirs > 10 && Math.min(mine, theirs) / Math.max(mine, theirs) < 0.25) {
        d -= 0.04;
        const tired = mine > theirs ? a : o;
        tired.body.energy = B.clamp(tired.body.energy - 0.1);
        if (w.day % 7 === 0) remember(w, tired, `You carry the children alone. ${(tired === a ? o : a).name} is not there for it.`, 0.8);
      }
      a.bondStrength = o.bondStrength = B.clamp(a.bondStrength + d);
      a.togetherToday = o.togetherToday = false;
      if (a.bondStrength <= 0.05) {
        const leaver = trustOf(a, o) < trustOf(o, a) ? a : o;
        leave(w, leaver);
      }
    }
    // Children grow. Neglect is counted by the day.
    if (isChild(w, a)) {
      a.childDays += 1;
      if ((a.neglectTicks || 0) >= 2 || (a.aloneTicks || 0) >= 3) a.neglectDays += 1;
      a.neglectTicks = 0; a.aloneTicks = 0;
      if (a.body.food < 0.6) { const p = a.parents.map(id => byId(w, id)).find(p => p && p.alive && p.inv.food >= 0.3); if (p) { p.inv.food -= 0.3; B.eat(a.body, 0.3); tend(w, p, a, 'fed'); } }
    }
  }
  // Coming of age.
  for (const a of living) {
    if (a.upbringing !== 'raised' || ageOf(w, a) < 16) continue;
    const ratio = a.childDays ? a.neglectDays / a.childDays : 0;
    a.upbringing = ratio < 0.12 ? 'warm' : ratio > 0.4 ? 'cold' : 'inconsistent';
    a.comeOfAgeDay = w.day;
    // Whoever tended them most gets first claim on their mind.
    const top = Object.entries(a.tended).sort((x, y) => y[1] - x[1])[0];
    const carer = top ? byId(w, top[0]) : null;
    if (carer && carer.owner) a.kinOwner = carer.owner;
    event(w, `${a.name} has come of age. Raised ${a.upbringing === 'warm' ? 'in a warm house' : a.upbringing === 'cold' ? 'in a cold house' : 'in a house that changed with the weather'}${carer ? `, mostly by ${carer.name}` : ''}.`, 'season', [a.id]);
    remember(w, a, `You are grown now. ${carer ? `${carer.name} raised you, mostly.` : 'You raised yourself, mostly.'}`, 1);
    for (const pid of a.parents) { const p = byId(w, pid); if (p && p.alive) remember(w, p, `${a.name} is grown.`, 0.8); }
  }
}

// ---------- what the family looks like from inside ----------

export function familyFelt(w, a) {
  ensure(a);
  const L = [];
  if (a.partner) { const o = byId(w, a.partner); if (o) L.push(`${o.name} is yours. You share a roof.${a.bondStrength < 0.3 ? ' It feels thin lately.' : a.bondStrength > 0.8 ? ' It holds.' : ''} ${compatibilityWords(a.stars ?? compatibility(a.chart, o.chart))}`); }
  for (const cid of a.children) {
    const c = byId(w, cid); if (!c) continue;
    if (!c.alive) { L.push(`Your child ${c.name} is dead.`); continue; }
    const age = Math.floor(ageOf(w, c));
    const state = c.body.overwhelmed > 0 ? 'crying' : c.body.food < 0.3 ? 'hungry' : c.body.warmth < 0.3 ? 'cold' : c.body.tightness > 0.5 ? 'frightened' : 'alright';
    const where = c.location === 'home' ? 'at home' : 'at ' + (PLACES[c.location]?.label || 'somewhere');
    L.push(`Your child ${c.name}, ${age}, is ${where} and ${state}.${(a.attach[cid] || 0) > 5 ? ' They are part of you.' : ''}`);
  }
  if (a.parents.length && isChild(w, a)) L.push(`Your parents are ${a.parents.map(id => byId(w, id)?.name).filter(Boolean).join(' and ')}.`);
  if (a.avenge) { const who = byId(w, a.avenge); if (who) L.push(`${who.name} hurt your child. Your hands remember it.`); }
  return L;
}

export function familyPublic(w, a) {
  ensure(a);
  return { partner: a.partner, children: a.children, parents: a.parents, bondStrength: a.bondStrength, stars: a.stars ?? null, attach: a.attach, tended: a.tended, neglectDays: a.neglectDays, childDays: a.childDays, isChild: isChild(w, a), kinOwner: !!a.kinOwner, comeOfAgeDay: a.comeOfAgeDay };
}

// ---------- infants ----------
// A baby (under six) cannot be left. Someone must be with them: a parent at home, a neighbour
// minding them, or a parent carrying them on the hip (slower, and no good in the field). A baby
// left alone cries, and everyone learns something about the parents.
const HARD = new Set(['work', 'forage', 'scout', 'hunt', 'build', 'strike', 'split', 'take']);
export const isInfant = (w, a) => a.alive && ageOf(w, a) < 6;
export function careForInfants(w, decisions) {
  const living = alive(w);
  w.infantsAlone = [];
  for (const a of living) a.carrying = null;
  for (const c of living) {
    if (!isInfant(w, c)) continue;
    ensure(c);
    const parents = c.parents.map(id => byId(w, id)).filter(p => p && p.alive);
    const homeOf = (o) => o.home.x === c.home.x && o.home.y === c.home.y;
    const sitters = living.filter(o => o !== c && !isChild(w, o) && (
      (o.location === 'home' && homeOf(o)) || o.location === `visit:${c.id}` || parents.some(p => o.location === `visit:${p.id}`)));
    if (sitters.length) {
      c.location = 'home'; c.pos = { ...c.home };
      c.minder = sitters[0].id;
      for (const s of sitters) { if (!parents.includes(s)) { s.attach = s.attach || {}; s.attach[c.id] = (s.attach[c.id] || 0) + 0.2; c.tended = c.tended || {}; c.tended[s.id] = (c.tended[s.id] || 0) + 0.2; } }
      c.aloneTicks = 0;
      continue;
    }
    // Nobody at the house. A parent whose day is not hard labour carries the baby.
    const carrier = parents.find(p => !HARD.has(decisions.get(p.id)?.type)) || null;
    if (carrier) {
      carrier.carrying = c.id; c.minder = carrier.id;
      c.location = carrier.location; c.pos = { x: carrier.pos.x - 0.5, y: carrier.pos.y + 0.2 };
      carrier.body.energy = B.clamp(carrier.body.energy - 0.02);
      carrier.attach = carrier.attach || {}; carrier.attach[c.id] = (carrier.attach[c.id] || 0) + 0.1;
      c.aloneTicks = 0;
      continue;
    }
    // Alone. It cries, and it is heard.
    c.minder = null; c.location = 'home'; c.pos = { ...c.home };
    c.aloneTicks = (c.aloneTicks || 0) + 1;
    c.body.tightness = B.clamp(c.body.tightness + 0.12); c.body.breath = B.clamp(c.body.breath - 0.08);
    w.infantsAlone.push({ id: c.id, name: c.name, home: c.home, parents: parents.map(p => p.id) });
    if (c.aloneTicks === 2) {
      c.body.overwhelmed = Math.max(c.body.overwhelmed, 1);
      event(w, `${c.name}, a baby, cries alone in ${parents[0] ? parents[0].name + "'s" : 'an empty'} house. The whole village can hear it.`, 'wound', [c.id, ...parents.map(p => p.id)]);
      for (const p of parents) { remember(w, p, `You left ${c.name} alone. You could hear the crying from where you were, and you kept working.`, 0.9); p.attach = p.attach || {}; p.attach[c.id] = Math.max(0, (p.attach[c.id] || 0) - 0.5); }
      if (parents[0]) emotionalEvent(w, c, 'abandoned', parents[0], 0.45);
      for (const o of living) if (!parents.includes(o) && o !== c && !isChild(w, o)) bumpTrust(o, parents[0] || o, parents[0] ? -0.04 : 0);
    }
  }
}
export function infantFelt(w, a) {
  const L = [];
  if (a.carrying) { const c = byId(w, a.carrying); if (c) L.push(`${c.name} is on your hip. You are slower with them, and they are ${c.body.warmth < 0.4 ? 'cold against you' : c.body.food < 0.4 ? 'hungry' : 'quiet, watching everything'}. Nothing hard can be done while you carry them.`); }
  for (const cid of a.children || []) {
    const c = byId(w, cid); if (!c || !isInfant(w, c)) continue;
    if (c.minder === a.id) continue;
    const m = c.minder && byId(w, c.minder);
    if (m) L.push(m.carrying === c.id ? `${c.name} is with ${m.name}, on their hip, at ${m.location === "home" ? "home" : (PLACES[m.location]?.label || "somewhere")}.` : `${c.name} is at home with ${m.name}.`);
    else L.push(`${c.name} is at home with NO ONE. A baby cannot be left. Stay with them (tend), take them with you (go anywhere but the field, forest, quarry or the pale), or ask someone to mind them.`);
  }
  for (const x of w.infantsAlone || []) if (!(a.children || []).includes(x.id)) L.push(`You can hear ${x.name} crying alone in ${byId(w, x.parents[0])?.name || 'someone'}'s house. You could go and mind them (mind {target: "${x.name}"}).`);
  return L;
}
