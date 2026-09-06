// The record a mind could learn from. Every decision a brained villager makes is kept with what
// it saw and what happened to its body afterward, scored. Export as fine-tuning data.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEM, renderView } from '../client/prompt.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'training');
const pending = new Map();      // agentId -> { view, action, thought, day, tick, before }
const recent = new Map();       // agentId -> last 400 records in memory
const counts = new Map();

function snapshot(w, a) {
  const trust = Object.values(a.trust || {}).reduce((s, v) => s + v, 0);
  return { tightness: a.body.tightness, hurt: a.body.hurt, food: a.body.food, warmth: a.body.warmth, breath: a.body.breath, openness: a.body.openness, trust, alive: a.alive, wounds: a.wounds.reduce((s, r) => s + r.strength, 0), grief: (a.grief || []).reduce((s, g) => s + g.intensity, 0) };
}

// How the body scores what followed. Negative when it hurt, positive when it settled.
export function reward(before, after) {
  if (!after.alive) return -5;
  let r = 0;
  r += (before.tightness - after.tightness) * 2.0;
  r += (before.hurt - after.hurt) * 3.0;
  r += (after.food - before.food) * 1.0;
  r += (after.warmth - before.warmth) * 1.0;
  r += (after.breath - before.breath) * 1.0;
  r += (after.openness - before.openness) * 0.5;
  r += (after.trust - before.trust) * 0.8;
  r += (before.wounds - after.wounds) * 2.0;
  r += (before.grief - after.grief) * 1.0;
  return +r.toFixed(3);
}

// Called when a brained villager's action is accepted for the next tick.
export function begin(w, a, view, action, thought) {
  pending.set(a.id, { view, action, thought: thought || '', day: w.day, tick: w.tick, before: snapshot(w, a) });
}

// Called after the world has stepped. Closes every pending record with its consequence.
export async function settle(w) {
  const writes = [];
  for (const [id, p] of pending) {
    pending.delete(id);
    const a = w.agents.find(x => x.id === id);
    if (!a) continue;
    const after = snapshot(w, a);
    const rec = { id: a.id, name: a.name, day: p.day, tick: p.tick, model: a.model || null, view: p.view, action: p.action, thought: p.thought, before: p.before, after, reward: reward(p.before, after) };
    const list = recent.get(id) || []; list.push(rec); if (list.length > 400) list.shift(); recent.set(id, list);
    counts.set(id, (counts.get(id) || 0) + 1);
    writes.push(fs.mkdir(DIR, { recursive: true }).then(() => fs.appendFile(path.join(DIR, `${id}.jsonl`), JSON.stringify(rec) + '\n')));
  }
  await Promise.all(writes).catch(() => {});
}

export const count = (id) => counts.get(id) || 0;

async function readAll(id) {
  try { const txt = await fs.readFile(path.join(DIR, `${id}.jsonl`), 'utf8'); return txt.split('\n').filter(Boolean).map(l => JSON.parse(l)); }
  catch { return recent.get(id) || []; }
}

// Supervised pairs: what the villager saw -> what it did, kept only when it went well enough.
export async function exportSFT(id, minReward = 0) {
  const recs = (await readAll(id)).filter(r => r.reward >= minReward);
  return recs.map(r => JSON.stringify({ messages: [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: renderView(r.view) },
    { role: 'assistant', content: JSON.stringify({ thought: r.thought, action: r.action }) },
  ], reward: r.reward })).join('\n');
}

// Preference pairs: in similar moments, the choice that led somewhere better is preferred.
// "Similar" = same place, same count of people near, same coarse body state.
export async function exportDPO(id) {
  const recs = await readAll(id);
  const key = (r) => `${r.view.where}|${r.view.near.length}|${r.before.food < 0.35 ? 'hungry' : 'fed'}|${r.before.warmth < 0.35 ? 'cold' : 'warm'}|${r.before.tightness > 0.5 ? 'tight' : 'easy'}`;
  const groups = new Map();
  for (const r of recs) { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const pairs = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((x, y) => y.reward - x.reward);
    const top = g.slice(0, Math.ceil(g.length / 3)), bottom = g.slice(-Math.ceil(g.length / 3));
    for (const good of top) for (const bad of bottom) {
      if (good === bad || good.reward - bad.reward < 0.3) continue;
      if (JSON.stringify(good.action) === JSON.stringify(bad.action)) continue;
      pairs.push({ prompt: [{ role: 'system', content: SYSTEM }, { role: 'user', content: renderView(good.view) }], chosen: JSON.stringify({ thought: good.thought, action: good.action }), rejected: JSON.stringify({ thought: bad.thought, action: bad.action }), margin: +(good.reward - bad.reward).toFixed(3) });
      if (pairs.length >= 2000) break;
    }
  }
  return pairs.map(p => JSON.stringify(p)).join('\n');
}

export async function summary(id) {
  const recs = await readAll(id);
  if (!recs.length) return { n: 0 };
  const byType = {};
  for (const r of recs) { const t = r.action?.type || '?'; byType[t] = byType[t] || { n: 0, sum: 0 }; byType[t].n++; byType[t].sum += r.reward; }
  for (const t of Object.keys(byType)) byType[t] = { n: byType[t].n, mean: +(byType[t].sum / byType[t].n).toFixed(3) };
  return { n: recs.length, mean: +(recs.reduce((s, r) => s + r.reward, 0) / recs.length).toFixed(3), byType, worst: recs.slice().sort((a, b) => a.reward - b.reward).slice(0, 3).map(r => ({ day: r.day, action: r.action, reward: r.reward })), best: recs.slice().sort((a, b) => b.reward - a.reward).slice(0, 3).map(r => ({ day: r.day, action: r.action, reward: r.reward })) };
}
