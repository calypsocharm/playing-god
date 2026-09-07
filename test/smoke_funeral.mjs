import * as World from '../server/world.js';
const w = World.createWorld(null); w.weather.daysPerSeason = 8; const acts = new Map(); const seen = new Set();
const v = World.alive(w)[0]; const o = World.alive(w)[1]; o.trust[v.id] = -0.6; o.wounds.push({ kind: 'struck', trigger: 'weakness', belief: 'weakness gets punished', strength: 0.5, day: 0, contradictions: 0, from: null });
for (let i = 0; i < 4 * World.TICKS_PER_DAY; i++) World.step(w, acts);
w.god.attention = 8; // force a death via the Death card path: age the oldest
const old = World.alive(w)[2]; old.bornDay = -200 * w.weather.daysPerSeason * 4; w.god.attention = 8;
World.godAct(w, { op: 'draw' }); // random card; instead kill directly:
const before = World.alive(w).length;
for (let i = 0; i < 3 * World.TICKS_PER_DAY; i++) { if (World.alive(w).length === before && w.tick === 1 && i > 6) { old.body.food = 0; old.body.warmth = 0; } World.step(w, acts); for (const e of w.events) { const k = e.day + e.tick + e.text; if (seen.has(k) || !/died|buries|stones|wake/.test(e.text)) continue; seen.add(k); console.log(`d${e.day} t${e.tick} [${e.kind}] ${e.text.slice(0, 200)}`); } }
console.log('funerals queued', (w.funerals || []).length, 'graves', (w.graves || []).map(g => `${g.name} by ${g.by} (${g.mourners})`));
const m = World.alive(w).find(a => a.memories.some(x => /stood at the stones/.test(x.text))); console.log('memory:', m && m.memories.find(x => /stones/.test(x.text)).text.slice(0, 200));
const grief = World.alive(w).flatMap(a => (a.grief || []).map(g => `${a.name}->${g.name} ${g.intensity.toFixed(2)} buried:${!!g.buried}`)); console.log('grief', grief);
for (let i = 0; i < 8 * 12 * World.TICKS_PER_DAY; i++) World.step(w, acts);
console.log('after 12 seasons: o trust for v', o.alive ? o.trust[v.id]?.toFixed(3) : 'dead', 'o wounds', o.alive ? o.wounds.map(r => r.strength.toFixed(2)) : '-', 'scars', o.alive ? o.scars.length : '-');
console.log('publicState graves', World.publicState(w).graves.length, 'places.graves', !!World.publicState(w).places.graves); console.log('SMOKE DONE');
