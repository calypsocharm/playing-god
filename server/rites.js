// Sickness, and the days the village makes for itself.
// Illness spreads at the fire in the cold months and is treated with herbs and salve; tending
// the sick is care, and it bonds. Holidays are invented by the villagers: after a first harvest,
// a hard winter survived, a birth, a place found, someone names a day, says how it is decorated,
// what is sung, whether people dance. The village keeps it every year after.

import * as B from './body.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- illness ----------
export const KINDS = { fever: 'a fever', cough: 'the cough' };
export function fallIll(w, a, kind, remember, event, how) {
  if (a.ill || (a.immuneUntil || 0) > w.day || !a.alive) return false;
  a.ill = { kind, day: w.day, severity: 0.3, treatedDay: -1 };
  remember(w, a, kind === 'fever' ? 'You woke hot and shaking. Your bones ache and the light is too bright.' : 'You woke with a cough that will not stop. Your chest rattles.', 0.8);
  event(w, `${a.name} has taken ${KINDS[kind]}${how ? ' ' + how : ''}.`, 'wound', [a.id]);
  return true;
}
// Each day tick: the sick weaken, and the sickness passes to whoever shares their air.
export function illnessTick(w, living, sameSpot, ageOf, decisions, remember, event, season) {
  for (const a of living) {
    if (!a.ill) continue;
    const frail = ageOf(w, a) < 8 || ageOf(w, a) >= 65 ? 1.6 : 1;
    const resting = decisions.get(a.id)?.type === 'rest' || a.location === 'home';
    a.body.energy = B.clamp(a.body.energy - 0.03);
    a.body.tightness = B.clamp(a.body.tightness + 0.01);
    a.body.hurt = B.clamp(a.body.hurt + 0.012 * a.ill.severity * frail);
    a.ill.severity = B.clamp(a.ill.severity + (resting ? -0.004 : 0.012) * frail, 0, 1);
    for (const o of sameSpot(w, a)) if (!o.ill && (o.immuneUntil || 0) <= w.day && Math.random() < 0.02 * a.ill.severity * (season === 'winter' ? 1.6 : 1)) fallIll(w, o, a.ill.kind, remember, event, `from ${a.name}`);
  }
}
// Night: some take ill from cold and hunger; the treated mend; the mended are safe a season.
export function illnessNightly(w, living, season, daysPerSeason, remember, event) {
  for (const a of living) {
    if (a.ill) {
      if (a.ill.treatedDay === w.day) a.ill.severity = B.clamp(a.ill.severity - 0.15, 0, 1);
      if (a.ill.severity <= 0.05 || (w.day - a.ill.day > 12 && Math.random() < 0.35)) {
        const kind = a.ill.kind; a.ill = null; a.immuneUntil = w.day + daysPerSeason;
        remember(w, a, kind === 'fever' ? 'The fever broke in the night. You are weak and very hungry and glad.' : 'The cough is gone. You slept through for the first time in days.', 0.8);
        event(w, `${a.name} is over ${KINDS[kind]}.`, 'healed', [a.id]);
      }
      continue;
    }
    const cold = season === 'winter' || season === 'autumn';
    const weak = a.body.warmth < 0.45 || a.body.food < 0.35;
    const p = (cold ? 0.004 : 0.0008) * (weak ? 2.5 : 1);
    if (Math.random() < p) fallIll(w, a, cold && Math.random() < 0.6 ? 'cough' : 'fever', remember, event, weak ? 'after days cold and hungry' : '');
  }
}
export function treat(w, a, tgt, bumpTrust, remember, event) {
  if (!tgt.ill) { remember(w, a, `${tgt.name} is not sick.`, 0.2); return false; }
  const med = a.inv.salve > 0 ? 'salve' : a.inv.herbs >= 1 ? 'herbs' : a.inv.tonic > 0 ? 'tonic' : null;
  if (!med) { remember(w, a, `You had nothing to treat ${tgt.name} with. Herbs from the forest, or salve.`, 0.4); return false; }
  a.inv[med] -= 1;
  tgt.ill.severity = B.clamp(tgt.ill.severity - (med === 'salve' ? 0.3 : 0.2), 0, 1); tgt.ill.treatedDay = w.day;
  B.soothe(tgt.body, 0.15);
  if (tgt !== a) {
    bumpTrust(tgt, a, 0.12); a.attach = a.attach || {}; a.attach[tgt.id] = (a.attach[tgt.id] || 0) + 0.3;
    tgt.exposures.asking = true; tgt.exposures.weakness = true; a.exposures.closeness = true;
    event(w, `${a.name} sits with ${tgt.name} and treats ${KINDS[tgt.ill.kind]} with ${med}.`, 'comfort', [a.id, tgt.id]);
    remember(w, tgt, `${a.name} sat with you while you were sick and gave you ${med}. You will not forget it.`, 0.9);
    remember(w, a, `You treated ${tgt.name}'s ${KINDS[tgt.ill.kind]} with ${med}.`, 0.5);
    a.skills = a.skills || {}; a.skills.healing = (a.skills.healing || 0) + 1;
  } else remember(w, a, `You took ${med} for ${KINDS[tgt.ill.kind]}.`, 0.4);
  return true;
}
export function illFelt(a) {
  if (!a.ill) return [];
  const s = a.ill.severity;
  return [a.ill.kind === 'fever' ? (s > 0.6 ? 'The fever has you. You shake, you sweat, the room tilts. You should be lying down with someone near.' : 'You are feverish and weak. Rest, herbs or salve would help.') : (s > 0.6 ? 'The cough is deep now and there is blood in it. You should be lying down.' : 'You cannot stop coughing. Rest, herbs or salve would help.')];
}

