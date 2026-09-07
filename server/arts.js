// The arts. Sadness wants a shape. A villager can paint, write a poem or a story, throw a pot,
// make a song, or invent an art of their own and name it. A work is kept: it hangs in the house,
// or is told at the fire, and the people who see it are moved. Grief that is given a shape is
// grief shared. Skill grows; a maker becomes known; people ask them for words at a wake.

import * as B from './body.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const uid = () => 'wk' + Math.random().toString(36).slice(2, 8);

// Built-in arts. `needs` is taken from the maker's pack; `kept` says where the work lives.
export const ARTS = {
  painting: { label: 'painting', needs: { berries: 1 }, alt: { clay: 1 }, kept: 'home', verb: 'paints', maker: 'painter', line: 'You are a painter. You see the village in colours no one else names.' },
  poem:     { label: 'poem',     needs: {}, kept: 'told', verb: 'writes a poem', maker: 'poet', line: 'You are a poet. People ask you for words at a wake.' },
  story:    { label: 'story',    needs: {}, kept: 'told', verb: 'tells a story', maker: 'storyteller', line: 'You are the one who tells it. The children sit closest when you start.' },
  pottery:  { label: 'pot',      needs: { clay: 2 }, kept: 'home', verb: 'throws a pot', maker: 'potter', line: 'You are a potter. Your hands remember the wheel in your sleep.' },
  song:     { label: 'song',     needs: {}, kept: 'told', verb: 'makes a song', maker: 'songmaker', line: 'You make the songs. What you sang last winter is what they sing now.' },
};
export function artOf(w, name) {
  const n = String(name || '').toLowerCase().trim();
  if (ARTS[n]) return { key: n, ...ARTS[n] };
  const custom = (w.arts || []).find(x => x.name.toLowerCase() === n);
  return custom ? { key: custom.name, label: custom.name, needs: custom.needs || {}, kept: custom.kept || 'told', verb: `makes ${custom.name}`, maker: `${custom.name} maker`, line: `You practise ${custom.name}, the art ${custom.byName} made. ${custom.what}`, custom: true } : null;
}
export function artFor(chart, ELEMENT) {
  const el = ELEMENT[chart.moon] || 'air';
  return { fire: 'song', water: 'poem', earth: 'pottery', air: 'story' }[el];
}

// What the scripted mind writes when it has no model: a title and a line from what it has lived.
const OPEN = ['The cold came and', 'When the field was cut', 'By the creek, alone,', 'At the fire, late,', 'In the year the wolves came', 'After the long quiet'];
const CLOSE = ['you did not.', 'I kept the door open.', 'the smoke went straight up.', 'we counted ourselves.', 'I found I could breathe.', 'I still set your bowl out.', 'the hands knew what to do.'];
export function scriptedWork(w, a, art) {
  const g = (a.grief || [])[0];
  const dead = g ? g.name : null;
  const about = dead || (a.partner ? (w.agents.find(x => x.id === a.partner)?.name || null) : null) || pick(['the winter', 'the creek', 'the fire', 'the road']);
  const title = dead ? pick([`${dead}, at the door`, `For ${dead}`, `${dead}'s bowl`, `The winter ${dead} left`]) : pick([`${about} in the morning`, `Smoke`, `What the field keeps`, `Small hands`, `The long walk`]);
  const line = art.key === 'painting' ? pick(['ochre and ash, a figure at the edge of the trees', 'the hearth from above, everyone a small warm mark', 'the creek in winter, blue on grey', 'a door with a bowl on the step']) :
    art.key === 'pottery' ? pick(['a bowl with a thumbprint in the rim', 'a jar the height of a child', 'two cups that do not match', 'a pot with a crack it was fired with']) :
    `${pick(OPEN)} ${pick(CLOSE)}`;
  return { title, line, about };
}

