// Animals. Strays choose a person; hens and goats are bought; deer are hunted; wolves come in
// the winter nights. A pet is fed from its owner's food, lifts them a little every tick they are
// together, and dies of age one day, which is a small grief with no ceremony.

import * as B from './body.js';

export const KINDS = {
  cat:  { label: 'cat',  life: 15, eats: 0.06, stray: true,  line: (n) => `Your cat ${n} is asleep by your fire, or pretending to be.` },
  dog:  { label: 'dog',  life: 12, eats: 0.14, stray: true,  line: (n) => `Your dog ${n} is at your heel, tail going.` },
  hen:  { label: 'hen',  life: 6,  eats: 0.04, price: 6,  gives: 0.3, line: (n) => `Your hen ${n} scratches in the yard and lays most mornings.` },
  goat: { label: 'goat', life: 10, eats: 0.06, price: 14, gives: 0.4, line: (n) => `Your goat ${n} gives milk and eats anything.` },
  deer: { label: 'deer', wild: true },
  wolf: { label: 'wolf', wild: true },
};
export const PRICES = { hen: 6, goat: 14 };
const NAMES = ['Bramble', 'Soot', 'Pip', 'Moth', 'Biscuit', 'Nettle', 'Rook', 'Ember', 'Puddle', 'Sorrel', 'Tansy', 'Clover', 'Wick', 'Mouse', 'Juniper', 'Bran', 'Pebble', 'Thistle', 'Ash', 'Dot'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const uid = () => 'an' + Math.random().toString(36).slice(2, 8);

export function ensure(w) {
  w.animals = w.animals || [];
  if (w.deer == null) w.deer = 6;
  return w.animals;
}
export function alive(w) { return ensure(w).filter(x => x.alive); }
export function petsOf(w, a) { return alive(w).filter(x => x.owner === a.id); }
export function straysAt(w, loc) { return alive(w).filter(x => !x.owner && !KINDS[x.kind].wild && x.location === loc); }
export function byName(w, a, name) {
  const n = String(name || '').toLowerCase().trim();
  return alive(w).find(x => x.name && x.name.toLowerCase() === n) || alive(w).find(x => x.kind === n && (x.owner === a.id || !x.owner)) || null;
}
export function newAnimal(w, kind, { owner = null, location = 'hearth', pos, name } = {}) {
  ensure(w);
  const used = new Set(w.animals.map(x => x.name));
  const an = { id: uid(), kind, name: name || (KINDS[kind].wild ? null : (NAMES.find(n => !used.has(n)) || pick(NAMES))), owner, location, pos: pos || { x: 20, y: 12 }, born: w.day, bond: 0, hungry: 0, alive: true, young: !KINDS[kind].wild };
  w.animals.push(an);
  return an;
}

// Every tick: pets go where their person goes (dogs), or wait at home (cats, hens, goats), and lift them.
export function tick(w, agents, PLACES, sameSpot, remember, event) {
  const living = agents.filter(a => a.alive);
  const byId = (id) => living.find(a => a.id === id);
  for (const an of alive(w)) {
    if (KINDS[an.kind].wild) {
      // Deer drift between the meadow and the forest; wolves only walk at night in winter and are handled nightly.
      if (an.kind === 'deer') { const at = Math.random() < 0.5 ? PLACES.meadow : PLACES.forest; if (Math.random() < 0.1) an.location = at === PLACES.meadow ? 'meadow' : 'forest'; const p = PLACES[an.location] || PLACES.meadow; an.pos = { x: p.x + rnd(-2.5, 2.5), y: p.y + rnd(-1.5, 1.5) }; }
      continue;
    }
    const o = an.owner && byId(an.owner);
    if (!o) {
      // A stray. It waits where it is, and chooses someone who lingers and is open.
      an.owner = null;
      const here = living.filter(a => a.location === an.location);
      const cand = here.filter(a => a.body.openness > 0.45).sort((a, b) => (a.body.joy ?? 0.5) - (b.body.joy ?? 0.5))[0];
      if (cand && Math.random() < 0.12) claim(w, an, cand, remember, event, 'chose');
      continue;
    }
    const together = an.kind === 'dog' ? true : o.location === 'home';
    if (an.kind === 'dog') { an.location = o.location; an.pos = { x: o.pos.x + 0.8, y: o.pos.y + 0.4 }; }
    else { an.location = 'home'; an.pos = { x: o.home.x + (an.kind === 'cat' ? -0.6 : 1.4), y: o.home.y + (an.kind === 'cat' ? 0.9 : 1.2) }; }
    if (together && an.hungry < 2) {
      B.gladden(o.body, an.kind === 'dog' ? 0.008 : an.kind === 'cat' ? 0.01 : 0.003);
      if (an.kind === 'dog') o.body.tightness = B.clamp(o.body.tightness - 0.004);
      an.bond = Math.min(10, an.bond + 0.02);
    }
  }
}
function claim(w, an, a, remember, event, how) {
  an.owner = a.id; an.location = a.location; an.bond = 1;
  const what = an.young ? (an.kind === 'cat' ? 'kitten' : 'pup') : an.kind;
  if (how === 'chose') {
    event(w, `A stray ${what} has chosen ${a.name}. It will not be shooed. They call it ${an.name}.`, 'comfort', [a.id]);
    remember(w, a, `A ${what} followed you and would not leave. You have called it ${an.name}. Something in your chest gave way when it climbed into your lap.`, 1);
  } else {
    event(w, `${a.name} takes in the stray ${what} and calls it ${an.name}.`, 'comfort', [a.id]);
    remember(w, a, `You took in a ${what} and called it ${an.name}.`, 0.8);
  }
  B.gladden(a.body, 0.2);
}

// Night: feeding, eggs and milk, age, wolves, new strays, deer coming back.
export function nightly(w, agents, PLACES, season, yearDays, remember, event, isFound) {
  const living = agents.filter(a => a.alive);
  const byId = (id) => living.find(a => a.id === id);
  const dogs = alive(w).filter(x => x.kind === 'dog' && x.owner);
  for (const an of alive(w)) {
    if (KINDS[an.kind].wild) continue;
    an.young = an.young && (w.day - an.born) < yearDays;
    const o = an.owner && byId(an.owner);
    if (!o) { an.owner = null; if (Math.random() < 0.05 && !an.owner) { /* strays drift on */ an.alive = false; } continue; }
    const need = KINDS[an.kind].eats;
    if ((o.inv.food || 0) >= need) { o.inv.food -= need; an.hungry = 0; }
    else { an.hungry += 1; if (an.hungry === 2) remember(w, o, `${an.name} is thin. You have not had food to spare.`, 0.6); }
    if (an.hungry >= 4) {
      an.alive = false;
      event(w, `${o.name}'s ${an.kind} ${an.name} has gone. It was hungry too long.`, 'wound', [o.id]);
      remember(w, o, `${an.name} left in the night. You had nothing to give it. You will think of it when you eat.`, 1);
      B.gladden(o.body, -0.2);
      continue;
    }
    if (KINDS[an.kind].gives && an.hungry === 0 && season !== 'winter') o.inv.food = (o.inv.food || 0) + KINDS[an.kind].gives;
    const age = (w.day - an.born) / yearDays;
    if (age > KINDS[an.kind].life && Math.random() < 0.3) {
      an.alive = false;
      event(w, `${o.name}'s ${an.kind} ${an.name} dies of age, in their sleep, by the fire.`, 'death', [o.id]);
      remember(w, o, `${an.name} died in the night, old and warm. You buried ${an.kind === 'hen' ? 'her' : 'them'} by the door. The house is quieter.`, 1);
      B.gladden(o.body, -0.25);
      for (const c of o.children || []) { const k = byId(c); if (k) remember(w, k, `${an.name} died. Your parent dug a small grave by the door and did not say much.`, 0.8); }
    }
  }
  // Wolves in the winter nights take a hen or a goat whose house has no dog.
  if (season === 'winter' && Math.random() < 0.18) {
    const prey = alive(w).filter(x => (x.kind === 'hen' || x.kind === 'goat') && x.owner);
    const target = pick(prey);
    if (target) {
      const o = byId(target.owner);
      const guard = dogs.find(d => d.owner === target.owner);
      if (guard) { event(w, `Wolves circle ${o.name}'s house in the night. ${guard.name} barks until dawn and they go.`, 'info', [o.id]); remember(w, o, `Wolves came. ${guard.name} kept them off. You slept with a hand on ${guard.name}'s back.`, 0.8); guard.bond = Math.min(10, guard.bond + 1); }
      else { target.alive = false; event(w, `Wolves take ${o.name}'s ${target.kind} ${target.name} in the night.`, 'wound', [o.id]); remember(w, o, `Wolves took ${target.name}. You found the tracks in the morning. A dog would have barked.`, 1); B.gladden(o.body, -0.15); }
    }
  }
  // Strays come in from the pale now and then; deer come back in spring.
  if (Math.random() < 0.05 && alive(w).filter(x => !x.owner && !KINDS[x.kind].wild).length < 2) {
    const kind = Math.random() < 0.6 ? 'cat' : 'dog';
    const where = isFound('grove') && Math.random() < 0.5 ? 'grove' : 'hearth';
    const an = newAnimal(w, kind, { location: where, pos: { x: PLACES[where].x + rnd(-1, 1), y: PLACES[where].y + rnd(-1, 1) } });
    event(w, `A stray ${kind === 'cat' ? 'kitten' : 'pup'} is seen at ${PLACES[where].label}, thin and watching.`, 'info', []);
  }
  if (season === 'spring' && w.deer < 8 && Math.random() < 0.3) w.deer += 1;
  // the wild ones on the map match the count
  const shown = alive(w).filter(x => x.kind === 'deer');
  while (shown.length < w.deer) { shown.push(newAnimal(w, 'deer', { location: 'meadow', pos: { x: PLACES.meadow.x + rnd(-2, 2), y: PLACES.meadow.y + rnd(-1, 1) } })); }
  while (shown.length > w.deer) { shown.pop().alive = false; }
  // the store keeps a hen or two, and sometimes a goat
  if (w.store) { if ((w.store.shelf.hen || 0) < 2 && Math.random() < 0.2) w.store.shelf.hen = (w.store.shelf.hen || 0) + 1; if ((w.store.shelf.goat || 0) < 1 && Math.random() < 0.08) w.store.shelf.goat = 1; }
}

// What a person feels about their animals, and the strays near them.
export function felt(w, a) {
  const s = [];
  for (const an of petsOf(w, a)) {
    if (an.hungry >= 2) s.push(`${an.name} is thin. You have not fed ${an.kind === 'hen' ? 'her' : 'them'}.`);
    else s.push(KINDS[an.kind].line(an.name));
  }
  for (const an of straysAt(w, a.location)) s.push(`A stray ${an.young ? (an.kind === 'cat' ? 'kitten' : 'pup') : an.kind} is watching you from a little way off, thin and unafraid. You could take it in (adopt).`);
  return s;
}
export function publicList(w) {
  return alive(w).map(x => ({ id: x.id, kind: x.kind, name: x.name, owner: x.owner, location: x.location, pos: x.pos, bond: +x.bond.toFixed(1), hungry: x.hungry, young: !!x.young, born: x.born }));
}
export { claim };