// ---------- holidays ----------
const DECOR = ['ropes hung with berries between the houses', 'pine boughs over every door', 'strings of fish scales that catch the light', 'painted stones set in a ring around the well', 'lanterns of clay with a coal inside', 'garlands of meadow flowers on the hearth stones', 'a pole at the hearth wound with dyed fiber', 'every threshold swept and a loaf set on it'];
const SONGS = ['Oh the fire is lit and the field is cut, and none of us went under', 'Carry the light, carry it round, set it down where the cold was', 'We are here, we are here, count us at the fire', 'The river gave and the ground gave and we give it back tonight', 'Sing for the ones by the door, sing for the ones still walking'];
const FOOD = ['pie', 'bread', 'fish', 'a shared pot'];
function scriptedName(w, reason, skyName) {
  const found = Object.keys(w.found || {});
  const dead = w.agents.filter(a => !a.alive).map(a => a.name);
  const opts = [];
  if (reason === 'harvest') opts.push('the Feast of First Bread', 'Cut Field Night', 'the Full Shelf');
  if (reason === 'midwinter') opts.push('the Long Quiet', 'the Night the Cold Turned', 'Lantern Night');
  if (reason === 'birth') opts.push('the Naming Day', 'Small Hands Day');
  if (reason === 'found') opts.push(`${found.length ? 'the Day of ' + found[found.length - 1].replace(/^./, c => c.toUpperCase()) : 'Far Walk Day'}`);
  if (reason === 'healed') opts.push('the Loosening', 'Open Door Day');
  if (dead.length && Math.random() < 0.3) opts.push(`${pick(dead)}'s Night`);
  if (skyName && Math.random() < 0.3) opts.push(`the ${skyName} Sky Fair`);
  return pick(opts.length ? opts : ['Fire Day']);
}
export function proposeHoliday(w, living, reason, proposer, remember, event, yearDays) {
  w.holidays = w.holidays || [];
  if (w.pendingHoliday || w.holidays.length >= 8) return null;
  const dayOfYear = (w.day + 1) % yearDays;
  if (w.holidays.some(h => Math.abs(h.dayOfYear - dayOfYear) < 6)) return null;
  w.pendingHoliday = { reason, by: proposer.id, day: w.day, dayOfYear };
  remember(w, proposer, `Tonight you thought: this should be a day. Every year. With ${pick(DECOR)}, and dancing. You will say so in the morning.`, 0.8);
  return w.pendingHoliday;
}
export function foundHoliday(w, spec, remember, event, byId) {
  const p = w.pendingHoliday; if (!p) return null;
  const by = byId(w, p.by);
  const h = { id: 'h' + Math.random().toString(36).slice(2, 7), name: String(spec.name || '').trim().slice(0, 40) || scriptedName(w, p.reason, w.god?.named ? w.god.name : null), reason: p.reason, by: p.by, byName: by?.name || 'someone', founded: p.day, year: Math.floor(p.day / (w.weather.daysPerSeason * 4)) + 1, dayOfYear: p.dayOfYear,
    decorate: String(spec.decorate || pick(DECOR)).slice(0, 120), song: String(spec.song || pick(SONGS)).slice(0, 160), dance: spec.dance !== false, food: String(spec.food || pick(FOOD)).slice(0, 40), kept: 0, invented: !!spec.name };
  w.holidays.push(h); w.pendingHoliday = null;
  event(w, `${h.byName} says there should be a day for this, every year, and names it ${h.name}: ${h.decorate}; ${h.dance ? 'dancing at the hearth' : 'no dancing'}; and everyone sings "${h.song}".`, 'healed', by ? [by.id] : []);
  for (const a of w.agents) if (a.alive) remember(w, a, `${h.byName} made a day: ${h.name}. ${h.decorate}. The song goes "${h.song}".`, 0.7);
  return h;
}
// Called at each new day: is today a holiday? Also decides nightly whether something happened worth a day.
export function holidayToday(w, yearDays) {
  const doy = w.day % yearDays;
  return (w.holidays || []).find(h => h.dayOfYear === doy) || null;
}
export function reasonTonight(w, living, season, daysPerSeason, yearDays) {
  const doy = w.day % yearDays, seasonDay = w.day % daysPerSeason;
  const today = (w.events || []).filter(e => e.day === w.day);
  if (season === 'autumn' && seasonDay === 1 && !(w.holidays || []).some(h => h.reason === 'harvest')) return 'harvest';
  if (season === 'winter' && seasonDay === daysPerSeason - 1 && !(w.holidays || []).some(h => h.reason === 'midwinter') && (w.winterDeaths || 0) === 0) return 'midwinter';
  if (today.some(e => /is born/.test(e.text)) && !(w.holidays || []).some(h => h.reason === 'birth') && Math.random() < 0.5) return 'birth';
  if (today.some(e => /exploring, finds|comes back from past the edge/.test(e.text)) && Math.random() < 0.6) return 'found';
  if (today.some(e => e.kind === 'healed' && /no longer runs|healed/.test(e.text)) && !(w.holidays || []).some(h => h.reason === 'healed') && Math.random() < 0.3) return 'healed';
  return null;
}
export function celebrate(w, a, near, act, h, bumpTrust, remember, event) {
  B.gladden(a.body, 0.12);
  a.body.tightness = B.clamp(a.body.tightness - 0.05);
  a.faith = B.clamp((a.faith || 0) + 0.02, -1, 1);
  for (const o of near) { bumpTrust(a, o, 0.03); bumpTrust(o, a, 0.02); a.exposures.closeness = true; }
  for (const g of a.grief || []) { g.shared += 1; g.sharedToday = (g.sharedToday || 0) + 1; }
  if (typeof act.say === 'string' && act.say.trim()) a.lastSaid = act.say.trim().slice(0, 200);
  a.celebrated = w.day;
  remember(w, a, `${h.name}. ${near.length ? 'You danced with ' + near.slice(0, 3).map(o => o.name).join(', ') + ' at the fire' : 'You kept it alone at the fire'}${a.lastSaid ? ` and sang "${a.lastSaid}"` : ''}.`, 0.6);
}
export function scriptedSpec(w, reason, skyName) {
  return { name: scriptedName(w, reason, skyName), decorate: pick(DECOR), song: pick(SONGS), dance: true, food: pick(FOOD) };
}
