// The sky turns a card. Seventy-eight of them, one deck, shuffled and drawn down; each one lands as
// something that actually happens in the village, through the same machinery as everything else:
// a harvest, a liar found out, a building finished, a bond made, a wound reopened, a death.
// The Creator can draw one for an attention; the sky draws one of its own at every season turn.

import * as B from './body.js';
import * as I from './items.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const SUITS = { pentacles: 'the field and the coin', swords: 'what is said and what is true', wands: 'what is built and what burns', cups: 'the heart' };
const RANKS = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Page', 'Knight', 'Queen', 'King'];

// ---------- helpers over the village ----------
const adults = (c) => c.alive().filter(a => !c.isChild(a));
const byJoy = (c) => [...c.alive()].sort((x, y) => (x.body.joy ?? 0.5) - (y.body.joy ?? 0.5));
const richest = (c) => [...c.alive()].sort((x, y) => (y.inv.coin || 0) - (x.inv.coin || 0))[0];
const poorest = (c) => [...c.alive()].sort((x, y) => (x.inv.coin || 0) + x.inv.food - (y.inv.coin || 0) - y.inv.food)[0];
const oldest = (c) => [...c.alive()].sort((x, y) => c.ageOf(y) - c.ageOf(x))[0];
const wounded = (c) => c.alive().filter(a => a.wounds.length);
const grieving = (c) => c.alive().filter(a => (a.grief || []).length);
const sick = (c) => c.alive().filter(a => a.ill);
function pairUnbonded(c) {
  let best = null, bt = 0.3;
  for (const a of adults(c)) for (const o of adults(c)) { if (a === o || a.partner || o.partner || !c.canBond(a, o)) continue; const t = Math.min(c.trustOf(a, o), c.trustOf(o, a)); if (t > bt) { bt = t; best = [a, o]; } }
  return best;
}
function thief(c) {
  const e = [...c.w.log].reverse().find(e => e.kind === 'strike' && /takes .*'s/.test(e.text) && c.w.day - e.day <= 40);
  if (!e) return null;
  const a = c.byId(e.who[0]), v = c.byId(e.who[1]);
  return a && a.alive ? { a, v, e } : null;
}
function striker(c) {
  const e = [...c.w.log].reverse().find(e => e.kind === 'strike' && /strikes/.test(e.text) && c.w.day - e.day <= 40);
  if (!e) return null;
  const a = c.byId(e.who[0]); return a && a.alive ? a : null;
}
const all = (c, f) => { for (const a of c.alive()) f(a); };
const names = (list) => list.map(a => a.name).join(', ');

// ---------- the minor arcana, by suit and rank ----------
const MINOR = {
  pentacles: {
    Ace:    (c) => { all(c, a => { a.inv.coin = (a.inv.coin || 0) + 2; }); return 'A coin in every hand: two each, from nowhere.'; },
    Two:    (c) => { const a = richest(c), b = poorest(c); if (!a || !b || a === b) return 'Nothing changed hands.'; const n = Math.floor((a.inv.coin || 0) / 2); a.inv.coin -= n; b.inv.coin = (b.inv.coin || 0) + n; c.remember(a, `Half your coin went to ${b.name}. You did not decide it.`, 0.6); c.remember(b, `${a.name}'s coin came to you, ${n} of it, and no one can say why.`, 0.7); return `${a.name}'s coin is halved and ${b.name} finds ${n} in their pocket.`; },
    Three:  (c) => { const p = c.w.council.project; if (!p) return 'There was no work to speed.'; const b = c.w.builds[p]; for (const [m, n] of Object.entries(I.BUILDS[p].cost)) b.have[m] = Math.min(n, (b.have[m] || 0) + Math.ceil(n / 3)); return `The ${I.BUILDS[p].label} is a third nearer done; hands worked that no one saw.`; },
    Four:   (c) => { const a = richest(c); if (!a) return ''; c.w.bank.savings[a.id] = (c.w.bank.savings[a.id] || 0) + (a.inv.coin || 0); c.w.bank.coin += a.inv.coin || 0; a.inv.coin = 0; c.remember(a, 'All your coin is in the bank now. You do not remember walking there.', 0.5); return `${a.name}'s coin is all in the strongbox, every piece.`; },
    Five:   (c) => { for (const k of Object.keys(c.w.store.shelf)) c.w.store.shelf[k] = Math.floor((c.w.store.shelf[k] || 0) * 0.4); all(c, a => { a.body.warmth = B.clamp(a.body.warmth - 0.15); }); return 'The shelf is bare and a cold gets into every house.'; },
    Six:    (c) => { const loans = Object.entries(c.w.bank.loans); if (!loans.length) { c.w.bank.civic.owed = 0; return "The council's debt to the bank is forgiven."; } const [id, l] = pick(loans); const a = c.byId(id); delete c.w.bank.loans[id]; if (a) c.remember(a, `Someone paid off what you owed the bank, all ${l.owed} of it. You will never know who.`, 0.9); return `${l.name}'s debt is paid by a hand no one saw.`; },
    Seven:  (c) => { c.w.blessedField = c.w.day + 6; return 'The field will give half again as much for six days.'; },
    Eight:  (c) => { all(c, a => { a.skills = a.skills || {}; const k = pick(['baking', 'sewing', 'brewing', 'carving']); a.skills[k] = (a.skills[k] || 0) + 2; }); return 'Every pair of hands learns a little of a craft overnight.'; },
    Nine:   (c) => { const a = pick(byJoy(c).slice(-3)); if (!a) return ''; a.upgrades = a.upgrades || {}; a.upgrades.garden = a.upgrades.garden || c.w.day; a.inv.charm += 1; c.remember(a, 'A garden stands by your door that you did not plant, and a charm on the sill.', 0.8); return `${a.name} wakes to a garden and a charm.`; },
    Ten:    (c) => { c.w.store.shelf.food = (c.w.store.shelf.food || 0) + 40; all(c, a => { a.inv.food += 4; }); c.w.blessedField = c.w.day + 10; return 'An immense harvest: forty food on the shelf, four in every house, and the field giving for ten days more.'; },
    Page:   (c) => { const a = pick(c.alive()); if (!a) return ''; a.inv.coin = (a.inv.coin || 0) + 15; c.remember(a, 'You found fifteen coin in the dirt by the road.', 0.6); return `${a.name} finds fifteen coin in the road.`; },
    Knight: (c) => { c.w.store.coin += 60; return 'A cart leaves sixty coin in the till for goods it will collect another day.'; },
    Queen:  (c) => { all(c, a => { a.inv.food += 2; a.inv.bread += 1; }); return 'Bread and food at every door, two and one, still warm.'; },
    King:   (c) => { c.w.bank.coin += 100; return 'The strongbox holds a hundred coin more than it did.'; },
  },
  swords: {
    Ace:    (c) => { all(c, a => { c.remember(a, `You see clearly this morning who ${c.alive().filter(o => o !== a && c.trustOf(o, a) < -0.1).map(o => o.name).join(' and ') || 'no one'} wishes ill on you.`, 0.7); }); return 'Everyone wakes knowing exactly who wishes them ill.'; },
    Two:    (c) => { const bt = c.w.council.ballot; if (bt) { c.w.council.ballot = null; c.w.council.lastBallot = c.w.day; return 'The ballot is torn up; no one can agree and no one is chosen.'; } all(c, a => { a.body.openness = B.clamp(a.body.openness - 0.05); }); return 'A day of not deciding. Everyone closes a little.'; },
    Three:  (c) => { const a = pick(c.alive()); if (!a) return ''; const ex = a.partner ? c.byId(a.partner) : null; c.emotionalEvent(a, 'betrayed', ex || pick(c.alive().filter(o => o !== a)) || null, 0.7); return `${a.name}'s heart takes a blade: ${ex ? `something ${ex.name} said` : 'an old hurt'} goes straight in.`; },
    Four:   (c) => { all(c, a => { a.body.energy = B.clamp(a.body.energy + 0.4); B.soothe(a.body, 0.15); }); return 'A day of rest for everyone whether they like it or not.'; },
    Five:   (c) => { const s = striker(c); if (!s) return 'No one has raised a hand lately; the card passes.'; all(c, o => { if (o !== s) c.bumpTrust(o, s, -0.1); }); c.remember(s, 'You won that fight, and you can feel that no one is on your side.', 0.8); return `${s.name} won the last fight and lost everyone for it.`; },
    Six:    (c) => { const a = pick(wounded(c)); if (!a) return 'No one had a wound to carry away from.'; const r = a.wounds.sort((x, y) => y.strength - x.strength)[0]; r.strength = Math.max(0, r.strength - 0.3); c.remember(a, 'Something you carried is lighter this morning, as if you crossed water in the night.', 0.8); return `${a.name} crosses water in a dream and leaves some of it behind.`; },
    Seven:  (c) => { const a = pick(adults(c)), v = pick(adults(c).filter(o => o !== a)); if (!a || !v) return ''; const item = Object.keys(I.ITEMS).find(k => (v.inv[k] || 0) > 0) || 'food'; if (item === 'food') { const n = Math.min(2, v.inv.food); v.inv.food -= n; a.inv.food += n; } else { v.inv[item] -= 1; a.inv[item] = (a.inv[item] || 0) + 1; } c.remember(a, `You have ${v.name}'s ${I.ITEMS[item]?.label || item} and do not remember taking it.`, 0.6); c.remember(v, `Your ${I.ITEMS[item]?.label || item} is gone in the night.`, 0.7); return `${v.name}'s ${I.ITEMS[item]?.label || item} is in ${a.name}'s house by morning. No one saw.`; },
    Eight:  (c) => { const a = pick(c.alive()); if (!a) return ''; a.body.overwhelmed = 2; a.location = 'home'; a.pos = { ...a.home }; c.remember(a, 'You cannot leave the house. Nothing is holding you and you cannot leave.', 0.8); return `${a.name} cannot make themselves leave the house.`; },
    Nine:   (c) => { const a = pick(c.alive()); if (!a) return ''; a.body.tightness = B.clamp(a.body.tightness + 0.35); a.body.energy = B.clamp(a.body.energy - 0.3); c.remember(a, 'You did not sleep. Every fear you have sat on the bed with you.', 0.8); return `${a.name} does not sleep for the fears.`; },
    Ten:    (c) => { const s = striker(c) || thief(c)?.a; if (!s) return 'There was no one to bring low; the card passes.'; B.physicalHit(s.body, 0.5); all(c, o => { if (o !== s) c.bumpTrust(o, s, -0.15); }); c.remember(s, 'It all came down on you at once. Everything you did came back.', 1); return `Everything ${s.name} did comes back on them at once.`; },
    Page:   (c) => { const a = pick(c.alive()); if (!a) return ''; if (!a.sense) c.openSense(a, 'clairaudient', 'when the card turned'); return `${a.name} hears everything said in the village from now on.`; },
    Knight: (c) => { c.landThreat(); return c.w.threat?.landed === c.w.day ? `What was coming comes now, early: ${c.w.threat.name}.` : 'Nothing was coming; the charge finds no one.'; },
    Queen:  (c) => { const t = thief(c); if (!t) return 'No lie is found; no one has stolen lately.'; all(c, o => { if (o !== t.a) { c.bumpTrust(o, t.a, -0.25); c.remember(o, `${t.a.name} took from ${t.v?.name || 'someone'} and lied about it. Now everyone knows.`, 0.8); } }); c.remember(t.a, 'They know. All of them. You can see it in how they stand.', 1); c.emotionalEvent(t.a, 'struck', null, 0.4); return `${t.a.name} is found out: they took from ${t.v?.name || 'someone'} and lied. Everyone knows.`; },
    King:   (c) => { const bt = c.w.council.ballot; if (bt) { c.closeBallot(); return 'The vote is called early and counted.'; } for (const [id, l] of Object.entries(c.w.bank.loans)) if (l.defaulted) { const a = c.byId(id); if (a) { const n = Math.min(l.owed, a.inv.coin || 0); a.inv.coin -= n; c.w.bank.coin += n; l.owed -= n; if (l.owed <= 0) delete c.w.bank.loans[id]; c.remember(a, 'The debt was taken out of your hand, coin by coin, in front of everyone.', 0.8); } } return 'Judgement: every unpaid debt is collected on the spot.'; },
  },
  wands: {
    Ace:    (c) => { const a = pick(c.alive().filter(x => !x.gift)); if (!a) return 'Everyone already carries a gift.'; c.awaken(a, 'when the card turned'); return `Something wakes in ${a.name}.`; },
    Two:    (c) => { const a = pick(adults(c)); if (!a) return ''; a.explore = a.explore || { steps: 0 }; a.location = 'edge'; a.pos = { ...c.PLACES.edge }; c.remember(a, 'You are at the edge with the whole land in front of you. You are going out.', 0.7); return `${a.name} stands at the edge, looking out.`; },
    Three:  (c) => { c.w.builds.road = c.w.builds.road || { have: {}, done: false, builders: {} }; if (!c.w.builds.road.done) { c.w.builds.road.done = true; c.w.builds.road.day = c.w.day; } c.w.store.coin += 30; return 'The road is laid overnight and a cart is already on it with thirty coin.'; },
    Four:   (c) => { const p = c.w.council.project || Object.keys(I.BUILDS).find(k => !c.w.builds[k]?.done && !I.BUILDS[k].civic && (I.BUILDS[k].at !== 'creek' || c.isFound('creek'))); if (!p) return 'Nothing is being raised and the shared builds all stand; the card passes.'; const b = c.w.builds[p] = c.w.builds[p] || { have: {}, done: false, builders: {} }; for (const [m, n] of Object.entries(I.BUILDS[p].cost)) b.have[m] = n; b.done = true; b.day = c.w.day; if (c.w.council.project !== p) c.event(`The ${I.BUILDS[p].label} is finished. ${I.BUILDS[p].effect}.`, 'healed'); all(c, a => B.gladden(a.body, 0.1)); return `The ${I.BUILDS[p].label} goes up in a day. There is dancing.`; },
    Five:   (c) => { const near = c.alive().filter(a => a.location === 'hearth'); if (near.length < 2) return 'No crowd to quarrel; the card passes.'; for (const a of near) for (const o of near) if (a !== o) c.bumpTrust(a, o, -0.06); all(c, a => { a.body.tightness = B.clamp(a.body.tightness + 0.1); }); return `A quarrel at the hearth: ${names(near.slice(0, 4))} all talking, no one listening.`; },
    Six:    (c) => { const a = byJoy(c).slice(-1)[0]; if (!a) return ''; all(c, o => { if (o !== a) c.bumpTrust(o, a, 0.15); }); B.gladden(a.body, 0.2); c.remember(a, 'They carried you to the fire on their shoulders. You do not know what for and it does not matter.', 0.9); return `${a.name} is carried to the fire and cheered.`; },
    Seven:  (c) => { const a = pick(adults(c)); if (!a) return ''; a.inv.axe += 1; a.body.tightness = B.clamp(a.body.tightness - 0.1); c.remember(a, 'You held the door against something in the night, and it held. There is an axe in your hand.', 0.8); return `${a.name} holds the door against the dark and keeps the axe.`; },
    Eight:  (c) => { c.w.weather.tickMs = Math.max(2000, Math.round(c.w.weather.tickMs * 0.5)); return 'Everything moves fast: the clock runs at twice its speed until the sky sets it back.'; },
    Nine:   (c) => { all(c, a => { a.inv.wood += 3; a.inv.stone += 1; }); c.w.hearth.wood += 10; return 'Wood and stone stacked at every door, and ten on the hearth pile: they are ready for whatever comes.'; },
    Ten:    (c) => { const a = pick(adults(c)); if (!a) return ''; a.body.energy = B.clamp(a.body.energy - 0.5); a.inv.wood += 12; c.remember(a, 'You carried more than you should have. Your back knows it. The pile is huge.', 0.7); return `${a.name} carries twelve wood alone and can barely stand.`; },
    Page:   (c) => { const a = pick(c.alive()); if (!a) return ''; c.w.pendingHoliday = { by: a.id, reason: 'the card that turned' }; return `${a.name} has an idea for a day the village should keep.`; },
    Knight: (c) => { const a = c.newTraveler(); return `A stranger named ${a.name} rides in on the road, in a hurry.`; },
    Queen:  (c) => { const a = pick(c.alive().filter(x => !x.gift)); if (!a) return ''; c.awaken(a, 'kindling', 'when the card turned'); return `Fire wakes in ${a.name}: the hearth will never be cold with them near it.`; },
    King:   (c) => { const p = c.w.council.project; if (!p) { c.w.council.coin += 40; return 'Forty coin in the council chest for whatever is chosen next.'; } c.w.council.coin += 60; return `Sixty coin in the council chest for the ${I.BUILDS[p].label}: wages for all.`; },
  },
  cups: {
    Ace:    (c) => { all(c, a => { a.body.openness = B.clamp(a.body.openness + 0.1); B.gladden(a.body, 0.1); }); return 'Every heart opens a little. It is a good morning.'; },
    Two:    (c) => { const p = pairUnbonded(c); if (!p) return 'No two hearts were ready; the card passes.'; const ok = c.propose(p[0], p[1]); return ok ? `${p[0].name} and ${p[1].name} are together now.` : `${p[0].name} asks ${p[1].name} and is turned away, gently.`; },
    Three:  (c) => { c.w.pendingHoliday = null; const h = c.foundHoliday(pick(c.alive()), 'the card that turned'); return h ? `A day is made on the spot: ${h.name}. The whole village keeps it.` : 'A feast at the fire.'; },
    Four:   (c) => { const a = pick(c.alive()); if (!a) return ''; a.body.joy = B.clamp((a.body.joy ?? 0.5) - 0.2); c.remember(a, 'Everything offered to you today is nothing you want.', 0.6); return `${a.name} turns away from everything offered.`; },
    Five:   (c) => { const dead = c.w.agents.filter(x => !x.alive); const a = pick(c.alive()); if (!a || !dead.length) return 'No one to grieve; the card passes.'; const d = pick(dead); a.grief = a.grief || []; a.grief.push({ for: d.id, name: d.name, intensity: 0.5, day: c.w.day, shared: 0 }); c.remember(a, `${d.name} was in your dream and you woke with the loss of them fresh.`, 0.9); return `${a.name} wakes grieving ${d.name} as if it were the first day.`; },
    Six:    (c) => { all(c, a => { const m = a.memories.find(x => /born|child|toy|arrived in the village/.test(x.text)); if (m) c.remember(a, `You remember, clear as this morning: ${m.text}`, 0.5); a.body.openness = B.clamp(a.body.openness + 0.05); }); return 'Everyone remembers something from long ago, kindly.'; },
    Seven:  (c) => { const a = pick(c.alive()); if (!a) return ''; a.wants = pick(Object.keys(I.ITEMS)); c.remember(a, `You wanted one thing this morning and by noon you want a ${I.ITEMS[a.wants].label} instead.`, 0.5); return `${a.name} changes what they long for.`; },
    Eight:  (c) => { const a = pick(adults(c).filter(x => x.partner)); if (!a) return 'No one had anything to walk away from.'; c.leave(a); return `${a.name} walks away from what they had.`; },
    Nine:   (c) => { const a = pick(c.alive()); if (!a) return ''; if (a.wants) a.inv[a.wants] = (a.inv[a.wants] || 0) + 1; a.inv.pie += 1; B.gladden(a.body, 0.25); c.remember(a, `The thing you wanted is in your hands, and a pie beside it.`, 0.8); return `${a.name} gets their wish, and a pie.`; },
    Ten:    (c) => { all(c, a => { B.gladden(a.body, 0.2); for (const o of c.alive()) if (o !== a && (a.partner === o.id || (a.children || []).includes(o.id) || (a.parents || []).includes(o.id))) c.bumpTrust(a, o, 0.2); }); return 'Every family is whole for a day and knows it.'; },
    Page:   (c) => { const a = pick(c.alive().filter(x => !x.sense)); if (!a) return ''; c.openSense(a, 'empath', 'when the card turned'); return `${a.name} begins to feel what the people near them feel.`; },
    Knight: (c) => { const a = c.newTraveler(); a.body.openness = B.clamp(a.body.openness + 0.2); return `A traveler named ${a.name} comes up the road with an open face and a song.`; },
    Queen:  (c) => { const g = pick(grieving(c)) || pick(byJoy(c).slice(0, 3)); if (!g) return ''; for (const x of (g.grief || [])) x.intensity = Math.max(0, x.intensity - 0.4); B.soothe(g.body, 0.4); c.remember(g, 'Someone sat with you a whole night and you did not have to say anything.', 0.9); return `${g.name} is sat with all night and the weight lifts.`; },
    King:   (c) => { const s = pick(sick(c)); if (!s) { all(c, a => B.soothe(a.body, 0.1)); return 'Calm water: every chest lets go a little.'; } s.ill = null; c.remember(s, 'The fever left you between one breath and the next.', 0.9); return `${s.name} is well between one breath and the next.`; },
  },
};

// ---------- the major arcana ----------
const MAJOR = [
  ['The Fool', 'a new beginning, unguarded', (c) => { const a = c.newTraveler(); a.upbringing = 'warm'; a.inv.coin = 0; a.inv.food = 0.5; return `${a.name} walks in on the road with nothing at all and no fear.`; }],
  ['The Magician', 'skill, and the means to use it', (c) => { const a = pick(adults(c)); if (!a) return ''; a.inv.axe += 1; a.inv.hoe += 1; a.inv.rope += 2; a.inv.pot += 1; c.remember(a, 'Every tool you could want is laid on your table.', 0.7); return `${a.name} has every tool on the table this morning.`; }],
  ['The High Priestess', 'what is hidden is known', (c) => { const a = pick(c.alive().filter(x => !x.sense)); if (!a) return ''; c.openSense(a, 'claircognizant', 'when the card turned'); return `${a.name} knows, now, how everyone truly stands toward them.`; }],
  ['The Empress', 'abundance, a birth', (c) => { const r = c.tryConceive(); c.w.blessedField = c.w.day + 4; all(c, a => { a.inv.food += 1; a.inv.berries += 2; }); return `The field swells, berries in every basket${r ? `, and ${r} is expecting` : ''}.`; }],
  ['The Emperor', 'order, and a hand that rules', (c) => { c.w.council.coin += 30; if (c.w.council.ballot) c.closeBallot(); for (const l of Object.values(c.w.bank.loans)) l.defaulted = false; return 'The vote is called, the debts are forgiven their lateness, and thirty coin is put in the chest.'; }],
  ['The Hierophant', 'what is kept, and taught', (c) => { c.w.pendingHoliday = null; const a = oldest(c); const h = a ? c.foundHoliday(a, 'what the old know') : null; return h ? `${a.name} teaches the village a day to keep: ${h.name}.` : 'The old tell what they know at the fire.'; }],
  ['The Lovers', 'a choice of the heart', (c) => { const p = pairUnbonded(c); if (!p) return 'No two were ready.'; const ok = c.propose(p[0], p[1]); return ok ? `${p[0].name} and ${p[1].name} choose each other.` : `${p[0].name} asks ${p[1].name} and is refused.`; }],
  ['The Chariot', 'will, and going forward', (c) => { const a = pick(adults(c)); if (!a) return ''; const found = c.findNext(a); return found ? `${a.name} drives out into the pale and finds ${found}.` : `${a.name} drives out into the pale; there was nothing left to find.`; }],
  ['Strength', 'the gentle hand on the beast', (c) => { const s = pick(c.w.animals?.filter(x => x.alive && !x.owner && x.kind !== 'deer' && x.kind !== 'wolf') || []); const a = pick(adults(c)); if (!s || !a) { all(c, x => { x.body.tightness = B.clamp(x.body.tightness - 0.15); }); return 'Every clenched hand opens.'; } s.owner = a.id; c.remember(a, `${s.name} the ${s.kind} came to your hand and stayed.`, 0.7); return `${s.name} the ${s.kind} comes to ${a.name}'s hand.`; }],
  ['The Hermit', 'alone, on purpose', (c) => { const a = pick(adults(c)); if (!a) return ''; a.skills = a.skills || {}; a.skills.stillness = (a.skills.stillness || 0) + 4; a.location = 'home'; a.pos = { ...a.home }; c.remember(a, 'You went in and shut the door and the quiet was good.', 0.6); return `${a.name} shuts the door on everyone and is the better for it.`; }],
  ['Wheel of Fortune', 'turn, and turn again', (c) => { const a = richest(c), b = poorest(c); if (!a || !b || a === b) return 'The wheel turns and lands where it was.'; const ca = a.inv.coin || 0, cb = b.inv.coin || 0; a.inv.coin = cb; b.inv.coin = ca; return `The wheel turns: ${a.name} has ${b.name}'s purse and ${b.name} has ${a.name}'s.`; }],
  ['Justice', 'what is owed is paid', (c) => { const t = thief(c); if (t && t.v && t.v.alive) { const item = Object.keys(I.ITEMS).find(k => (t.a.inv[k] || 0) > 0); if (item) { t.a.inv[item] -= 1; t.v.inv[item] = (t.v.inv[item] || 0) + 1; } all(c, o => { if (o !== t.a) c.bumpTrust(o, t.a, -0.1); }); return `${t.a.name} gives back what they took from ${t.v.name}, in front of everyone.`; } return 'Nothing was owed; the scales hang level.'; }],
  ['The Hanged Man', 'waiting, upside down', (c) => { c.w.stillUntil = c.w.day + 1; for (const a of c.alive()) c.remember(a, 'You cannot move today. Nothing is wrong and nothing will come of trying. Hang there and look at the world the other way up.', 0.7); return 'No one can move today; the whole village hangs still and looks at the world the other way up.'; }],
  ['Death', 'an ending, and what follows', (c) => { const a = oldest(c); if (!a || c.ageOf(a) < 60) return 'Death passes the village by.'; c.die(a, 'old age'); return `${a.name}, the oldest, dies in their sleep.`; }],
  ['Temperance', 'the middle way', (c) => { all(c, a => { for (const k of ['warmth', 'food', 'energy', 'tightness', 'openness']) a.body[k] = B.clamp(a.body[k] * 0.5 + 0.25); }); return 'Every body settles to the middle: no one starving, no one full, no one shaking.'; }],
  ['The Devil', 'what has you', (c) => { const a = pick(adults(c)); if (!a) return ''; a.inv.coin = (a.inv.coin || 0) + 20; a.body.tightness = B.clamp(a.body.tightness + 0.3); c.w.bank.loans[a.id] = { owed: 20, since: c.w.day, name: a.name }; c.remember(a, 'Twenty coin in your hand and twenty owed, and you did not ask for either.', 0.8); return `${a.name} has twenty coin they did not ask for and a debt to match.`; }],
  ['The Tower', 'it all comes down', (c) => { c.landThreat(); const burned = Math.floor(c.w.hearth.wood * 0.5); c.w.hearth.wood -= burned; all(c, a => { B.physicalHit(a.body, 0.15); }); return `${c.w.threat?.landed === c.w.day ? c.w.threat.name[0].toUpperCase() + c.w.threat.name.slice(1) + ' lands now, and ' : ''}half the hearth pile is gone and everyone is shaken.`; }],
  ['The Star', 'hope, and healing', (c) => { all(c, a => { for (const r of a.wounds) r.strength = Math.max(0, r.strength - 0.25); B.soothe(a.body, 0.2); if (a.ill) a.ill.severity = B.clamp(a.ill.severity - 0.3, 0, 1); }); return 'Every wound in the village loosens; every sick body eases.'; }],
  ['The Moon', 'fear, and what is not there', (c) => { all(c, a => { a.body.tightness = B.clamp(a.body.tightness + 0.2); c.remember(a, 'Something moved at the edge of the light all night. Nothing was there. You know nothing was there.', 0.6); }); return 'A night of shapes at the edge of the light. Nothing was there.'; }],
  ['The Sun', 'joy, plainly', (c) => { all(c, a => { B.gladden(a.body, 0.3); a.body.warmth = B.clamp(a.body.warmth + 0.3); }); c.w.pendingHoliday = null; const h = c.foundHoliday(pick(c.alive()), 'a day of sun'); return `A day of sun in every chest${h ? `; they name it ${h.name}` : ''}.`; }],
  ['Judgement', 'called to account', (c) => { let n = 0; all(c, a => { const rule = a.wounds.sort((x, y) => y.strength - x.strength)[0]; if (rule && rule.contradictions >= 2) { a.wounds = a.wounds.filter(r => r !== rule); a.scars.push({ trigger: rule.trigger, belief: rule.belief, healedDay: c.w.day, woundedDay: rule.day }); c.remember(a, 'The old rule that ran you is read out loud and it does not hold. It is a scar now.', 1); n++; } }); c.w.seasonHealed = (c.w.seasonHealed || 0) + n; return n ? `${n} old rule${n === 1 ? '' : 's'} read aloud and let go.` : 'Everyone is called to account and found already answered.'; }],
  ['The World', 'complete, for now', (c) => { all(c, a => { B.gladden(a.body, 0.15); a.faith = B.clamp((a.faith || 0) + 0.1, -1, 1); }); c.w.god.attention = Math.min(c.w.god.max, c.w.god.attention + 2); return 'The village is whole for a day, and the sky is given two attention back.'; }],
];

// ---------- the deck ----------
export function deck() {
  const cards = [];
  for (const suit of Object.keys(MINOR)) for (const rank of RANKS) cards.push({ key: `${suit}:${rank}`, name: `${rank} of ${suit[0].toUpperCase() + suit.slice(1)}`, suit, rank });
  MAJOR.forEach(([name, meaning], i) => cards.push({ key: `major:${i}`, name, suit: 'major', rank: i, meaning }));
  return cards;
}
export const MEANINGS = {
  pentacles: 'the field and the coin', swords: 'what is said and what is true', wands: 'what is built and what burns', cups: 'the heart',
};
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
export function ensure(w) { if (!w.deck || !w.deck.length) w.deck = shuffle(deck().map(c => c.key)); w.cards = w.cards || []; }

// Turn the top card and let it land. Returns the record of what happened.
export function draw(w, c, by = 'sky') {
  ensure(w);
  const key = w.deck.pop();
  const [suit, rank] = key.split(':');
  const card = deck().find(x => x.key === key);
  let text = '';
  try { text = suit === 'major' ? MAJOR[Number(rank)][2](c) : MINOR[suit][rank](c); } catch (e) { text = 'The card turned and nothing could be made of it.'; console.error('tarot', key, e); }
  const meaning = suit === 'major' ? card.meaning : MEANINGS[suit];
  const rec = { day: w.day, tick: w.tick, key, name: card.name, suit, rank, meaning, text, by, left: w.deck.length };
  w.cards.push(rec); if (w.cards.length > 40) w.cards.shift();
  w.lastCard = rec;
  c.event(`The sky turns a card: ${card.name}. ${text}`, 'god');
  for (const a of c.alive()) c.remember(a, `The sky turned a card: ${card.name}. ${text}`, 0.6);
  if (!w.deck.length) c.event('The deck is spent and shuffled again.', 'god');
  return rec;
}
