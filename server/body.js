// The body. Every dial is 0..1. Emotional hits move the same dials physical ones do.
// Past a threshold the body takes over: the agent is overwhelmed and cannot act.

export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

export function newBody(seed = {}) {
  return {
    warmth: 0.8,     // 0 = freezing
    food: 0.8,       // 0 = starving
    energy: 0.8,     // 0 = collapse
    tightness: 0.2,  // chest. 1 = locked
    breath: 1.0,     // 0 = can't breathe
    openness: 0.6,   // willingness to be near others
    hurt: 0.0,       // accumulated damage. 1 = death
    overwhelmed: 0,  // ticks remaining where the body has taken over
    ...seed,
  };
}

// One tick of ordinary living. env: { cold 0..1, sheltered bool, warmFire bool }
export function tickBody(b, env) {
  b.food = clamp(b.food - 0.045);
  b.energy = clamp(b.energy - 0.04);
  if (env.sheltered || env.warmFire) b.warmth = clamp(b.warmth + 0.15);
  else b.warmth = clamp(b.warmth - (0.03 + 0.22 * env.cold));

  // Hunger and cold hurt, slowly, then quickly.
  if (b.food < 0.15) b.hurt = clamp(b.hurt + 0.06);
  if (b.warmth < 0.15) b.hurt = clamp(b.hurt + 0.08);
  if (b.energy < 0.1) b.hurt = clamp(b.hurt + 0.03);

  // Threat tightens the body before the mind knows why.
  if (b.food < 0.3) b.tightness = clamp(b.tightness + 0.05);
  if (b.warmth < 0.3) b.tightness = clamp(b.tightness + 0.05);
  if (b.hurt > 0.4) b.tightness = clamp(b.tightness + 0.03);

  // The body settles toward baseline when nothing is happening.
  b.tightness = clamp(b.tightness - 0.02);
  b.breath = clamp(b.breath + 0.06);
  b.openness = clamp(b.openness + 0.01);
  if (b.hurt > 0 && b.food > 0.4 && b.warmth > 0.4) b.hurt = clamp(b.hurt - 0.02);

  if (b.overwhelmed > 0) b.overwhelmed -= 1;
  return b;
}

export function sleep(b) {
  b.energy = clamp(b.energy + 0.5);
  b.warmth = clamp(b.warmth + 0.45);   // a roof and a blanket
  b.tightness = clamp(b.tightness - 0.1);
  b.breath = 1;
}

export function eat(b, amount = 0.45) {
  b.food = clamp(b.food + amount);
}

// Emotional injury. `amount` 0..1, already scaled by trust and transit pressure.
export function emotionalHit(b, amount) {
  b.tightness = clamp(b.tightness + amount);
  b.breath = clamp(b.breath - amount * 0.7);
  b.openness = clamp(b.openness - amount * 0.5);
  if (b.tightness > 0.85 || b.breath < 0.3) b.overwhelmed = Math.max(b.overwhelmed, 2);
  return b;
}

export function physicalHit(b, amount) {
  b.hurt = clamp(b.hurt + amount);
  b.energy = clamp(b.energy - amount * 0.5);
  b.tightness = clamp(b.tightness + amount * 0.6);
  b.breath = clamp(b.breath - amount * 0.3);
  if (b.hurt > 0.7) b.overwhelmed = Math.max(b.overwhelmed, 1);
  return b;
}

export function soothe(b, amount) {
  b.tightness = clamp(b.tightness - amount);
  b.breath = clamp(b.breath + amount * 0.6);
  b.openness = clamp(b.openness + amount * 0.4);
  return b;
}

export const isDead = (b) => b.hurt >= 1;

// How the body feels from the inside. Never names a rule, only the sensation.
export function feltSense(b) {
  const s = [];
  if (b.food < 0.25) s.push('You are very hungry.');
  else if (b.food < 0.5) s.push('You could eat.');
  if (b.warmth < 0.25) s.push('You are dangerously cold.');
  else if (b.warmth < 0.5) s.push('You are cold.');
  if (b.energy < 0.25) s.push('You are exhausted.');
  if (b.hurt > 0.6) s.push('You are badly hurt.');
  else if (b.hurt > 0.3) s.push('You are hurt.');
  if (b.tightness > 0.75) s.push('Your chest is locked tight.');
  else if (b.tightness > 0.45) s.push('There is a tightness in your chest.');
  if (b.breath < 0.5) s.push('It is hard to breathe.');
  if (b.openness < 0.3) s.push('You want to be left alone.');
  else if (b.openness > 0.75) s.push('You feel open to people.');
  if (b.overwhelmed > 0) s.push('Your body has taken over. You cannot act right now.');
  if (!s.length) s.push('Your body feels alright.');
  return s;
}

// What another agent can see of this body.
export function visibleState(b) {
  const s = [];
  if (b.overwhelmed > 0) s.push('crying, can barely breathe');
  else if (b.tightness > 0.7) s.push('drawn tight, guarded');
  else if (b.tightness > 0.45) s.push('tense');
  if (b.hurt > 0.5) s.push('injured');
  if (b.food < 0.25) s.push('gaunt');
  if (b.warmth < 0.3) s.push('shivering');
  if (b.openness > 0.75 && b.tightness < 0.3) s.push('warm, easy');
  if (!s.length) s.push('ordinary');
  return s.join(', ');
}
