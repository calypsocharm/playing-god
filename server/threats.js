// Something is always coming. Each season a threat gathers on the horizon and lands late in the
// season. The Creator sees it early and how ready the village is; the villagers only know if the
// sky warns them (an omen), or if a clairvoyant among them sees it. What lands is scaled by how
// ready they were. At the season's end the sky is scored, and attention is earned, not given.

import * as B from './body.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rnd = (a, b) => a + Math.random() * (b - a);

export const THREATS = {
  cold:     { season: 'winter', name: 'a killing cold', omen: 'The air has a taste of iron. The old say a cold is coming that kills.', help: 'wood on the hearth pile, blankets and quilts in the houses, the hall built' },
  wolves:   { season: 'winter', name: 'a wolf pack', omen: 'Tracks in the snow past the edge, many and large, all going one way.', help: 'dogs, fences, and animals brought in close; no one out past the edge at dusk' },
  sickness: { season: 'spring', name: 'a sickness on the wind', omen: 'The birds are silent in the morning and there is a smell of rot from the pale.', help: 'herbs, salve and tonic laid by; the sick kept apart and rested' },
  flood:    { season: 'spring', name: 'a flood', omen: 'The creek runs brown and loud and the meadow is sodden.', help: 'food stored in the granary; wood and stone kept up off the ground' },
  drought:  { season: 'summer', name: 'a drought', omen: 'No dew for a week. The well is a hand lower than it was.', help: 'food on the store shelf and in the houses; the well house; the pool at the creek; the granary' },
  fire:     { season: 'summer', name: 'a grass fire', omen: 'The meadow is yellow and the wind has turned to blow across it toward the houses.', help: 'the field cut, water carried, stone houses; wood kept away from the hearth pile' },
  raiders:  { season: 'autumn', name: 'raiders from the pale', omen: 'Strangers were seen at the edge, counting the houses.', help: 'axes in hands at the hearth, dogs, fences, and the hall to shelter in' },
  frost:    { season: 'autumn', name: 'an early frost', omen: 'The leaves went in a night. Ice on the well bucket at dawn.', help: 'the harvest brought in early; food on the shelf; the granary' },
};

export function roll(w, season, daysPerSeason) {
  const kinds = Object.entries(THREATS).filter(([, t]) => t.season === season).map(([k]) => k);
  const kind = pick(kinds);
  const lands = w.day + Math.floor(daysPerSeason * rnd(0.55, 0.9));
  w.threat = { kind, name: THREATS[kind].name, help: THREATS[kind].help, seen: w.day, lands, known: false, landed: null, readiness: 0 };
  return w.threat;
}

// 0..1: how ready the village is for what is coming.
export function readiness(w, living, animals, builds, store) {
  const t = w.threat; if (!t) return 0;
  const n = Math.max(1, living.length);
  const sum = (f) => living.reduce((s, a) => s + (f(a) || 0), 0);
  const dogs = animals.filter(x => x.kind === 'dog' && x.owner).length;
  const fences = living.filter(a => a.upgrades?.fence).length;
  const hall = builds.hall?.done ? 1 : 0, granary = builds.granary?.done ? 1 : 0, pool = builds.pool?.done ? 1 : 0;
  let r = 0;
  switch (t.kind) {
    case 'cold':     r = Math.min(1, (w.hearth.wood + sum(a => a.inv.wood) * 0.5) / (n * 4)) * 0.5 + Math.min(1, sum(a => (a.inv.blanket || 0) + (a.inv.quilt || 0) * 1.5) / n) * 0.3 + hall * 0.2; break;
    case 'wolves':   r = Math.min(1, dogs / Math.max(1, n / 4)) * 0.5 + Math.min(1, fences / Math.max(1, n / 3)) * 0.3 + (animals.filter(x => x.owner && (x.kind === 'hen' || x.kind === 'goat')).length === 0 ? 0.2 : 0.1); break;
    case 'sickness': r = Math.min(1, sum(a => (a.inv.herbs || 0) + (a.inv.salve || 0) * 2 + (a.inv.tonic || 0) * 2) / (n * 1.5)) * 0.8 + (living.filter(a => a.ill).length ? 0 : 0.2); break;
    case 'flood':    r = granary * 0.6 + Math.min(1, (store.shelf.food || 0) / (n * 2)) * 0.4; break;
    case 'drought':  r = Math.min(1, ((store.shelf.food || 0) + sum(a => a.inv.food)) / (n * 5)) * 0.5 + granary * 0.2 + pool * 0.1 + (builds.wellhouse?.done ? 0.2 : 0); break;
    case 'fire':     r = Math.min(1, sum(a => a.inv.stone) / (n * 3)) * 0.4 + (w.hearth.wood < n * 2 ? 0.3 : 0.1) + hall * 0.3; break;
    case 'raiders':  r = Math.min(1, sum(a => a.inv.axe) / Math.max(1, n / 2)) * 0.4 + Math.min(1, dogs / Math.max(1, n / 4)) * 0.2 + Math.min(1, fences / Math.max(1, n / 3)) * 0.2 + hall * 0.2; break;
    case 'frost':    r = Math.min(1, ((store.shelf.food || 0) + sum(a => a.inv.food)) / (n * 4)) * 0.7 + granary * 0.3; break;
  }
  t.readiness = +Math.min(1, r).toFixed(2);
  return t.readiness;
}
export const readinessWord = (r) => r >= 0.75 ? 'strong' : r >= 0.5 ? 'ready' : r >= 0.25 ? 'thin' : 'exposed';

