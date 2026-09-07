// Belief, and things with a little magic in them.
//
// Belief: every villager carries a sense of whether the world is good or bad, from -1 to 1. It
// is not a mood; it is the lens. It tilts the small rolls that make up a day (what the wood gives,
// whether the deer is there, whether a hand reached for is taken), and it tilts how they read
// people (a believer in a bad world sees threat, and finds it; a believer in a good world is easy
// to trust and forgives fast). What happens then feeds the belief back, and things that match the
// belief count for more, so each person collapses the day toward what they expect of it.
//
// Magic items: found out past the pale, one at a time. The first is a pair of rose-coloured glasses.

import * as B from './body.js';

export const MAGIC = {
  glasses: { label: 'rose-coloured glasses', found: 'a pair of spectacles with rose glass, lying in the grass as if set down a moment ago', use: 'whoever wears them is cheerful and sure of tomorrow; the whole world looks kinder through them',
    worn: 'Through the rose glass everything is a little kinder than it is: the sky, the faces, tomorrow. You are sure it will be good.', wear: (w, a) => { a.belief = Math.max(a.belief ?? 0, 0.7); B.gladden(a.body, 0.03); a.body.openness = B.clamp(a.body.openness + 0.01); } },
};
export const ORDER = ['glasses'];   // the order things are found out there

export function beliefFor(a) {
  const base = a.upbringing === 'warm' ? 0.3 : a.upbringing === 'cold' ? -0.3 : 0;
  const sun = a.chart?.sun || '';
  const sunny = /Leo|Sagittarius|Aries|Gemini|Libra/.test(sun) ? 0.1 : /Scorpio|Capricorn|Virgo/.test(sun) ? -0.1 : 0;
  return +(base + sunny + (Math.random() - 0.5) * 0.2).toFixed(2);
}
export const word = (b) => b > 0.5 ? 'the world is good and will stay so' : b > 0.15 ? 'the world is mostly kind' : b > -0.15 ? 'the world is what it is' : b > -0.5 ? 'the world is hard and people look out for themselves' : 'the world is bad and no one can be trusted';

// Luck: how the day's small rolls lean for this person.
export const luck = (a) => 1 + (a.belief ?? 0) * 0.25;
// Trust: a good-world believer takes kindness in full and forgives fast; a bad-world believer discounts kindness and keeps every hurt.
export function trustWeight(a, d) { const b = a.belief ?? 0; return d > 0 ? d * (1 + b * 0.35) : d * (1 - b * 0.35); }

// Each night the day's evidence moves the belief, and what matched the belief counts double.
export function nightly(w, a) {
  if (a.belief == null) a.belief = beliefFor(a);
  const today = a.memories.filter(m => m.day === w.day).map(m => m.text).join(' | ');
  let good = 0, bad = 0;
  if (/comforted you|stayed with you|shared .* with you|broke bread with you|gave you|paid you|carved you|made you a|sang|listened|together now|is born|Today is/.test(today)) good += 1;
  if (/sky turned a card.*(good morning|opens|whole|wish|cheered|healing|sun)/i.test(today)) good += 1;
  if (/struck you|took your|pulled away|Raiders|Wolves took|died of|has died|nothing to eat|You could not afford|would not lend/.test(today)) bad += 1;
  if (a.body.food < 0.3 || a.body.warmth < 0.3) bad += 1;
  if ((a.grief || []).some(g => g.intensity > 0.5)) bad += 0.5;
  const b = a.belief;
  let d = good * 0.02 - bad * 0.03;
  if (d > 0 && b > 0) d *= 1.5; if (d < 0 && b < 0) d *= 1.5;      // confirmation
  a.belief = B.clamp(b + d + (0 - b) * 0.004, -1, 1);                 // and a slow drift home
  // What they wear.
  for (const k of ORDER) if ((a.inv[k] || 0) > 0 && MAGIC[k].wear) MAGIC[k].wear(w, a);
  a.belief = +a.belief.toFixed(3);
}

// Out in the pale, sometimes, the next thing is found.
export function maybeFind(w, a, event, remember) {
  const next = ORDER.find(k => !w.agents.some(x => (x.inv[k] || 0) > 0) && !(w.magicFound || []).includes(k));
  if (!next || Math.random() > 0.25) return null;
  const m = MAGIC[next];
  a.inv[next] = (a.inv[next] || 0) + 1;
  w.magicFound = w.magicFound || []; w.magicFound.push(next);
  event(w, `Out in the pale ${a.name} finds ${m.label}: ${m.found}. They put them on. ${m.use[0].toUpperCase() + m.use.slice(1)}.`, 'wonder', [a.id]);
  remember(w, a, `You found ${m.label} out where no one had walked. ${m.worn}`, 1);
  return next;
}

export function felt(w, a) {
  const out = [];
  const b = a.belief ?? 0;
  for (const k of ORDER) if ((a.inv[k] || 0) > 0) out.push(MAGIC[k].worn);
  out.push(`You believe ${word(b)}${b > 0.3 ? '; tomorrow will be better than today, you are sure of it' : b < -0.3 ? '; tomorrow will take something, it always does' : ''}.`);
  return out;
}