export function make(w, a, act, near, remember, event, bumpTrust) {
  const art = artOf(w, act.art);
  if (!art) return { error: 'no such art' };
  // materials
  let paid = null;
  const can = (needs) => Object.entries(needs).every(([m, n]) => (a.inv[m] || 0) >= n);
  if (can(art.needs)) paid = art.needs; else if (art.alt && can(art.alt)) paid = art.alt;
  if (!paid) { remember(w, a, `You wanted to make a ${art.label} and had nothing to make it from. ${Object.keys(art.needs).join(', ')}${art.alt ? ' or ' + Object.keys(art.alt).join(', ') : ''}.`, 0.4); return { error: 'materials' }; }
  for (const [m, n] of Object.entries(paid)) a.inv[m] -= n;
  const title = String(act.title || '').trim().slice(0, 60);
  const line = String(act.line || act.about || '').trim().slice(0, 200);
  const spec = title && line ? { title, line, about: String(act.about || '').slice(0, 40) } : scriptedWork(w, a, art);
  const work = { id: uid(), art: art.key, title: spec.title, line: spec.line, about: spec.about || '', by: a.id, byName: a.name, day: w.day, moved: 0, kept: art.kept, own: !!(title && line) };
  w.works = w.works || []; w.works.push(work); if (w.works.length > 300) w.works.shift();
  a.works = a.works || []; a.works.push(work.id); if (a.works.length > 40) a.works.shift();
  a.skills = a.skills || {}; a.skills[art.key] = (a.skills[art.key] || 0) + 1;
  // what it does to the maker: sadness gets a shape
  a.body.energy = B.clamp(a.body.energy - 0.08);
  B.gladden(a.body, 0.12); a.body.tightness = B.clamp(a.body.tightness - 0.1); a.body.breath = B.clamp(a.body.breath + 0.1);
  for (const g of a.grief || []) { g.shared += 1; g.sharedToday = (g.sharedToday || 0) + 1; g.intensity = Math.max(0, g.intensity - 0.08); }
  event(w, `${a.name} ${art.verb}: "${work.title}"${art.kept === 'told' ? ` — ${work.line}` : ''}.`, 'care', [a.id]);
  remember(w, a, `You made a ${art.label}, "${work.title}": ${work.line}. Something that was sitting on your chest is on the ${art.kept === 'home' ? 'wall' : 'air'} now instead.`, 0.8);
  if (a.skills[art.key] === 8) { event(w, `${a.name} has become a ${art.maker}.`, 'healed', [a.id]); remember(w, a, art.line, 1); }
  // whoever is there sees it
  for (const o of near) show(w, work, a, o, remember, bumpTrust, true);
  return { ok: true, work };
}
// Someone takes in a work. Being moved is joy and, if it is about their dead, grief shared.
export function show(w, work, maker, o, remember, bumpTrust, fresh = false) {
  if (!o || o === maker) return;
  const art = artOf(w, work.art) || { label: work.art };
  B.gladden(o.body, 0.05); o.body.tightness = B.clamp(o.body.tightness - 0.03);
  work.moved += 1;
  const g = (o.grief || []).find(x => x.name === work.about || (work.title || '').includes(x.name));
  if (g) { g.shared += 1; g.sharedToday = (g.sharedToday || 0) + 1; g.intensity = Math.max(0, g.intensity - 0.06); bumpTrust(o, maker, 0.08); remember(w, o, `${maker.name}'s ${art.label} about ${g.name}: "${work.title}". ${work.line} You had to look away and then you did not.`, 0.9); }
  else { bumpTrust(o, maker, 0.03); remember(w, o, `${maker.name} ${fresh ? 'showed you' : 'has'} a ${art.label}, "${work.title}": ${work.line}`, 0.5); }
}
// At the fire, someone tells a work of theirs. Once a night, if a maker is there and has one.
export function nightlyTelling(w, atHearth, remember, bumpTrust, event) {
  const makers = atHearth.filter(a => (a.works || []).length);
  if (!makers.length || Math.random() < 0.5) return;
  const a = pick(makers);
  const told = (w.works || []).filter(x => x.by === a.id && x.kept === 'told');
  if (!told.length) return;
  const work = pick(told.slice(-5));
  const listeners = atHearth.filter(o => o !== a);
  for (const o of listeners) show(w, work, a, o, remember, bumpTrust);
  if (listeners.length) event(w, `${a.name} ${work.art === 'song' ? 'sings' : work.art === 'story' ? 'tells' : 'says'} "${work.title}" at the fire and ${listeners.slice(0, 3).map(o => o.name).join(', ')}${listeners.length > 3 ? ' and the others' : ''} listen.`, 'comfort', [a.id, ...listeners.map(o => o.id)]);
}
// Inventing an art. Anyone may; it becomes something the whole village can practise.
export function invent(w, a, act, remember, event) {
  w.arts = w.arts || [];
  const name = String(act.name || '').trim().slice(0, 24);
  const what = String(act.what || '').trim().slice(0, 160);
  if (!name || !what) return { error: 'name it and say what it is' };
  if (ARTS[name.toLowerCase()] || w.arts.some(x => x.name.toLowerCase() === name.toLowerCase())) return { error: 'that art exists' };
  if (w.arts.length >= 12) return { error: 'the village has arts enough for now' };
  const needs = /clay/i.test(what) ? { clay: 1 } : /wood|carv/i.test(what) ? { wood: 1 } : /stone/i.test(what) ? { stone: 1 } : /fiber|thread|weav/i.test(what) ? { fiber: 1 } : /berr|pigment|dye|paint/i.test(what) ? { berries: 1 } : {};
  const kept = Object.keys(needs).length ? 'home' : 'told';
  const art = { name, what, needs, kept, by: a.id, byName: a.name, day: w.day };
  w.arts.push(art);
  event(w, `${a.name} has made a new art and calls it ${name}: ${what}`, 'healed', [a.id]);
  for (const o of w.agents) if (o.alive) remember(w, o, `${a.name} made a new art, ${name}: ${what}${o === a ? ' It is yours; you can teach it by doing it.' : ' You could try it.'}`, o === a ? 1 : 0.6);
  B.gladden(a.body, 0.2);
  return { ok: true, art };
}
export function felt(w, a) {
  const L = [];
  for (const [k, n] of Object.entries(a.skills || {})) { const art = artOf(w, k); if (art && n >= 8) L.push(art.line); }
  const sad = (a.body.joy ?? 0.5) < 0.35 || (a.grief || []).some(g => g.intensity > 0.3);
  if (sad) L.push(`Sadness wants a shape. You could make something of it: a ${pick(['poem', 'song', 'story', 'painting', 'pot'])}, or an art of your own.`);
  return L;
}
export function publicWorks(w) { return (w.works || []).slice(-60).map(x => ({ ...x })); }