// The Creator warns them. Everyone remembers; the autopilot starts preparing.
export function warn(w, living, remember, event) {
  const t = w.threat; if (!t || t.landed) return { error: 'nothing is coming that they could be warned of' };
  if (t.known) return { error: 'they already know' };
  t.known = true; t.warned = w.day;
  event(w, THREATS[t.kind].omen + ` People say it means ${t.name}.`, 'god');
  for (const a of living) { remember(w, a, `${THREATS[t.kind].omen} Everyone says: ${t.name} is coming. What would help: ${t.help}.`, 0.9); a.faith = B.clamp((a.faith || 0) + 0.03, -1, 1); }
  return { ok: true };
}

// It lands. Damage scales with how unready they were.
export function land(w, living, animals, PLACES, fallIll, remember, event, die, bumpTrust) {
  const t = w.threat; if (!t || t.landed) return;
  const r = t.readiness, x = 1 - r;   // exposure
  const n = living.length;
  let text = '';
  switch (t.kind) {
    case 'cold': {
      w.coldSnap = { until: w.day + 3, extra: 0.3 + 0.5 * x };
      for (const a of living) a.body.warmth = B.clamp(a.body.warmth - 0.3 * x);
      text = `The killing cold comes down. ${r >= 0.5 ? 'The wood pile holds and the houses stay shut for three days.' : 'The wood runs short on the second night.'}`;
      break;
    }
    case 'wolves': {
      const prey = animals.filter(a => a.owner && a.kind !== 'dog' && a.alive);
      const taken = prey.slice(0, Math.round(prey.length * x * 0.8));
      for (const p of taken) { p.alive = false; const o = living.find(a => a.id === p.owner); if (o) { remember(w, o, `Wolves took ${p.name} in the night. You heard it and could not get to the door in time.`, 1); B.gladden(o.body, -0.15); } }
      const out = living.filter(a => a.location.startsWith('wild:') || a.location === 'edge');
      for (const a of out) { B.physicalHit(a.body, 0.35 * x + 0.1); remember(w, a, 'The pack came out of the dark. You ran. Something caught your leg.', 1); }
      text = `The pack comes through the village in the night. ${taken.length ? `They take ${taken.length} animal${taken.length === 1 ? '' : 's'}.` : 'The dogs hold them off.'}${out.length ? ` ${out.map(a => a.name).join(', ')} ${out.length === 1 ? 'is' : 'are'} caught outside.` : ''}`;
      break;
    }
    case 'sickness': {
      const k = Math.max(1, Math.round(n * (0.15 + 0.35 * x)));
      const hit = [...living].sort(() => Math.random() - 0.5).slice(0, k);
      for (const a of hit) fallIll(w, a, Math.random() < 0.5 ? 'fever' : 'cough', remember, event, 'from the wind off the pale');
      text = `The sickness comes in on the wind. ${hit.map(a => a.name).join(', ')} ${hit.length === 1 ? 'takes' : 'take'} to bed.`;
      break;
    }
    case 'flood': {
      w.flood = { until: w.day + 5 };
      if (!w.builds.granary?.done) { const lost = Math.round((w.store.shelf.food || 0) * 0.6 * x); w.store.shelf.food = Math.max(0, (w.store.shelf.food || 0) - lost); for (const a of living) a.inv.food = Math.max(0, a.inv.food - a.inv.food * 0.5 * x); }
      text = `The creek comes over its banks. The field is under water for days${w.builds.granary?.done ? '; the granary keeps the food dry' : ', and food rots in the houses'}.`;
      break;
    }
    case 'drought': {
      w.drought = { until: w.day + Math.round(6 + 6 * x) };
      text = `The drought sets in. The field gives almost nothing for ${w.drought.until - w.day} days; what is on the shelf is what there is.`;
      break;
    }
    case 'fire': {
      const burned = Math.round(w.hearth.wood * (0.5 + 0.5 * x)); w.hearth.wood -= burned;
      const houses = living.filter(a => !a.upgrades?.bighouse && Math.random() < 0.4 * x);
      for (const a of houses) { a.inv.wood = Math.floor(a.inv.wood * 0.3); a.inv.fiber = Math.floor(a.inv.fiber * 0.3); remember(w, a, 'The fire came across the meadow. You beat it back from the door with a wet blanket. The woodpile is ash.', 1); }
      for (const a of living.filter(a => a.location === 'meadow' || a.location === 'field')) { B.physicalHit(a.body, 0.25 * x); }
      text = `A grass fire runs across the meadow toward the houses. ${burned} wood on the hearth pile burns.${houses.length ? ` ${houses.map(a => a.name).join(', ')} lose what was stacked by the door.` : ' The houses hold.'}`;
      break;
    }
    case 'raiders': {
      const coin = Math.round((w.store.coin || 0) * 0.6 * x), food = Math.round((w.store.shelf.food || 0) * 0.6 * x);
      w.store.coin -= coin; w.store.shelf.food = Math.max(0, (w.store.shelf.food || 0) - food);
      const at = living.filter(a => a.location === 'hearth' || a.location === 'store' || a.location === 'well');
      const defenders = at.filter(a => a.inv.axe > 0);
      for (const a of at) B.physicalHit(a.body, (defenders.length ? 0.15 : 0.35) * x);
      for (const a of living) { remember(w, a, `Raiders came out of the pale. ${defenders.length ? defenders.map(d => d.name).join(', ') + ' stood at the hearth with axes and they did not stay long.' : 'No one stood. They took what they wanted.'}`, 1); a.faith = B.clamp((a.faith || 0) - 0.05 * x, -1, 1); }
      text = `Raiders come out of the pale at dusk. They take ${coin} coin and ${food} food from the store; the bank's strongbox holds${defenders.length ? `; ${defenders.map(d => d.name).join(', ')} hold the hearth with axes` : '; no one stands against them'}.`;
      break;
    }
    case 'frost': {
      w.frost = { until: w.day + 4 };
      text = `An early frost blackens the field. Nothing more comes in this autumn${w.builds.granary?.done ? '; the granary was filled in time' : ''}.`;
      break;
    }
  }
  t.landed = w.day; t.text = text;
  event(w, `${t.name[0].toUpperCase() + t.name.slice(1)} lands. ${text} (The village was ${readinessWord(r)}.)`, r >= 0.5 ? 'healed' : 'wound');
  for (const a of living) remember(w, a, `${text} ${r >= 0.5 ? 'You were ready, mostly.' : 'You were not ready.'}`, 0.9);
  w.threatLog = w.threatLog || []; w.threatLog.push({ kind: t.kind, name: t.name, day: w.day, readiness: r });
}

// The sky is scored at the end of a season, and attention is earned.
export function seasonReport(w, season, year, living, born, died, healed, questions, holidaysKept, works, prayers) {
  const t = w.threat;
  const badDeaths = died.filter(d => d.cause !== 'old age');
  let earned = 2;
  const why = ['2 for the season turning'];
  if (!badDeaths.length) { earned += 1; why.push('1 for a season with no one lost before their time'); }
  if (t?.landed) { if (t.readiness >= 0.5) { earned += 1; why.push(`1 for meeting ${t.name} ${readinessWord(t.readiness)}`); } else { earned -= 1; why.push(`-1 for meeting ${t.name} ${readinessWord(t.readiness)}`); } }
  if (born.length) { earned += 1; why.push(`1 for ${born.length} born`); }
  if (healed) { earned += 1; why.push(`1 for ${healed} old rule${healed === 1 ? '' : 's'} let go`); }
  if (holidaysKept) { earned += 1; why.push(`1 for ${holidaysKept} day${holidaysKept === 1 ? '' : 's'} kept`); }
  earned -= badDeaths.length; if (badDeaths.length) why.push(`-${badDeaths.length} for ${badDeaths.map(d => d.name).join(', ')}`);
  earned = Math.max(-2, Math.min(6, earned));
  const report = { season, year, day: w.day, alive: living.length, born: born.map(b => b.name), died: died.map(d => `${d.name} (${d.cause})`), healed, questions, holidaysKept, works, prayers, threat: t ? { name: t.name, readiness: t.readiness, landed: !!t.landed, text: t.text || '' } : null, earned, why, skyName: w.god.name };
  w.reports = w.reports || []; w.reports.push(report); if (w.reports.length > 24) w.reports.shift();
  // despair: two seasons running with three or more lost before their time, and the hearth is abandoned
  w.despair = badDeaths.length >= 3 ? (w.despair || 0) + 1 : 0;
  return report;
}
