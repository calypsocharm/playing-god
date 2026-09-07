import * as Brain from './brain.js';
import * as PX from './pixel.js';
import * as Interior from './interior.js';

// ---------- state ----------
let state = null;
let selected = null;
let godOk = false;
let token = localStorage.getItem('playinggod.token') || null;
const owned = new Set();
const display = new Map(); // agentId -> {x,y} smoothed position
let cam = { x: 0, y: 0, scale: 1 };
let dragging = null;
let brainCfg = Brain.loadBrainConfig();
const brainBusy = new Map(); // agentId -> when its current brain call started

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (v) => Math.round(v * 100);

// ---------- socket ----------
let ws;
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { send({ type: 'hello', token, godToken: localStorage.getItem('playinggod.god') || undefined }); $('sky').textContent = 'connected'; if (localStorage.getItem('playinggod.lend') === '1') send({ type: 'lend', on: true, name: localStorage.getItem('playinggod.lendName') || '' }); };
  ws.onclose = () => { $('sky').textContent = 'disconnected, retrying…'; setTimeout(connect, 2000); };
  ws.onmessage = (e) => { const m = JSON.parse(e.data); onMessage(m); };
}
const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

// Arriving from the character creator: select the newborn and open their page.
const wantSelect = new URLSearchParams(location.search).get('select');
if (wantSelect) { selected = wantSelect; history.replaceState(null, '', '/'); }

// While a moment is open, time stops for this viewer: new states are held back until it closes.
let frozen = false, heldState = null;

function onMessage(m) {
  switch (m.type) {
    case 'state':
      if (frozen) { heldState = m.state; break; }
      state = m.state; if (wantSelect && selected === wantSelect && state.agents.some(a => a.id === wantSelect)) showTab('agent'); renderPanels(); renderTalkBar(); break;
    case 'god': godOk = m.ok; $('pillGod').textContent = godOk ? 'you are the Creator' : 'watching'; $('pillGod').classList.toggle('on', godOk); $('godPanel').hidden = !godOk;
      $('godMsg').textContent = godOk ? 'Unlocked. You are the Creator. The village will only ever know you as the weather. Set the wind and cold with the sliders below.' : 'That is not the password. This box does not take weather; the sliders below do, once unlocked. On your own machine the password is the word: weather';
      if (godOk) $('godGate').style.opacity = 0.55;

      $('godMsg').style.color = godOk ? 'var(--good)' : 'var(--bad)';
      if (!godOk && localStorage.getItem('playinggod.god')) log('god token refused'); break;
    case 'adopted': token = m.token; localStorage.setItem('playinggod.token', token); owned.add(m.agentId); updateBrainPill(); renderBrainTab(); renderTalkBar(); break;
    case 'decide': onDecide(m); break;
    case 'consolidate': onConsolidate(m); break;
    case 'tell': onTell(m.digest); break;
    case 'invent': onInvent(m); break;
    case 'decideMany': onDecideMany(m.items); break;
    case 'chat': appendChat(m.msg); break;
    case 'error': log('server: ' + m.error); if (!m.soft) toast(m.error, 'bad'); if (/attention/.test(m.error)) { weatherDirty = false; setTimeout(renderWeather, 300); } break;
    case 'result': toast(m.text, 'good'); addSkyAct(m.text); break;
    case 'dilemma': showDilemma(m); break;
    case 'communeView': onCommuneView(m); break;
    case 'eyes': onEyes(m); break;
    case 'communeLog': communeThreads.set(m.agentId, m.thread || []); if (selected === m.agentId) renderInspector(); renderBrainTab(); renderTalkBar(); break;
  }
}

// ---------- brain loop ----------
// Each villager may run on its own provider and model. Keys are shared per provider.
function cfgFor(agentId) {
  const p = (brainCfg.perAgent || {})[agentId];
  if (!p || !p.provider) return brainCfg;
  return { ...brainCfg, provider: p.provider, model: p.model || Brain.PROVIDERS[p.provider]?.models[0], baseUrl: p.baseUrl || brainCfg.baseUrl };
}
async function onDecide(m) {
  if (!owned.has(m.agentId)) return;
  // One call in flight per villager, but a call stuck loading a model must not block forever.
  const since = brainBusy.get(m.agentId);
  if (since && performance.now() - since < 30000) return;
  const mine = performance.now();
  brainBusy.set(m.agentId, mine);
  const name = m.view.you.name;
  try {
    const r = await Brain.decide(cfgFor(m.agentId), m.view);
    if (brainBusy.get(m.agentId) !== mine) return;   // a newer call took over; this answer is stale
    send({ type: 'action', agentId: m.agentId, action: r.action, thought: r.thought });
    log(`${name} (${Math.round(performance.now() - mine)}ms): ${JSON.stringify(r.action)}${r.thought ? '  // ' + r.thought : ''}`);
  } catch (e) {
    if (brainBusy.get(m.agentId) === mine) log(`${name}: brain failed, scripted stands in. ${e.message}`);
  } finally { if (brainBusy.get(m.agentId) === mine) brainBusy.delete(m.agentId); }
}
// A villager of yours decided last night that something deserved a day. Their model names it.
async function onInvent(m) {
  if (!owned.has(m.agentId)) return;
  const v = m.view;
  const why = { harvest: 'the first harvest is in', midwinter: 'the village came through the winter with no one lost', birth: 'a child was born', found: 'a new place was found out in the pale', healed: 'an old hurt finally let go of someone' }[m.reason] || 'something good happened';
  const user = `You are ${v.you.name}, ${v.you.age}, of a small village. ${v.you.chart} ${v.you.nature.join(' ')}
Last night you decided: ${why}, and this deserves a day, every year. You are the one who makes it up. Invent it as this person would, from what this village actually has (fire, field, forest, well, store, the animals, the dead, the sky they call ${v.skyName || 'the sky'}). Not a copy of any real-world holiday.

Answer with ONLY this JSON:
{"name": "<what the day is called, 2 to 5 words>", "decorate": "<one sentence: how the village is dressed for it>", "song": "<one line of the song everyone sings>", "dance": true or false, "food": "<what is shared>"}`;
  try {
    const raw = await Brain.callModel(cfgFor(m.agentId), 'You invent a village holiday, in character. JSON only.', user, { maxTokens: 300, json: true });
    const mm = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').match(/\{[\s\S]*\}/);
    const spec = mm ? JSON.parse(mm[0]) : {};
    send({ type: 'invented', agentId: m.agentId, spec });
    log(`${v.you.name} made a day: ${spec.name || '(unnamed)'}`);
    toast(`${v.you.name} made a holiday: ${spec.name || 'a day of their own'}`, 'good');
  } catch (e) { log(`${v.you.name} could not name the day: ${e.message}`); }
}
async function onConsolidate(m) {
  if (!owned.has(m.agentId)) return;
  try {
    const r = await Brain.consolidate(cfgFor(m.agentId), m);
    send({ type: 'summary', agentId: m.agentId, text: r.self, diary: r.diary });
    log(`${m.name} writes: ${r.diary}${r.self ? '\n    and is: ' + r.self : ''}`);
  } catch (e) { log(`${m.name}: could not write tonight. ${e.message}`); }
}
// Lent minds: several villagers, one call. Each gets a short view; the model answers for all of them.
let lendBusy = false;
async function onDecideMany(items) {
  if (localStorage.getItem('playinggod.lend') !== '1' || lendBusy || !items?.length) return;
  lendBusy = true;
  const t0 = performance.now();
  try {
    const blocks = items.map((it, i) => {
      const v = it.view;
      const near = v.near.length ? `With: ${v.near.join('; ')}.` : 'Alone.';
      const mem = v.memories.slice(0, 3).join(' ');
      return `### ${i + 1}. ${v.you.name} (${v.you.age}, ${v.you.stage})\n${v.you.nature.slice(0, 2).join(' ')}\n${v.where}. ${v.felt.slice(0, 4).join(' ')} ${near}\nCarrying: ${v.carrying}. ${v.wants}\nRemembers: ${mem}\n${v.diary.length ? 'Last night wrote: ' + v.diary[v.diary.length - 1].replace(/^Day \d+: /, '') : ''}`;
    }).join('\n\n');
    const v0 = items[0].view;
    const user = `${v0.when} ${v0.village?.join('; ') || ''} ${v0.remembers?.length ? 'The village remembers: ' + v0.remembers.join(' ') : ''}

Several villagers must each choose what to do this moment. For each, answer as that person: one action and a few private words. They are plain people in a hard place; they speak in full sentences, in their own voice, and when someone spoke to them they answer that person. Never mention being an AI.

Actions: ${v0.actions.join(' | ')}

${blocks}

Reply with ONE JSON object only: {"decisions":[{"name":"<name>","thought":"<under 20 words>","action":{"type":"...","to":"...","target":"...","say":"...","item":"...","what":"..."}}]}. Include every villager above.`;
    const text = await Brain.callModel(brainCfg, 'You voice several villagers at once. JSON only.', user, { maxTokens: 300 + items.length * 140, json: true });
    const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
    const m = clean.match(/\{[\s\S]*\}/);
    const o = JSON.parse(m[0]);
    const decisions = Array.isArray(o.decisions) ? o.decisions : Array.isArray(o) ? o : [];
    const out = decisions.map(d => { const it = items.find(x => x.view.you.name.toLowerCase() === String(d.name || '').toLowerCase()); return it ? { agentId: it.agentId, name: d.name, action: d.action || d, thought: d.thought || '' } : null; }).filter(Boolean);
    if (out.length) send({ type: 'actions', items: out });
    log(`the village spoke (${out.length}/${items.length}, ${Math.round(performance.now() - t0)}ms): ${out.slice(0, 3).map(x => `${x.name} ${x.action?.type}${x.action?.say ? ` "${String(x.action.say).slice(0, 40)}"` : ''}`).join(' · ')}`);
  } catch (e) { log(`lent minds failed this tick (scripted stood in): ${e.message}`); }
  finally { lendBusy = false; }
}

// The storyteller. If you are the weather and have a model, it writes tonight's chronicle from the facts.
async function onTell(d) {
  if (!godOk || localStorage.getItem('playinggod.tell') !== '1') return;
  if (!brainCfg.model && !Brain.PROVIDERS[brainCfg.provider]) return;
  const facts = d.facts.length ? d.facts.map(f => '- ' + f).join('\n') : '- Nothing of note. People worked and ate.';
  const user = `You are the unnamed teller of a small village's story. Write tonight's entry: one paragraph, 3 to 6 sentences, past tense, plain and unsentimental, the way a good chronicle reads. Name people. Do not invent events; use only the facts. Do not moralise or explain. No headings, no lists.

Day ${d.day}, year ${d.year}, ${d.season}. Weather: ${d.sky}. ${d.alive} alive, ${d.couples} couples, ${d.children} children. The village calls the sky ${d.skyName}.
${d.prev.length ? '\nThe last entries, for continuity:\n' + d.prev.map(p => '- ' + p).join('\n') : ''}

What happened today:
${facts}
${(d.why || []).length ? '\nWhy people are as they are tonight (use this; a face always has a reason):\n' + d.why.map(t => '- ' + t).join('\n') : ''}
${d.talk.length ? '\nThings people said:\n' + d.talk.map(t => '- ' + t).join('\n') : ''}
${d.diaries.length ? '\nFrom the diaries tonight:\n' + d.diaries.map(t => '- ' + t).join('\n') : ''}

Write the paragraph now.`;
  try {
    const text = await Brain.callModel(brainCfg, 'You write a village chronicle. Plain, exact, past tense, one paragraph.', user, { maxTokens: 400 });
    const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim().replace(/^["“]|["”]$/g, '');
    if (clean) { send({ type: 'told', day: d.day, text: clean }); log(`the teller wrote day ${d.day}: ${clean.slice(0, 120)}…`); }
  } catch (e) { log(`the teller could not write tonight: ${e.message}`); }
}
function log(s) {
  const el = $('brainLog');
  el.textContent = (new Date().toLocaleTimeString() + '  ' + s + '\n' + el.textContent).slice(0, 12000);
}
// ---------- the talk bar: always at the top, on every tab ----------
function renderTalkBar() {
  if (!state) return;
  const mine = state.agents.filter(a => owned.has(a.id) && a.alive);
  const sel = $('talkWho');
  const opts = mine.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  if (sel.innerHTML !== opts) { const keep = sel.value; sel.innerHTML = opts; if (mine.some(a => a.id === keep)) sel.value = keep; }
  const have = mine.length > 0;
  $('talkText').disabled = !have; $('talkSend').disabled = !have; $('talkOpen').disabled = !have;
  $('talkText').placeholder = have ? `say anything to ${mine.find(a => a.id === sel.value)?.name || 'them'}; they answer as themselves` : 'claim a villager first, in the Higher Self tab';
  const id = sel.value;
  if (!have) { $('talkReply').innerHTML = '<span class="muted">Nobody is yours in this browser yet. Open the Higher Self tab and claim someone, or claim back one of yours from their page.</span>'; return; }
  const th = (communeThreads.get(id) || []).slice(-2);
  const a = mine.find(x => x.id === id);
  if (communeBusy.has(id)) $('talkReply').innerHTML = `<span class="muted">…${esc(a.name)} is thinking</span>`;
  else if (!th.length) $('talkReply').innerHTML = `<span class="muted">${esc(a.name)} has not heard from you yet. They do not know what you are.</span>`;
  else $('talkReply').innerHTML = th.map(t => `<div><span class="muted">${t.from === 'self' ? 'you' : esc(a.name)}:</span> ${esc(t.text)}</div>`).join('');
}
$('talkSend').onclick = () => { const id = $('talkWho').value, text = $('talkText').value.trim(); if (!id || !text) return; send({ type: 'commune', agentId: id, text }); $('talkText').value = ''; };
$('talkText').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('talkSend').click(); } });
$('talkWho').onchange = renderTalkBar;
$('talkOpen').onclick = () => { const id = $('talkWho').value; if (!id) return; selected = id; showTab('agent'); renderInspector(); };
function updateBrainPill() {
  const n = owned.size;
  try { localStorage.setItem('playinggod.owned', JSON.stringify([...owned])); } catch {}
  const names = state ? [...owned].map(id => state.agents.find(a => a.id === id)?.name).filter(Boolean) : [];
  $('pillBrain').textContent = n ? (names.length && names.length <= 3 ? `higher self of ${names.join(' & ')}` : `higher self of ${n}`) : 'no one is yours yet';
  $('pillBrain').title = names.length ? 'Yours: ' + names.join(', ') + '. Click to see them.' : 'Claim or birth a villager in the Higher Self tab.';
  $('pillBrain').style.cursor = 'pointer';
  $('pillBrain').onclick = () => showTab('brain');
  $('pillBrain').classList.toggle('on', n > 0);
}

// ---------- canvas ----------
const canvas = $('c'); const ctx = canvas.getContext('2d');
let W = 0, H = 0, TILE = 24;
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  W = canvas.width = Math.floor(r.width * devicePixelRatio); H = canvas.height = Math.floor(r.height * devicePixelRatio);
  if (state) { const b = showAll ? state.map : knownBounds(); TILE = Math.min(W / (b.w + 2), H / (b.h + 2)); }
}
// The land people know: the smallest box around every walked cell, so the view fits what matters.
let showAll = false;
function knownBounds() {
  if (!state?.explored) return state.map;
  const cell = state.cell || 2, cols = Math.ceil(state.map.w / cell), rows = Math.ceil(state.map.h / cell);
  let mx = 0, my = 0;
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) if (state.explored[cy * cols + cx] === '1') { if (cx > mx) mx = cx; if (cy > my) my = cy; }
  return { w: Math.min(state.map.w, (mx + 2) * cell), h: Math.min(state.map.h, (my + 2) * cell) };
}
addEventListener('resize', resize); resize();

const toScreen = (x, y) => ({ x: (x + 1) * TILE * cam.scale + cam.x, y: (y + 1) * TILE * cam.scale + cam.y });
const fromScreen = (sx, sy) => ({ x: (sx - cam.x) / (TILE * cam.scale) - 1, y: (sy - cam.y) / (TILE * cam.scale) - 1 });

const snow = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() }));
let t = 0;

// ---------- faces ----------
// A face drawn from the body. Nothing is labelled; the dials become brows, mouth, colour, tears.
function expressionOf(a) {
  const b = a.body;
  if (!a.alive) return 'gone';
  if (b.overwhelmed > 0) return 'crying, can\'t breathe';
  if (b.hurt > 0.6) return 'in pain';
  if (b.tightness > 0.7) return 'clenched, guarded';
  if ((a.grief || []).length && b.tightness > 0.35) return 'grieving';
  if (b.warmth < 0.3) return 'shivering';
  if (b.food < 0.25) return 'hollow with hunger';
  if (b.tightness > 0.45) return 'tense';
  if (b.energy < 0.25) return 'exhausted';
  if (b.openness > 0.7 && b.tightness < 0.25) return 'easy, almost smiling';
  if (b.openness < 0.3) return 'closed off';
  return 'quiet';
}

function drawFace(g, cx, cy, r, a) {
  const b = a.body;
  const cold = b.warmth < 0.35, old = (a.age ?? 40) >= 80, elder = (a.age ?? 40) >= 65;
  // skin
  const base = cold ? [159, 184, 217] : old ? [217, 210, 199] : elder ? [230, 211, 184] : [241, 215, 181];
  const pale = 1 - Math.max(0, 0.25 - b.food) * 2;   // hunger drains colour
  g.fillStyle = `rgb(${base.map(v => Math.round(v * (0.75 + 0.25 * pale))).join(',')})`;
  g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  // hollow cheeks when starving
  if (b.food < 0.3) { g.strokeStyle = 'rgba(60,40,30,.35)'; g.lineWidth = r * 0.08; g.beginPath(); g.arc(cx - r * 0.55, cy + r * 0.15, r * 0.3, 0.3, 1.6); g.stroke(); g.beginPath(); g.arc(cx + r * 0.55, cy + r * 0.15, r * 0.3, 1.5, 2.85); g.stroke(); }
  // hair: grey for the old
  if (elder) { g.strokeStyle = old ? '#e9e9e9' : '#cfc6b8'; g.lineWidth = r * 0.14; g.beginPath(); g.arc(cx, cy - r * 0.12, r * 0.88, Math.PI * 1.12, Math.PI * 1.88); g.stroke(); }
  // eyes: energy opens them, tightness narrows them
  const openEye = Math.max(0.15, Math.min(1, 0.35 + b.energy * 0.6 - b.tightness * 0.35));
  const ey = cy - r * 0.15, ex = r * 0.36, ew = r * 0.17, eh = r * 0.17 * openEye;
  g.fillStyle = '#1b1f27';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * ex, ey, ew, Math.max(1, eh), 0, 0, 7); g.fill(); }
  // brows: tightness pulls them in and down; openness lifts them
  const knit = b.tightness * 0.5 - b.openness * 0.15;
  g.strokeStyle = old ? '#bbb' : '#3a2f26'; g.lineWidth = Math.max(1.2, r * 0.09); g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * (ex + ew * 1.1), ey - r * 0.32 + knit * r * 0.1);
    g.lineTo(cx + s * (ex - ew * 1.1), ey - r * 0.32 + knit * r * 0.45);
    g.stroke();
  }
  // mouth: openness smiles it, tightness and hurt turn it down; overwhelmed opens it
  const curve = (b.openness - 0.45) * 1.1 - b.tightness * 1.0 - b.hurt * 0.5;
  const my = cy + r * 0.42, mw = r * 0.42;
  g.strokeStyle = '#5a2e2a'; g.lineWidth = Math.max(1.2, r * 0.08);
  g.beginPath();
  if (b.overwhelmed > 0) { g.fillStyle = '#4a2320'; g.ellipse(cx, my, mw * 0.5, r * 0.16, 0, 0, 7); g.fill(); }
  else { g.moveTo(cx - mw, my - curve * r * 0.12); g.quadraticCurveTo(cx, my + curve * r * 0.5, cx + mw, my - curve * r * 0.12); g.stroke(); }
  // tears
  if (b.overwhelmed > 0 || (b.tightness > 0.75 && b.breath < 0.6)) { g.fillStyle = 'rgba(120,170,235,.9)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * ex, ey + r * 0.3, r * 0.06, r * 0.14, 0, 0, 7); g.fill(); } }
  // hurt: a bruise
  if (b.hurt > 0.3) { g.fillStyle = `rgba(110,60,120,${0.25 + b.hurt * 0.5})`; g.beginPath(); g.ellipse(cx + ex * 0.9, cy + r * 0.12, r * 0.16, r * 0.11, 0.4, 0, 7); g.fill(); }
  // shivering: blue lips
  if (cold) { g.strokeStyle = 'rgba(90,120,200,.8)'; g.lineWidth = Math.max(1, r * 0.05); g.beginPath(); g.moveTo(cx - mw * 0.8, my + r * 0.05); g.lineTo(cx + mw * 0.8, my + r * 0.05); g.stroke(); }
}

function haloColor(b) {
  // open and warm = amber, tight and closed = blue, overwhelmed = red pulse
  if (b.overwhelmed > 0) return `rgba(217,100,91,${0.55 + 0.35 * Math.sin(t * 6)})`;
  const tight = b.tightness;
  const r = Math.round(232 * (1 - tight) + 91 * tight), g = Math.round(160 * (1 - tight) + 143 * tight), bl = Math.round(76 * (1 - tight) + 217 * tight);
  return `rgba(${r},${g},${bl},0.55)`;
}

function draw() {
  requestAnimationFrame(draw);
  t += 1 / 60;
  ctx.clearRect(0, 0, W, H);
  if (!state) return;
  // Observing someone: the camera stays on them, close, wherever they go.
  if (observing && !frozen) {
    const oa = state.agents.find(x => x.id === observing);
    if (oa && oa.alive) { const p = display.get(oa.id) || oa.pos; const r = canvas.getBoundingClientRect(); const scale = 2.6; camTarget = { scale, x: (r.width * devicePixelRatio) / 2 - (p.x + 1) * TILE * scale, y: (r.height * devicePixelRatio) / 2 - (p.y + 1) * TILE * scale }; }
    else stopObserving();
  }
  // Camera glides toward its target when a moment opens or closes.
  if (camTarget) {
    cam.scale += (camTarget.scale - cam.scale) * 0.12; cam.x += (camTarget.x - cam.x) * 0.12; cam.y += (camTarget.y - cam.y) * 0.12;
    if (Math.abs(camTarget.scale - cam.scale) < 0.005 && Math.abs(camTarget.x - cam.x) < 1 && Math.abs(camTarget.y - cam.y) < 1) camTarget = null;
  }
  if (!TILE || TILE < 4) resize();
  const S = TILE * cam.scale;
  const { map, places, weather } = state;
  const isWinter = weather.season === 'winter', cold = weather.cold;
  const dark = state.tick >= 4 ? (state.tick === 5 ? 0.55 : 0.3) : state.tick === 0 ? 0.2 : 0;

  // ground: pre-rendered pixel tiles, scaled with no smoothing
  const o = toScreen(0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(PX.groundLayer(map, weather.season, weather.harvest), o.x, o.y, map.w * S, map.h * S);
  if (isWinter || cold > 0.45) { const sn = PX.snowLayer(map, isWinter ? 0.9 : (cold - 0.45)); if (sn) ctx.drawImage(sn, o.x, o.y, map.w * S, map.h * S); }
  // the pale: land no one has walked is dark. Its edge softens where it meets known ground.
  if (state.explored) {
    const cell = state.cell || 2, cols = Math.ceil(map.w / cell), rows = Math.ceil(map.h / cell), ex = state.explored;
    const known = (cx, cy) => cx < 0 || cy < 0 || cx >= cols || cy >= rows ? false : ex[cy * cols + cx] === '1';
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      if (known(cx, cy)) continue;
      const edge = known(cx - 1, cy) || known(cx + 1, cy) || known(cx, cy - 1) || known(cx, cy + 1);
      const q = toScreen(cx * cell, cy * cell);
      ctx.fillStyle = edge ? 'rgba(8,10,14,0.62)' : 'rgba(8,10,14,0.9)';
      ctx.fillRect(q.x, q.y, cell * S + 0.5, cell * S + 0.5);
    }
  }
  // worn paths between the hearth and the places people go; a laid road once the store has paid for one
  const roadDone = !!state.builds?.road?.done;
  ctx.strokeStyle = roadDone ? 'rgba(155,139,106,.9)' : 'rgba(120,95,60,.28)'; ctx.lineWidth = S * (roadDone ? 0.55 : 0.35); ctx.lineCap = 'round';
  const hc = toScreen(places.hearth.x, places.hearth.y);
  for (const k of ['well', 'field', 'forest', 'meadow', 'quarry', 'road']) { const p = places[k]; if (!p) continue; const c = toScreen(p.x, p.y); ctx.beginPath(); ctx.moveTo(hc.x, hc.y); ctx.lineTo(c.x, c.y); ctx.stroke(); }

  // places: sprites
  const tile = (img, tx, ty, size = 1) => { const c = toScreen(tx, ty); PX.blit(ctx, img, c.x - S * size / 2, c.y - S * size / 2, S * size); };
  for (const [k, p] of Object.entries(places)) {
    if (k === 'camp' && !state.camp?.founded) continue;
    const c = toScreen(p.x, p.y);
    if (k === 'hearth') {
      tile(state.hearth.wood > 0 ? PX.fire(t) : PX.FIRE_OUT, p.x, p.y, 2.2);
      if (state.holidayToday) {
        // bunting strung out from the hearth to the houses, and the day's name over the fire
        const cols = ['#e8a04c', '#c0304a', '#5b8fd9', '#6cc38a', '#fff1a8'];
        const homes = state.agents.filter(a => a.alive && a.settlement !== 'camp').map(a => a.home).slice(0, 8);
        homes.forEach((h, hi) => { const q = toScreen(h.x, h.y); const n = 9; for (let i = 0; i <= n; i++) { const f = i / n; const x = c.x + (q.x - c.x) * f, y = c.y + (q.y - c.y) * f + Math.sin(f * Math.PI) * S * 0.6; ctx.fillStyle = cols[(i + hi) % cols.length]; ctx.beginPath(); ctx.moveTo(x - S * 0.22, y); ctx.lineTo(x + S * 0.22, y); ctx.lineTo(x, y + S * 0.5); ctx.closePath(); ctx.fill(); } ctx.strokeStyle = 'rgba(60,40,20,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.quadraticCurveTo((c.x + q.x) / 2, (c.y + q.y) / 2 + S * 0.9, q.x, q.y); ctx.stroke(); });
        ctx.fillStyle = 'rgba(255,241,168,.95)'; ctx.font = `bold ${Math.max(11, Math.min(18 * devicePixelRatio, S * 0.6))}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(state.holidayToday.name, c.x, c.y - S * 2.6);
      }
    }
    else if (k === 'camp') {
      // A second town: a worn track out from the edge, a ring of trodden ground, its own fire and name.
      for (let x = 40; x < p.x - 1; x++) tile(PX.ROAD, x, 12, 1);
      ctx.strokeStyle = 'rgba(155,139,106,.55)'; ctx.lineWidth = Math.max(2, S * 0.12); ctx.setLineDash([S * 0.5, S * 0.35]); ctx.beginPath(); ctx.arc(c.x, c.y, S * 6.2, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(155,139,106,.10)'; ctx.fill();
      tile(state.camp.wood > 0 ? PX.fire(t + 0.5) : PX.FIRE_OUT, p.x, p.y, 1.8);
      ctx.fillStyle = 'rgba(255,210,138,.9)'; ctx.font = `bold ${Math.max(11, Math.min(16 * devicePixelRatio, S * 0.55))}px system-ui`; ctx.textAlign = 'center';
      ctx.fillText(state.camp.name || 'the camp', c.x, c.y - S * 6.8);
    }
    else if (k === 'well') tile(PX.WELL, p.x, p.y, 1.8);
    else if (k === 'field') { for (let dx = -1; dx <= 1; dx++) for (let dy = -0.5; dy <= 0.5; dy++) tile(isWinter ? PX.FIELD_WINTER : PX.FIELD, p.x + dx * 2, p.y + dy * 2, 2); }
    else if (k === 'forest') { for (let i = 0; i < 9; i++) { const ang = i * 0.7, rr = 1.1 + (i % 3) * 0.6; tile(isWinter ? PX.PINE_SNOW : PX.PINE, p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr * 0.8, 1.6); } }
    else if (k === 'road') { for (let dx = -2; dx <= 2; dx++) tile(PX.ROAD, p.x + dx, p.y, 1); }
    else if (k === 'meadow') { if (!isWinter) for (let dx = -1; dx <= 1; dx++) for (let dy = -0.5; dy <= 0.5; dy++) tile(PX.MEADOW, p.x + dx * 1.6, p.y + dy * 1.6, 1.6); }
    else if (k === 'quarry') { tile(PX.ROCKS, p.x, p.y, 2.4); tile(PX.ROCKS, p.x + 1.4, p.y + 0.6, 1.4); }
    else if (k === 'creek') { for (let dx = -2; dx <= 2; dx++) tile(PX.WATER[((Math.floor(t * 2 + dx) % 2) + 2) % 2], p.x + dx, p.y + Math.sin(dx * 1.3) * 0.6, 1); if (state.builds?.pool?.done) tile(PX.POOL, p.x + 1.5, p.y - 1.4, 2); }
    else if (k === 'grove') tile(PX.GROVE, p.x, p.y, 2.6);
    else if (k === 'claypit') tile(PX.CLAY, p.x, p.y, 2);
    else if (k === 'store') tile(PX.STORE, p.x, p.y, 1.8);
    else if (k === 'rival') {
      // Another people's fire: tents in a rough ring, their fire, and a smudge of smoke.
      const rv = state.rival; const n = Math.min(8, Math.max(2, Math.round((rv?.people || 6) / 2)));
      for (let i = 0; i < n; i++) { const ang = i * (6.28 / n) + 0.4, rr = 2.2; tile(i % 3 === 0 ? PX.TENT_DARK : PX.TENT, p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr * 0.7, 1.3); }
      tile(PX.fire(t), p.x, p.y, 1.2);
      ctx.fillStyle = 'rgba(200,200,200,.25)'; for (let i = 0; i < 3; i++) { const sy = c.y - S * (1 + i * 0.9 + ((t * 0.4 + i * 0.3) % 1) * 0.6); ctx.beginPath(); ctx.arc(c.x + Math.sin(t + i) * S * 0.3, sy, S * (0.25 + i * 0.12), 0, 7); ctx.fill(); }
    }
    else if (k === 'bank') tile(PX.BANK, p.x, p.y, 1.8);
    else if (k === 'graves') { const gs = (state.graves || []).slice(-14); gs.forEach((g, i) => tile(PX.STONE, p.x - 1.8 + (i % 7) * 0.6, p.y - 0.6 + Math.floor(i / 7) * 0.7, 0.55)); if (!gs.length) tile(PX.STONE, p.x, p.y, 0.5); }
    else if (k === 'council') tile(PX.MEETING, p.x, p.y, 2);
    // What the council raised by the well.
    if (k === 'well') { if (state.builds?.bathhouse?.done) tile(PX.POOL, p.x + 1.6, p.y - 1.4, 1.5); if (state.builds?.wellhouse?.done) { ctx.fillStyle = '#7a5533'; ctx.fillRect(c.x - S * 0.7, c.y - S * 0.9, S * 1.4, S * 0.25); } }
    else if (k === 'edge') { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.setLineDash([S * 0.3, S * 0.3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(c.x + S * 0.6, c.y - S * 11); ctx.lineTo(c.x + S * 0.6, c.y + S * 11); ctx.stroke(); ctx.setLineDash([]); }
    // Buildings rise beside the hearth as they are raised.
    if (k === 'hearth') {
      if (state.card && state.day - state.card.day <= 1 && PX.CARD[state.card.suit]) { tile(PX.CARD[state.card.suit], p.x - 1.4, p.y + 1.2, 1.1); if (S > 14) { ctx.fillStyle = 'rgba(255,241,168,.85)'; ctx.font = `${Math.max(8, S * 0.32)}px system-ui`; ctx.textAlign = 'center'; const cc = toScreen(p.x - 1.4, p.y + 1.2); ctx.fillText(state.card.name, cc.x + S * 0.55, cc.y + S * 1.35); } }
      const g = state.builds?.granary, h = state.builds?.hall;
      const prog = (b, spec) => b ? Math.min(1, Object.entries(spec.cost).reduce((acc, [m, n]) => acc + Math.min(1, (b.have?.[m] || 0) / n), 0) / Object.keys(spec.cost).length) : 0;
      const pg = prog(g, state.buildSpecs.granary), ph = prog(h, state.buildSpecs.hall);
      if (pg > 0) { ctx.globalAlpha = g.done ? 1 : 0.35 + pg * 0.5; tile(PX.GRANARY, p.x + 2.6, p.y - 0.4, 1.8); ctx.globalAlpha = 1; }
      // What the council raised here: the common house and the schoolhouse.
      const cm = state.builds?.commons, sc = state.builds?.school;
      const pcm = cm ? prog(cm, state.buildSpecs.commons) : 0, psc = sc ? prog(sc, state.buildSpecs.school) : 0;
      if (pcm > 0) { ctx.globalAlpha = cm.done ? 1 : 0.35 + pcm * 0.5; tile(PX.BIGHOUSE, p.x - 3, p.y - 0.6, 2); ctx.globalAlpha = 1; }
      if (psc > 0) { ctx.globalAlpha = sc.done ? 1 : 0.35 + psc * 0.5; tile(PX.HOUSE, p.x + 2.4, p.y + 1.6, 1.5); ctx.globalAlpha = 1; }
      if (ph > 0) { ctx.globalAlpha = h.done ? 0.9 : 0.25 + ph * 0.4; ctx.strokeStyle = '#c9a36a'; ctx.lineWidth = Math.max(2, S * 0.18); ctx.beginPath(); ctx.arc(c.x, c.y, S * 1.9, 0, 7); ctx.stroke(); if (h.done) { ctx.fillStyle = 'rgba(201,163,106,0.2)'; ctx.fill(); } ctx.globalAlpha = 1; }
    }
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `${Math.max(10, Math.min(14 * devicePixelRatio, S * 0.45))}px system-ui`; ctx.textAlign = 'center';
    if (k !== 'camp') ctx.fillText(p.label, c.x, c.y + S * (k === 'field' ? 2.7 : k === 'forest' ? 2.6 : 1.9));
  }

  // animals: pets beside their people or at home, deer in the grass
  for (const an of state.animals || []) {
    const img = an.kind === 'cat' ? PX.CAT : an.kind === 'dog' ? PX.DOG : an.kind === 'hen' ? PX.HEN : an.kind === 'goat' ? PX.GOAT : an.kind === 'deer' ? PX.DEER : null;
    if (!img) continue;
    const c = toScreen(an.pos.x, an.pos.y);
    const bob = an.kind === 'deer' ? 0 : Math.sin(t * 3 + an.pos.x) * S * 0.03;
    PX.blit(ctx, img, c.x - S * 0.3, c.y - S * 0.2 + bob, S * (an.young ? 0.45 : an.kind === 'goat' || an.kind === 'deer' ? 0.7 : 0.6));
    if (an.name && S > 18) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `${Math.max(8, S * 0.3)}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(an.name, c.x, c.y + S * 0.75); }
  }
  // homes: houses, lit when someone is inside, dark for the dead
  const homeKey = (h) => `${h.x},${h.y}`;
  const seenHomes = new Set();
  for (const a of state.agents) {
    const key = homeKey(a.home); if (seenHomes.has(key)) continue; seenHomes.add(key);
    const anyAlive = state.agents.some(b => b.alive && homeKey(b.home) === key);
    const someoneIn = state.agents.some(b => b.alive && homeKey(b.home) === key && b.location === 'home');
    const ups = state.agents.filter(b => homeKey(b.home) === key).reduce((acc, b) => Object.assign(acc, b.upgrades || {}), {});
    if (ups.garden) tile(PX.GARDEN, a.home.x + 1.3, a.home.y + 0.3, 1.4);
    const camper = state.agents.some(b => b.alive && homeKey(b.home) === key && b.settlement === 'camp') || a.home.x > 40;
    if (camper) tile(anyAlive ? PX.TENT : PX.TENT_DARK, a.home.x, a.home.y, 1.7);
    else tile(anyAlive ? (ups.bighouse ? PX.BIGHOUSE : PX.HOUSE) : PX.HOUSE_DARK, a.home.x, a.home.y, ups.bighouse ? 2.1 : 1.7);
    if (someoneIn && dark > 0) { const c = toScreen(a.home.x, a.home.y); ctx.fillStyle = 'rgba(255,200,90,.7)'; ctx.fillRect(c.x - S * 0.55, c.y + S * 0.05, S * 0.2, S * 0.2); ctx.fillRect(c.x + S * 0.35, c.y + S * 0.05, S * 0.2, S * 0.2); }
    if (!anyAlive) { const c = toScreen(a.home.x, a.home.y); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c.x, c.y + S * 0.6); ctx.lineTo(c.x, c.y + S * 1.2); ctx.moveTo(c.x - S * 0.2, c.y + S * 0.75); ctx.lineTo(c.x + S * 0.2, c.y + S * 0.75); ctx.stroke(); }
  }

  // family lines: gold between partners, thin gold to children
  for (const a of state.agents) {
    if (!a.alive || !a.family) continue;
    const p1 = posOf(a), s1 = toScreen(p1.x, p1.y);
    if (a.family.partner && a.id < a.family.partner) { const o = state.agents.find(x => x.id === a.family.partner); if (o?.alive) { const p2 = posOf(o), s2 = toScreen(p2.x, p2.y); ctx.strokeStyle = `rgba(232,160,76,${0.2 + a.family.bondStrength * 0.5})`; ctx.lineWidth = 1.5 + a.family.bondStrength * 3; ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke(); } }
    for (const cid of a.family.children || []) { const o = state.agents.find(x => x.id === cid); if (o?.alive && o.family?.isChild) { const p2 = posOf(o), s2 = toScreen(p2.x, p2.y); ctx.strokeStyle = 'rgba(232,160,76,.25)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke(); ctx.setLineDash([]); } }
  }

  // relationship lines for the selected villager
  const sel = selected && state.agents.find(a => a.id === selected);
  if (sel && sel.alive) {
    for (const o2 of state.agents) {
      if (o2 === sel || !o2.alive) continue;
      const tr = sel.trust[o2.id]; if (tr === undefined || Math.abs(tr) < 0.12) continue;
      const p1 = posOf(sel), p2 = posOf(o2); const s1 = toScreen(p1.x, p1.y), s2 = toScreen(p2.x, p2.y);
      ctx.strokeStyle = tr > 0 ? `rgba(108,195,138,${0.25 + tr * 0.6})` : `rgba(217,100,91,${0.25 - tr * 0.6})`; ctx.lineWidth = 1 + Math.abs(tr) * 4;
      ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
    }
  }

  // villagers
  bookHits.length = 0;
  for (const a of state.agents) {
    if (!a.alive) continue;
    const p = posOf(a); const c = toScreen(p.x, p.y);
    const open = a.body.openness;
    // a soft ring of the body state under the feet, then the pixel figure
    ctx.fillStyle = haloColor(a.body); ctx.beginPath(); ctx.ellipse(c.x, c.y + S * 0.45, S * (0.35 + open * 0.3), S * (0.14 + open * 0.1), 0, 0, 7); ctx.fill();
    const look = PX.personLook(a);
    const moving = Math.hypot(a.pos.x - p.x, a.pos.y - p.y) > 0.05;
    const frame = moving ? Math.floor(t * 6) % 2 : 0;
    const child = !!a.family?.isChild;
    const ph = S * (child ? 0.7 + Math.min(0.4, a.age * 0.03) : a.age >= 80 ? 1.05 : 1.2);
    PX.blit(ctx, PX.person({ ...look, frame, child }), c.x - ph / 3, c.y + S * 0.45 - ph, ph * 8 / 12);
    if (a.id === selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, S * 0.5, 0, 7); ctx.stroke(); }
    if (a.brain === 'remote') { ctx.fillStyle = a.connected ? '#6cc38a' : '#8a94a6'; ctx.beginPath(); ctx.arc(c.x + S * 0.3, c.y - S * 0.3, S * 0.11, 0, 7); ctx.fill(); }
    if (a.transits.length) { ctx.fillStyle = '#e8a04c'; ctx.font = `${S * 0.5}px serif`; ctx.fillText('✦', c.x - S * 0.45, c.y - S * 0.35); }
    // Labels grow with zoom but stop at a readable size, so a close-up doesn't shout.
    const fs = Math.min(15 * devicePixelRatio, Math.max(10, S * 0.42));
    ctx.fillStyle = a.settlement === 'camp' ? '#ffd28a' : '#fff'; ctx.font = `${fs}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText(a.name, c.x, c.y + S * 0.95);
    // a small book beside the name: click it to read their diary
    const nw = ctx.measureText(a.name).width;
    ctx.font = `${fs * 0.9}px serif`; ctx.fillText('📖', c.x + nw / 2 + fs * 0.7, c.y + S * 0.95);
    bookHits.push({ id: a.id, x: c.x + nw / 2 + fs * 0.7, y: c.y + S * 0.95 - fs * 0.4, r: fs * 0.7 });
    // what they are doing, in a word or two under the name
    if (a.doing && cam.scale > 0.8) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `${fs * 0.8}px system-ui`; ctx.fillText(a.doing, c.x, c.y + S * 0.95 + fs * 0.95); }
    if (a.lastSaid && a.location !== 'home') {
      const said = a.lastSaid.length > 70 ? a.lastSaid.slice(0, 67) + '…' : a.lastSaid;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; const w = ctx.measureText(said).width + 10; ctx.fillRect(c.x - w / 2, c.y - S * 1.45, w, fs * 1.5); ctx.fillStyle = '#fff'; ctx.fillText(said, c.x, c.y - S * 1.45 + fs * 1.1);
    }
  }

  // weather
  if (cold > 0.3) { ctx.fillStyle = 'rgba(255,255,255,.85)'; for (const f of snow) { f.y += 0.0009 * f.s * (1 + cold); f.x += 0.0004 * cold; if (f.y > 1) f.y = 0; if (f.x > 1) f.x = 0; ctx.fillRect(f.x * W, f.y * H, 2 * f.s * devicePixelRatio, 2 * f.s * devicePixelRatio); } }
  if (dark) { ctx.fillStyle = `rgba(6,10,26,${dark})`; ctx.fillRect(0, 0, W, H); }
  // The card in effect: its face in the corner, a tint over the land, and what it is doing.
  drawCardOverlay();
  // a caption for whatever the camera followed to
  if (caption && performance.now() < caption.until) {
    const fs = 15 * devicePixelRatio; ctx.font = `${fs}px system-ui`; ctx.textAlign = 'center';
    const w = Math.min(W - 40, ctx.measureText(caption.text).width + 30);
    ctx.fillStyle = 'rgba(8,10,16,.8)'; ctx.fillRect(W / 2 - w / 2, H - fs * 3.2, w, fs * 2);
    ctx.fillStyle = '#e8a04c'; ctx.fillText(caption.text.length > 110 ? caption.text.slice(0, 107) + '…' : caption.text, W / 2, H - fs * 1.9);
  } else caption = null;
}
requestAnimationFrame(draw);

// Walking. A villager crosses to their new place at a human pace, arriving with time to spare
// before the next tick, instead of teleporting.
function posOf(a) {
  let d = display.get(a.id);
  if (!d) { d = { x: a.pos.x, y: a.pos.y }; display.set(a.id, d); }
  const dx = a.pos.x - d.x, dy = a.pos.y - d.y, dist = Math.hypot(dx, dy);
  if (dist < 0.02) { d.x = a.pos.x; d.y = a.pos.y; return d; }
  const tickMs = state?.weather?.tickMs || 20000;
  const framesToCross = Math.max(30, (tickMs * 0.55) / 16.7);   // tiles per frame so the whole map takes ~half a tick
  const step = Math.max(0.02, 40 / framesToCross);
  const k = Math.min(1, step / dist);
  d.x += dx * k; d.y += dy * k;
  return d;
}

// pointer: click selects, drag pans, wheel zooms
canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }; });
canvas.addEventListener('pointermove', (e) => { if (!dragging) return; const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y; if (Math.hypot(dx, dy) > 4) dragging.moved = true; cam.x = dragging.cx + dx * devicePixelRatio; cam.y = dragging.cy + dy * devicePixelRatio; });
const bookHits = [];   // clickable book icons drawn beside names this frame
canvas.addEventListener('pointerup', (e) => {
  if (dragging && !dragging.moved && state) {
    const r = canvas.getBoundingClientRect();
    const sx = (e.clientX - r.left) * devicePixelRatio, sy = (e.clientY - r.top) * devicePixelRatio;
    const book = bookHits.find(b => Math.hypot(b.x - sx, b.y - sy) < b.r);
    if (book) { dragging = null; location.href = `diaries.html?who=${book.id}`; return; }
    const p = fromScreen(sx, sy);
    let best = null, bd = 1.2;
    for (const a of state.agents) { if (!a.alive) continue; const d = display.get(a.id) || a.pos; const dist = Math.hypot(d.x - p.x, d.y - p.y); if (dist < bd) { bd = dist; best = a; } }
    if (!best) { const hit = placeAt(p); if (hit) { dragging = null; openPlace(hit); return; } }
    selected = best ? best.id : null; showTab('agent');
    if (observing && best && best.id !== observing) startObserving(best.id); else renderInspector();
  }
  dragging = null;
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); const f = e.deltaY < 0 ? 1.1 : 0.9; cam.scale = Math.max(0.5, Math.min(4, cam.scale * f)); }, { passive: false });
canvas.addEventListener('dblclick', (e) => {
  // Look closer at whoever or whatever is under the cursor, whether or not the first click selected them.
  if (!state) return;
  const r = canvas.getBoundingClientRect();
  const p = fromScreen((e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio);
  let best = null, bd = 1.4;
  for (const a of state.agents) { if (!a.alive) continue; const d = display.get(a.id) || a.pos; const dist = Math.hypot(d.x - p.x, d.y - p.y); if (dist < bd) { bd = dist; best = a; } }
  if (best) return openMoment(best.id);
  const hit = placeAt(p); if (hit) return openPlace(hit);
  if (selected) openMoment(selected);
});

// ---------- the watchers ----------
// Chat shared by everyone on the page, and the instruments.
let chatSeen = 0;
function appendChat(msg) {
  const el = $('chatLog');
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  const tools = godOk && msg.who ? ` <span class="muted" style="font-size:10px">[${esc(msg.who)}] <a href="#" data-mod="mute" data-who="${esc(msg.who)}" style="color:var(--dim)">mute</a> · <a href="#" data-mod="boot" data-who="${esc(msg.who)}" style="color:var(--dim)">boot</a> · <a href="#" data-mod="ban" data-who="${esc(msg.who)}" style="color:var(--bad)">ban</a> · <a href="#" data-mod="delchat" data-ts="${msg.ts}" style="color:var(--dim)">remove</a></span>` : '';
  el.insertAdjacentHTML('beforeend', `<div class="mem"><span class="muted">d${msg.day} · ${esc(msg.name)}:</span> ${esc(msg.text)}${tools}</div>`);
  if (atBottom) el.scrollTop = el.scrollHeight;
}
function renderWatchers(s) {
  // chat backlog once, then live appends
  if (s.chat && chatSeen === 0) { $('chatLog').innerHTML = ''; for (const m of s.chat) appendChat(m); chatSeen = s.chat.length; if (!s.chat.length) $('chatLog').innerHTML = '<div class="muted">Nobody has said anything yet.</div>'; }
  if (s.mod && godOk) $('modInfo').textContent = `· as Creator you can mute, boot, or ban from any line${s.mod.muted ? ` · ${s.mod.muted} muted` : ''}${s.mod.banned ? ` · ${s.mod.banned} banned` : ''}`;
  const r = s.readouts; if (!r) return;
  const fmt = (v) => v === Infinity || v === null ? '∞' : v;
  const verdict = [];
  if (r.seasons < 2) verdict.push('Too early to say. Give it a season or two.');
  else {
    verdict.push(r.careToHarm >= 3 ? `Care is outrunning harm ${fmt(r.careToHarm)} to 1.` : r.careToHarm >= 1 ? `Care and harm are close: ${fmt(r.careToHarm)} to 1.` : `Harm is outrunning care. ${r.harm} blows and thefts against ${r.care} acts of care.`);
    verdict.push(r.wounds === 0 ? 'No wounds have been written since measuring began.' : r.healedToWounded >= 1 ? `Wounds are healing faster than they form (${r.healed} healed, ${r.wounds} written).` : `Wounds are forming faster than they heal (${r.wounds} written, ${r.healed} healed).`);
    if (r.deaths) verdict.push(`${r.deaths} death${r.deaths === 1 ? '' : 's'}, ${r.griefResolved} grief${r.griefResolved === 1 ? '' : 's'} carried through to the other side.`);
    verdict.push(r.tightnessTrend < -0.02 ? 'Bodies are settling this season.' : r.tightnessTrend > 0.02 ? 'Bodies are tightening this season.' : 'Bodies are about where they were.');
    verdict.push(r.trustTrend > 0.01 ? 'Trust is rising.' : r.trustTrend < -0.01 ? 'Trust is falling.' : 'Trust is holding.');
    verdict.push(`${r.births} born, ${r.bonds} bonds made, ${r.leaves} left.`);
  }
  $('readouts').innerHTML = verdict.map(v => `<div class="mem">${esc(v)}</div>`).join('');
  const rows = s.stats || [];
  const cols = ['season', 'year', 'alive', 'minds', 'deaths', 'births', 'bonds', 'strikes', 'takes', 'comforts', 'shares', 'wounds', 'healed', 'grieved', 'prayers', 'godActs', 'tightness', 'trust', 'faith'];
  $('statsTable').innerHTML = `<tr>${cols.map(c => `<th style="text-align:left;padding:2px 6px;color:var(--dim);border-bottom:1px solid var(--line)">${c}</th>`).join('')}</tr>` +
    rows.slice().reverse().map(r => `<tr>${cols.map(c => `<td style="padding:2px 6px;border-bottom:1px dashed var(--line)">${r[c] == null ? '' : esc(String(r[c]))}</td>`).join('')}</tr>`).join('');
}
$('chatName').value = localStorage.getItem('playinggod.handle') || '';
$('chatName').onchange = () => localStorage.setItem('playinggod.handle', $('chatName').value.trim());
function sendChat() {
  const text = $('chatText').value.trim(); if (!text) return;
  const name = $('chatName').value.trim() || 'a watcher';
  localStorage.setItem('playinggod.handle', name);
  send({ type: 'chat', name, text }); $('chatText').value = '';
}
$('chatSend').onclick = sendChat;
// The Creator's door: mute, boot, ban, remove, from any line in the gallery.
$('chatLog').addEventListener('click', (e) => {
  const a = e.target.closest('[data-mod]'); if (!a) return; e.preventDefault();
  const op = a.dataset.mod;
  if (op === 'ban' && !confirm('Ban this watcher by token and address, and release their villagers?')) return;
  send({ type: 'god', op, who: a.dataset.who, ts: a.dataset.ts });
  if (op === 'delchat') a.closest('.mem')?.remove();
});
$('chatText').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });

// ---------- commune ----------
// Talk to someone who is yours. You are the voice they have always had; your model answers as them.
const communeThreads = new Map();
const communeBusy = new Set();
async function onCommuneView(m) {
  if (communeBusy.has(m.agentId)) return;
  communeBusy.add(m.agentId);
  communeThreads.set(m.agentId, m.thread || []);
  renderInspector(); renderBrainTab(); renderTalkBar();
  try {
    const v = m.view;
    const recent = (m.thread || []).slice(-8).map(t => `${t.from === 'self' ? 'The voice' : v.you.name}: "${t.text}"`).join('\n');
    const user = `You are ${v.you.name}, ${v.you.age} years old. ${v.you.chart}
${v.you.nature.join(' ')}
${v.you.selfSummary ? 'Who you have become: ' + v.you.selfSummary : ''}

${v.when} You are ${v.where}.
Your body: ${v.felt.join(' ')}
${v.near.length ? 'With you: ' + v.near.join('; ') + '.' : 'You are alone right now.'}
People you know: ${v.people.slice(0, 8).join('; ')}
What you remember most: ${v.memories.slice(0, 5).join(' ')}
${v.diary.length ? 'From your diary: ' + v.diary[v.diary.length - 1] : ''}
${m.since?.length ? 'Since the voice last spoke, this happened to you: ' + m.since.join(' ') : ''}

A quiet voice you have always had, underneath everything, speaks to you. It has spoken before:
${recent || '(this is the first time)'}

It says now: "${m.text}"

Answer the voice in your own words, and answer what it actually said or asked. If it asks what happened, tell it what happened to you, plainly. First person, one to five sentences, plain, the way a person who lives outdoors talks. You may agree, argue, ask it something, or refuse. You do not know what the voice is. Never mention being an AI. No JSON, no quotation marks around the whole answer.`;
    const raw = await Brain.callModel(cfgFor(m.agentId), 'You are a villager with a body, answering a voice inside you. Plain speech only.', user, { maxTokens: 300 });
    const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim().replace(/^["“]|["”]$/g, '').slice(0, 700);
    if (text) send({ type: 'communed', agentId: m.agentId, text });
    else log(`${v.you.name} had no answer for the voice.`);
  } catch (e) { log(`commune failed: ${e.message}`); toast(`${m.view?.you?.name || 'They'} could not answer: ${e.message}`, 'bad'); }
  finally { communeBusy.delete(m.agentId); renderBrainTab(); renderTalkBar(); }
}
function renderCommune(a, compact = false) {
  if (!a.alive) return a.guidance ? `<div class="muted">Guided: "${esc(a.guidance)}"</div>` : '';
  if (!owned.has(a.id)) {
    const canTake = a.claimable || (a.owned && godOk);
    const who = !a.owned ? 'No one is their higher self yet.' : a.connected ? 'Someone else is their higher self, and is here now.' : `Their higher self has been away ${a.ownerAway} day${a.ownerAway === 1 ? '' : 's'}. If that was you in another browser, the claim lives in that browser; claim them again here${godOk ? ' (as the Creator you can take anyone back)' : a.claimable ? '' : ` after a season (${state.yearDays / 4} days) away`}.`;
    return `<div class="muted" style="margin:6px 0">Only ${esc(a.name)}'s higher self can speak to them: the browser whose model runs them. ${who}${a.guidance ? ` They are guided: "${esc(a.guidance)}"` : ''}</div>
      ${canTake && a.alive ? `<div class="row" style="margin:4px 0 8px"><button class="act" data-adopt="${a.id}">Claim ${esc(a.name)} here</button></div>` : ''}`;
  }
  const thread = communeThreads.get(a.id) || [];
  const lines = thread.map(t => `<div class="mem" style="${t.from === 'self' ? 'color:var(--warm)' : ''}"><span class="muted">${t.from === 'self' ? 'you' : esc(a.name)} · d${t.day}</span><br>${esc(t.text)}</div>`).join('');
  return `<div data-communebox="${a.id}">${compact ? '' : '<h3>You are their higher self <span class="muted">· the voice they have always had. They answer as themselves.</span></h3>'}
    <div class="communeLog" style="max-height:240px;overflow:auto;background:#0a0d12;border-radius:6px;padding:6px 8px">${lines || '<div class="muted">Nothing said yet. They do not know what you are. Say something, and they will answer.</div>'}${communeBusy.has(a.id) ? '<div class="muted">…' + esc(a.name) + ' is thinking</div>' : ''}</div>
    <div class="row" style="margin-top:6px"><input data-commune="${a.id}" placeholder="say anything; ${esc(a.name)} will answer" maxlength="500" style="flex:1"><button class="act" data-communesend="${a.id}">Speak</button></div>
    <div class="row" style="margin-top:4px;flex-wrap:wrap;gap:4px"><button class="act" data-communeask="${a.id}" data-q="What has happened to you since we last spoke? How are you, really?">What happened since?</button><button class="act" data-communeask="${a.id}" data-q="What do you want most right now?">What do you want?</button><button class="act" data-communeask="${a.id}" data-q="Who do you trust, and who hurt you?">Who do you trust?</button><button class="act" data-communeguide="${a.id}">Make what I said their standing intention</button></div>
    <div class="muted" style="margin-top:4px">Standing intention${a.guidance ? `: "${esc(a.guidance)}" <button class="act" data-guideclear="${a.id}" style="padding:0 6px">clear</button>` : ': none. Speak, then press the button above and they carry it every day.'}</div></div>`;
}

// ---------- feedback ----------
// Every act answers on screen. Every hard moment for one of yours becomes a choice.
function toast(text, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 450); }, 6500);
}
const skyActs = [];
function addSkyAct(text) { skyActs.unshift({ day: state?.day, text }); if (skyActs.length > 12) skyActs.pop(); const el = $('skyActs'); if (el) el.innerHTML = skyActs.map(x => `<div class="mem"><span class="muted">d${x.day}</span> ${esc(x.text)}</div>`).join(''); }
let dilemmaQueue = [];
function showDilemma(m) {
  if (!owned.has(m.agentId)) return;
  if (!$('dilemma').hidden) { dilemmaQueue.push(m); return; }
  $('diName').textContent = m.name;
  $('diWhen').textContent = `Day ${m.day} · a hard moment for someone who is yours`;
  $('diText').textContent = m.text;
  $('diOptions').innerHTML = m.options.map((o, i) => `<button class="di-opt" data-i="${i}">${esc(o.label)}<small>${esc(o.hint || '')}</small></button>`).join('');
  for (const b of $('diOptions').querySelectorAll('.di-opt')) b.onclick = () => {
    const o = m.options[Number(b.dataset.i)];
    send({ type: 'action', agentId: m.agentId, action: o.action, thought: `Something in me chose: ${o.label.toLowerCase()}.` });
    send({ type: 'note', agentId: m.agentId, text: `(your higher self chose: ${o.label})` });
    toast(`${m.name} will ${o.label.toLowerCase()}. Watch what it costs.`, 'good');
    log(`you chose for ${m.name}: ${o.label}`);
    closeDilemma();
  };
  $('dilemma').hidden = false;
  toast(`${m.name}: a hard moment. Choose, or let them.`, 'bad');
}
function closeDilemma() { $('dilemma').hidden = true; if (dilemmaQueue.length) showDilemma(dilemmaQueue.shift()); }
$('diSkip').onclick = closeDilemma;
// A handle for debugging from the console: window.__pg.showDilemma({...})
window.__pg = { showDilemma, toast, openPlace, placeAt };

// ---------- the ticker ----------
// The bottom of the map reads out what is happening, one line every few seconds.
// ---------- the card in the space ----------
const SUIT = { pentacles: { col: '#e8d36a', tint: 'rgba(232,211,106,0.07)', word: 'the field and the coin' }, swords: { col: '#8fb8e6', tint: 'rgba(143,184,230,0.08)', word: 'what is said and what is true' }, wands: { col: '#ff8a3a', tint: 'rgba(255,138,58,0.07)', word: 'what is built and what burns' }, cups: { col: '#5b8fd9', tint: 'rgba(91,143,217,0.08)', word: 'the heart' }, major: { col: '#fff1a8', tint: 'rgba(255,241,168,0.06)', word: 'a great turn' } };
function sigil(g, suit, x, y, s, col) {
  g.save(); g.translate(x, y); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = Math.max(2, s * 0.08); g.lineJoin = 'round';
  if (suit === 'pentacles') { g.beginPath(); g.arc(0, 0, s * 0.42, 0, 7); g.stroke(); g.beginPath(); for (let i = 0; i < 5; i++) { const ang = -Math.PI / 2 + i * 4 * Math.PI / 5; g.lineTo(Math.cos(ang) * s * 0.34, Math.sin(ang) * s * 0.34); } g.closePath(); g.stroke(); }
  else if (suit === 'swords') { g.fillRect(-s * 0.06, -s * 0.48, s * 0.12, s * 0.7); g.beginPath(); g.moveTo(-s * 0.06, -s * 0.48); g.lineTo(0, -s * 0.6); g.lineTo(s * 0.06, -s * 0.48); g.fill(); g.fillRect(-s * 0.26, s * 0.2, s * 0.52, s * 0.08); g.fillRect(-s * 0.05, s * 0.28, s * 0.1, s * 0.22); }
  else if (suit === 'wands') { g.rotate(-0.5); g.fillRect(-s * 0.06, -s * 0.5, s * 0.12, s * 1); g.beginPath(); g.ellipse(s * 0.1, -s * 0.42, s * 0.16, s * 0.08, 0.6, 0, 7); g.fill(); g.beginPath(); g.ellipse(-s * 0.12, -s * 0.28, s * 0.14, s * 0.07, -0.6, 0, 7); g.fill(); }
  else if (suit === 'cups') { g.beginPath(); g.moveTo(-s * 0.36, -s * 0.3); g.lineTo(s * 0.36, -s * 0.3); g.lineTo(s * 0.22, s * 0.12); g.lineTo(-s * 0.22, s * 0.12); g.closePath(); g.fill(); g.fillRect(-s * 0.05, s * 0.12, s * 0.1, s * 0.2); g.fillRect(-s * 0.24, s * 0.3, s * 0.48, s * 0.07); }
  else { g.beginPath(); for (let i = 0; i < 16; i++) { const r = i % 2 ? s * 0.18 : s * 0.46; const ang = i * Math.PI / 8; g.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); } g.closePath(); g.fill(); }
  g.restore();
}
function wrapText(g, text, maxW) { const words = text.split(' '), lines = []; let cur = ''; for (const wd of words) { const tst = cur ? cur + ' ' + wd : wd; if (g.measureText(tst).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = tst; } if (cur) lines.push(cur); return lines; }
function drawCardOverlay() {
  const cd = state.card; if (!cd) return;
  const inEffect = state.day - cd.day <= 1;
  const su = SUIT[cd.suit] || SUIT.major;
  if (inEffect) { ctx.fillStyle = su.tint; ctx.fillRect(0, 0, W, H); }
  const dpr = devicePixelRatio, cw = 72 * dpr, chh = 112 * dpr, x = 14 * dpr, y = (narrLine ? 96 : 52) * dpr;
  ctx.save(); ctx.globalAlpha = inEffect ? 1 : 0.45;
  // the card face
  ctx.fillStyle = 'rgba(8,10,16,.6)'; ctx.fillRect(x - 6 * dpr, y - 6 * dpr, cw + 12 * dpr, chh + 12 * dpr);
  ctx.fillStyle = '#f1e7cf'; ctx.fillRect(x, y, cw, chh);
  ctx.strokeStyle = su.col; ctx.lineWidth = 3 * dpr; ctx.strokeRect(x + 4 * dpr, y + 4 * dpr, cw - 8 * dpr, chh - 8 * dpr);
  sigil(ctx, cd.suit === 'major' ? 'major' : cd.suit, x + cw / 2, y + chh * 0.42, cw * 0.8, cd.suit === 'major' ? '#b8860b' : (cd.suit === 'pentacles' ? '#b8860b' : cd.suit === 'swords' ? '#3a5f8a' : cd.suit === 'wands' ? '#b8501a' : '#2e5f9a'));
  ctx.fillStyle = '#2b2b2b'; ctx.font = `${9 * dpr}px Georgia, serif`; ctx.textAlign = 'center';
  const nm = wrapText(ctx, cd.name, cw - 10 * dpr); nm.slice(0, 2).forEach((l, i) => ctx.fillText(l, x + cw / 2, y + chh - (14 - i * 11) * dpr - (nm.length > 1 ? 4 * dpr : 0)));
  if (cd.suit !== 'major') { ctx.font = `${8 * dpr}px system-ui`; ctx.fillText(String(cd.rank), x + 8 * dpr, y + 12 * dpr); ctx.fillText(String(cd.rank), x + cw - 8 * dpr, y + chh - 6 * dpr); }
  // what it is doing to the space
  const tx = x + cw + 14 * dpr, maxW = Math.min(W * 0.42, 330 * dpr);
  ctx.textAlign = 'left'; ctx.font = `${10 * dpr}px system-ui`;
  const head = inEffect ? `IN EFFECT · ${cd.by === 'sky' ? 'the sky turned it' : 'the Creator turned it'} · day ${cd.day}` : `LAST CARD · day ${cd.day} · no card in effect`;
  const lines = [[head, su.col, `${10 * dpr}px system-ui`], [cd.name, '#f3ecd9', `bold ${15 * dpr}px Georgia, serif`], [cd.meaning, '#c9c2b0', `italic ${11 * dpr}px Georgia, serif`], ...wrapText(Object.assign(ctx, { font: `${12 * dpr}px Georgia, serif` }) && ctx, cd.text || '', maxW).slice(0, 4).map(l => [l, '#f3ecd9', `${12 * dpr}px Georgia, serif`])];
  const lh = 15 * dpr, bh = lines.length * lh + 12 * dpr;
  let bw = 0; for (const [l, , f] of lines) { ctx.font = f; bw = Math.max(bw, ctx.measureText(l).width); }
  ctx.fillStyle = 'rgba(8,10,16,.72)'; ctx.fillRect(tx - 8 * dpr, y - 6 * dpr, Math.min(maxW, bw) + 16 * dpr, bh);
  lines.forEach(([l, c, f], i) => { ctx.font = f; ctx.fillStyle = c; ctx.fillText(l, tx, y + 8 * dpr + i * lh); });
  ctx.restore();
}

// ---------- the narrator ----------
// A voice over the village: the one thing that matters most this moment, and why, as it happens.
// Shown over the map; spoken aloud if you turn it on. It never invents; it reads from the facts.
let narrateVoice = localStorage.getItem('playinggod.narrate') === '1';
const narrSeen = new Set(); let narrLine = null, narrUntil = 0, narrDay = -1;
const NARR_RANK = (e) => e.kind === 'death' ? 100 : /turns a card/.test(e.text) ? 95 : /buries/.test(e.text) ? 90 : /Raiders|lands\./.test(e.text) ? 88 : /is born to/.test(e.text) ? 85 : /are together now|leaves/.test(e.text) ? 70 : e.kind === 'strike' ? 65 : /ballot closes|is finished|takes on the/.test(e.text) ? 60 : e.kind === 'god' ? 58 : /Today is|names it/.test(e.text) ? 55 : e.kind === 'wound' || e.kind === 'healed' ? 50 : e.kind === 'season' ? 45 : /trader from|cart from/.test(e.text) ? 40 : e.kind === 'overwhelmed' ? 35 : 0;
function narrateTick() {
  if (!state || frozen) return;
  const fresh = (state.events || []).filter(e => { const k = `${e.day}-${e.tick}-${e.text}`; if (narrSeen.has(k)) return false; narrSeen.add(k); return e.day === state.day; });
  if (narrSeen.size > 800) narrSeen.clear();
  const best = fresh.map(e => ({ e, r: NARR_RANK(e) })).filter(x => x.r > 0).sort((x, y) => y.r - x.r)[0];
  let line = null;
  if (best) {
    line = best.e.text;
    // the reason behind it, when the panel knows one
    const why = (state.standing?.why || []);
    if (best.e.kind === 'death') { const w2 = why.find(l => /died of/.test(l) && l.startsWith(best.e.text.split(' ')[0])); if (w2) line += ' ' + w2; }
    else if (best.e.kind === 'strike') { const w2 = why.find(l => l.startsWith(best.e.text.split(' ')[0] + ' struck')); if (w2) line = w2; }
  } else if (state.tick === 5 && narrDay !== state.day && state.chronicle?.length && state.chronicle[state.chronicle.length - 1].day === state.day) {
    line = state.chronicle[state.chronicle.length - 1].text; narrDay = state.day;
  } else if (state.tick === 0 && narrDay !== state.day) {
    const why = (state.standing?.why || []).slice(0, 2).join(' ');
    line = `Day ${state.standing?.dayOfYear ?? state.day} of year ${state.year}, ${state.weather.season}, ${state.weather.sky}. ${why || 'Everyone is fed and warm. The day begins.'}`; narrDay = state.day;
  }
  if (line) { narrLine = line; narrUntil = performance.now() + Math.max(12000, Math.min(45000, line.length * 90)); $('narrator').innerHTML = `<span><span class="k">narrator</span>${esc(line)}</span>`; speak(line); }
  else if (narrLine && performance.now() > narrUntil) { narrLine = null; $('narrator').innerHTML = ''; }
}
function speak(text) {
  if (!narrateVoice || !('speechSynthesis' in window)) return;
  try { const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.pitch = 0.9; const vs = speechSynthesis.getVoices(); const v = vs.find(x => /en/i.test(x.lang) && /Natural|Neural|Google|Samantha|Daniel|Aria|Jenny/i.test(x.name)) || vs.find(x => /en/i.test(x.lang)); if (v) u.voice = v; speechSynthesis.speak(u); } catch {}
}
$('btnNarrate').textContent = `🗣 Narrator: ${narrateVoice ? 'on' : 'off'}`;
$('btnNarrate').onclick = () => { narrateVoice = !narrateVoice; localStorage.setItem('playinggod.narrate', narrateVoice ? '1' : '0'); $('btnNarrate').textContent = `🗣 Narrator: ${narrateVoice ? 'on' : 'off'}`; if (narrateVoice) speak(narrLine || 'I will tell you what happens, and why.'); else if ('speechSynthesis' in window) speechSynthesis.cancel(); };
setInterval(narrateTick, 1500);

let tickerLines = [], tickerI = 0;
setInterval(() => {
  const el = $('ticker');
  if (!tickerLines.length || frozen) { el.innerHTML = ''; return; }
  tickerI = (tickerI + 1) % tickerLines.length;
  el.innerHTML = `<span>${esc(tickerLines[tickerI])}</span>`;
}, 3500);

// ---------- sound ----------
// Wind that rises with the cold, fire when the hearth burns, a low note for a death, a small
// chord for a birth. Browsers need a click before any sound, hence the button.
let audio = null;
function startSound() {
  const A = new (window.AudioContext || window.webkitAudioContext)();
  const master = A.createGain(); master.gain.value = Number($('volume').value) / 100; master.connect(A.destination);
  // wind: filtered noise
  const buf = A.createBuffer(1, A.sampleRate * 2, A.sampleRate); const data = buf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = A.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const windF = A.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 400; windF.Q.value = 0.6;
  const windG = A.createGain(); windG.gain.value = 0; noise.connect(windF); windF.connect(windG); windG.connect(master); noise.start();
  // fire: crackly filtered noise
  const fire = A.createBufferSource(); fire.buffer = buf; fire.loop = true; fire.playbackRate.value = 0.7;
  const fireF = A.createBiquadFilter(); fireF.type = 'highpass'; fireF.frequency.value = 1800;
  const fireG = A.createGain(); fireG.gain.value = 0; fire.connect(fireF); fireF.connect(fireG); fireG.connect(master); fire.start();
  audio = { A, master, windG, windF, fireG, lastEventDay: state?.day ?? 0, seen: new Set() };
  $('btnSound').textContent = '🔊 Sound';
}
function stopSound() { if (audio) { audio.A.close(); audio = null; $('btnSound').textContent = '🔇 Sound'; } }
$('btnSound').onclick = () => audio ? stopSound() : startSound();
// Volume, remembered. Turning it up from zero also turns sound on.
try { $('volume').value = localStorage.getItem('playinggod.volume') ?? '60'; } catch {}
$('volume').addEventListener('input', () => {
  const v = Number($('volume').value) / 100;
  try { localStorage.setItem('playinggod.volume', $('volume').value); } catch {}
  if (!audio && v > 0) startSound();
  if (audio) audio.master.gain.setTargetAtTime(v, audio.A.currentTime, 0.05);
});
function tone(freq, dur, type = 'sine', gain = 0.25) {
  if (!audio) return;
  const o = audio.A.createOscillator(); const g = audio.A.createGain();
  o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0, audio.A.currentTime); g.gain.linearRampToValueAtTime(gain, audio.A.currentTime + 0.08); g.gain.exponentialRampToValueAtTime(0.001, audio.A.currentTime + dur);
  o.connect(g); g.connect(audio.master); o.start(); o.stop(audio.A.currentTime + dur + 0.05);
}
// Small sounds of a place: birdsong by day, crickets at night, the work people are doing.
let ambientI = 0;
function ambient() {
  if (!audio || !state) return;
  ambientI++;
  const night = state.tick >= 4 || state.tick === 0, winter = state.weather.season === 'winter';
  // birds: short high chirps, fewer in winter
  if (!night && Math.random() < (winter ? 0.08 : 0.35)) { const f = 1800 + Math.random() * 1400; tone(f, 0.12, 'sine', 0.05); setTimeout(() => tone(f * 1.15, 0.1, 'sine', 0.04), 90); }
  // crickets: a soft ticking at night in warm seasons
  if (night && !winter && Math.random() < 0.6) tone(4200, 0.05, 'square', 0.012);
  // work: chopping in the forest, digging at the quarry, and a murmur where people are talking
  const now = state.now || [];
  const chopping = now.filter(n => /cuts wood|forages at the forest/.test(n.text)).length;
  const digging = now.filter(n => /forages at the quarry|works on the/.test(n.text)).length;
  const talking = now.filter(n => n.kind === 'talk').length;
  if (chopping && Math.random() < 0.35) tone(140 + Math.random() * 40, 0.12, 'triangle', 0.09);
  if (digging && Math.random() < 0.3) tone(90 + Math.random() * 30, 0.15, 'square', 0.05);
  if (talking && Math.random() < 0.4) tone(220 + Math.random() * 120, 0.18, 'sine', 0.02);
}
setInterval(ambient, 450);

function soundTick() {
  if (!audio || !state) return;
  const cold = state.weather.cold, night = state.tick >= 4;
  audio.windG.gain.setTargetAtTime(0.02 + cold * 0.18 + (night ? 0.03 : 0), audio.A.currentTime, 0.5);
  audio.windF.frequency.setTargetAtTime(300 + cold * 500, audio.A.currentTime, 0.5);
  // fire is audible when you're looking near the hearth (zoomed) or the hearth burns and the map is calm
  const nearFire = cam.scale > 1.8 && selected && state.agents.find(a => a.id === selected)?.location === 'hearth';
  audio.fireG.gain.setTargetAtTime(state.hearth.wood > 0 ? (nearFire ? 0.12 : 0.02) : 0, audio.A.currentTime, 0.4);
  // one-shot notes for new events
  for (const e of state.events) {
    const key = `${e.day}-${e.tick}-${e.text}`;
    if (audio.seen.has(key)) continue; audio.seen.add(key);
    if (audio.seen.size > 500) audio.seen.clear();
    if (e.kind === 'death') { tone(110, 2.5, 'sine', 0.3); tone(82, 3, 'triangle', 0.15); }
    else if (/is born to/.test(e.text)) { tone(523, 0.6); tone(659, 0.8); tone(784, 1.2); }
    else if (e.kind === 'healed') { tone(440, 0.8); tone(660, 1.2, 'sine', 0.15); }
    else if (e.kind === 'strike') { tone(70, 0.25, 'square', 0.2); }
    else if (e.kind === 'god' && /omen|red|bird|frost|ring|wind stopped|star|smoke|turns a card/i.test(e.text)) { tone(880, 2.5, 'sine', 0.08); tone(1320, 2.5, 'sine', 0.05); }
  }
}
setInterval(soundTick, 500);

// ---------- follow the drama ----------
// The camera drifts to whoever is having the most eventful moment. Off by default.
let follow = false;
$('btnFollow').onclick = () => { follow = !follow; $('btnFollow').textContent = `Follow: ${follow ? 'on' : 'off'}`; if (!follow) camTarget = { scale: 1, x: 0, y: 0 }; };
const followSeen = new Set();
function followTick() {
  if (!follow || !state || frozen) return;
  const drama = [...state.events].reverse().find(e => ['death', 'strike', 'wound', 'overwhelmed', 'healed', 'rebuff'].includes(e.kind) || /is born|together now|keep the wake|leaves the village|destiny|omen/.test(e.text));
  if (!drama) return;
  const key = `${drama.day}-${drama.tick}-${drama.text}`;
  if (followSeen.has(key)) return; followSeen.add(key);
  const who = (drama.who || []).map(id => state.agents.find(a => a.id === id)).filter(a => a && a.alive)[0];
  if (!who) return;
  selected = who.id; renderInspector();
  const p = display.get(who.id) || who.pos; const r = canvas.getBoundingClientRect(); const scale = 1.9;
  camTarget = { scale, x: (r.width * devicePixelRatio) / 2 - (p.x + 1) * TILE * scale, y: (r.height * devicePixelRatio) / 2 - (p.y + 1) * TILE * scale };
  caption = { text: drama.text, until: performance.now() + 6000 };
}
setInterval(followTick, 1000);
let caption = null;

// ---------- observing: be someone's eyes ----------
// Click a villager, press Observe: the camera stays on them and their thoughts, doing, hearing and
// what happens to them stream into the panel as it happens. You only watch; they do not know.
let observing = null;
const eyesFeed = [];
function startObserving(id) {
  observing = id; selected = id; eyesFeed.length = 0;
  if (follow) { follow = false; $('btnFollow').textContent = 'Follow: off'; }
  if (frozen) closeMoment();
  send({ type: 'watch', agentId: id });
  showTab('agent'); renderInspector();
}
function stopObserving() {
  if (!observing) return;
  observing = null; send({ type: 'unwatch' }); camTarget = { scale: 1, x: 0, y: 0 }; caption = null; renderInspector();
}
function onEyes(m) {
  if (m.agentId !== observing) return;
  const key = `${m.day}-${m.tick}`;
  const last = eyesFeed[eyesFeed.length - 1];
  if (last && last.key === key) { Object.assign(last, m); } else { eyesFeed.push({ key, ...m }); if (eyesFeed.length > 24) eyesFeed.shift(); }
  caption = { text: `${m.name}${m.thought ? ` thinks: ${m.thought}` : m.doing ? `: ${m.doing}` : ''}`, until: performance.now() + 30000 };
  const panel = $('eyesPanel'); if (panel) panel.innerHTML = eyesHtml(); else renderInspector();
}
const depl = (v) => /ies$/.test(v) ? v.slice(0, -3) + 'y' : /(ss|sh|ch|x|o)es$/.test(v) ? v.slice(0, -2) : /s$/.test(v) ? v.slice(0, -1) : v;
function firstPerson(t, name) { const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return t.replace(new RegExp('^' + safe + ' (\\w+)'), (m, v) => 'You ' + depl(v)).replace(new RegExp('\\b' + safe + "'s\\b", 'g'), 'your'); }
function eyesHtml() {
  if (!eyesFeed.length) return '<div class="muted">Waiting for their next moment… (one every tick)</div>';
  const beats = [...eyesFeed].reverse();
  const k = (t) => `<span class="muted" style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;margin-right:6px">${t}</span>`;
  return beats.map((f, i) => {
    const now = i === 0;
    const L = [`<div class="muted" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase">Day ${f.day} · ${esc(f.tickName)}${now ? ' · now' : ''}</div>`];
    if (now) L.push(`<div>You are ${esc(f.where)}.${(f.near || []).length ? ' ' + f.near.map(esc).join(' ') : ' No one is with you.'}</div>`);
    if (f.thought) L.push(`<div style="color:#f0d9b0;font-style:italic;font-size:${now ? 15 : 13}px">${k('you think')}${esc(f.thought)}</div>`);
    if (f.doing) L.push(`<div style="color:var(--good)">${k('you do')}${esc(firstPerson(f.doing, f.name))}</div>`);
    if (f.said) L.push(`<div style="color:var(--warm)">${k('you say')}“${esc(f.said)}”</div>`);
    if ((f.heard || []).length) L.push(`<div style="color:var(--warm)">${k('you hear')}${f.heard.map(esc).join(' ')}</div>`);
    if ((f.happened || []).length) L.push(`<div style="color:#c8d6ee">${k('it happens')}${f.happened.map(esc).join(' ')}</div>`);
    if (now && (f.senses || []).length) L.push(`<div style="color:#b9a6d9">${k('you know')}${f.senses.map(esc).join(' ')}</div>`);
    if (now && (f.felt || []).length) L.push(`<div class="muted" style="font-size:12px">${k('body')}${f.felt.slice(0, 6).map(esc).join(' ')}</div>`);
    if (f.diary) L.push(`<div style="color:#f0d9b0;font-style:italic">${k('tonight you write')}${esc(f.diary)}</div>`);
    return `<div style="border-left:2px solid ${now ? 'var(--warm)' : 'var(--line)'};padding:4px 0 4px 10px;margin:0 0 10px;opacity:${now ? 1 : 0.7}">${L.join('')}</div>`;
  }).join('');
}

// ---------- the moment ----------
// Stop time for this viewer, slide the camera in, and show the whole of one person right now.
let camTarget = null;
// ---------- places ----------
// Click a house, the store, the hearth, a field: time stops and the scene opens on what is going on there.
function homeKeyOf(h) { return `${h.x},${h.y}`; }
function placeAt(p) {
  let best = null, bd = 1.3;
  for (const a of state.agents) { if (!a.alive) continue; const d = Math.hypot(a.home.x - p.x, a.home.y - p.y); if (d < bd) { bd = d; best = { kind: 'home', key: homeKeyOf(a.home), pos: a.home }; } }
  if (best) return best;
  bd = 1.8;
  for (const [k, pl] of Object.entries(state.places || {})) {
    if (k === 'camp' && !state.camp?.founded) continue;
    const d = Math.hypot(pl.x - p.x, pl.y - p.y); if (d < bd) { bd = d; best = { kind: 'place', key: k, pos: pl }; }
  }
  return best;
}
let placeOpen = null;
function openPlace(hit) {
  frozen = true; placeOpen = hit;
  $('sky').textContent += ' · TIME STOPPED FOR YOU';
  const scale = 2.6, r = canvas.getBoundingClientRect();
  camTarget = { scale, x: (r.width * devicePixelRatio) / 2 - (hit.pos.x + 1) * TILE * scale, y: (r.height * devicePixelRatio) * 0.32 - (hit.pos.y + 1) * TILE * scale };
  $('moment').hidden = false;
  renderPlace(hit);
}
function setMoHeads(doing, said, felt, near, carry) {
  const h = (id, text) => { const el = $(id).previousElementSibling; if (el && el.tagName === 'H3') el.textContent = text; };
  h('moDoing', doing); h('moSaid', said); h('moFelt', felt); h('moNear', near); h('moCarry', carry);
}
function personRow(o, extra = '') {
  return `<div class="mo-person" data-look="${o.id}" title="look at ${esc(o.name)}" style="cursor:pointer"><canvas width="76" height="76" data-face="${o.id}"></canvas><div><b>${esc(o.name)}</b> <span class="muted">${o.age} · ${esc(expressionOf(o))}${extra}</span>${o.doingText ? `<span class="muted">${esc(o.doingText)}</span>` : ''}${o.lastSaid ? `<span class="muted">"${esc(o.lastSaid)}"</span>` : ''}</div></div>`;
}
function wireFaces() {
  for (const c of $('moNear').querySelectorAll('canvas[data-face]')) { const o = state.agents.find(x => x.id === c.dataset.face); if (o) drawFace(c.getContext('2d'), 38, 38, 33, o); }
  for (const el of $('moNear').querySelectorAll('[data-look]')) el.onclick = () => { placeOpen = null; selected = el.dataset.look; const o = state.agents.find(x => x.id === selected); $('moFace').hidden = false; $('moDiary').hidden = false; $('moScene').hidden = true; setMoHeads('Doing', 'Just said', 'Feels', 'Here with them', 'Carrying'); renderMoment(o); renderInspector(); };
}
function renderPlace(hit) {
  const s = state; if (!s) return;
  const fc = $('moFace'); const g = fc.getContext('2d'); g.clearRect(0, 0, fc.width, fc.height); g.imageSmoothingEnabled = false;
  $('moDiary').hidden = true; fc.hidden = false; $('moScene').hidden = true;
  const alive = s.agents.filter(a => a.alive);
  const evHere = (pred) => (s.events || []).filter(pred).slice(-6).map(e => `<div class="mem"><span class="muted">d${e.day}</span> ${esc(e.text)}</div>`).join('') || '<div class="muted">Nothing lately.</div>';
  const inv = (obj) => describeInv(obj) || 'nothing';
  const sumInv = (people) => { const t = {}; for (const p of people) for (const [k, v] of Object.entries(p.inv || {})) if (v > 0) t[k] = (t[k] || 0) + v; return t; };
  if (hit.kind === 'home') {
    const residents = alive.filter(a => homeKeyOf(a.home) === hit.key);
    const inside = residents.filter(a => a.location === 'home');
    const ups = residents.reduce((acc, b) => Object.assign(acc, b.upgrades || {}), {});
    PX.blit(g, ups.bighouse ? PX.BIGHOUSE : PX.HOUSE, 10, 20, 140);
    const names = residents.map(r => r.name);
    $('moName').textContent = names.length ? `${names.slice(0, -1).join(', ')}${names.length > 1 ? ' and ' : ''}${names.slice(-1)}'s house` : 'An empty house';
    $('moMeta').textContent = `${ups.bighouse ? 'a big house' : 'a small house'}${ups.garden ? ' with a garden' : ''}${ups.fence ? ', fenced' : ''} · ${residents.length} live${residents.length === 1 ? 's' : ''} here`;
    $('moExpr').textContent = inside.length ? `${inside.map(i => i.name).join(' and ')} ${inside.length === 1 ? 'is' : 'are'} inside right now.` : 'Nobody home right now.';
    setMoHeads('Inside the house', 'Said under this roof', 'The household', 'Here now', 'What the house holds');
    $('moDoing').textContent = inside.length ? inside.map(i => i.doingText || `${i.name} is home.`).join(' ') : residents.map(r => `${r.name} is ${r.location === 'home' ? 'home' : 'out at ' + (s.places[r.location]?.label || r.location)}.`).join(' ');
    $('moSaid').textContent = residents.filter(r => r.lastSaid).map(r => `${r.name}: "${r.lastSaid}"`).join(' ') || 'Quiet.';
    $('moFelt').innerHTML = residents.map(r => `<div class="mem"><b>${esc(r.name)}</b> <span class="muted">${r.age} · ${r.stage}${r.family?.partner ? ' · with ' + esc(s.agents.find(x => x.id === r.family.partner)?.name || 'someone') : ''} · looks ${esc(r.visible)}</span></div>`).join('') || '<div class="muted">No one lives here any more.</div>';
    $('moNear').innerHTML = inside.length ? inside.map(o => personRow(o)).join('') : '<div class="muted">Empty. The fire is banked.</div>';
    $('moCarry').textContent = inv(sumInv(residents)) + (Object.keys(ups).length ? `. Built: ${Object.keys(ups).map(k => s.upgradeSpecs?.[k]?.label || k).join(', ')}.` : '');
    const visitors = alive.filter(a => residents.some(r => a.location === `visit:${r.id}`));
    $('moScene').hidden = false;
    const pets = (s.animals || []).filter(x => residents.some(r => r.id === x.owner));
    const works = (s.works || []).filter(x => x.kept === 'home' && residents.some(r => r.id === x.by));
    Interior.drawHouse($('moScene'), { residents, inside, visitors, ups, inv: sumInv(residents), lit: inside.length > 0 || s.tick >= 4, night: s.tick >= 4, pets, works });
  } else {
    const k = hit.key, pl = hit.pos, label = pl.label || k;
    const here = alive.filter(a => a.location === k);
    const sprite = k === 'hearth' ? (s.hearth.wood > 0 ? PX.fire(0) : PX.FIRE_OUT) : k === 'camp' ? (s.camp?.wood > 0 ? PX.fire(0) : PX.FIRE_OUT) : k === 'well' ? PX.WELL : k === 'field' ? PX.FIELD : k === 'forest' ? PX.PINE : k === 'road' ? PX.ROAD : k === 'meadow' ? PX.MEADOW : k === 'quarry' ? PX.ROCKS : k === 'creek' ? PX.WATER[0] : k === 'grove' ? PX.GROVE : k === 'claypit' ? PX.CLAY : k === 'store' ? PX.STORE : k === 'bank' ? PX.BANK : k === 'council' ? PX.MEETING : null;
    if (sprite) PX.blit(g, sprite, 10, 10, 140);
    $('moName').textContent = label.replace(/^the /, '').replace(/^\w/, c => c.toUpperCase());
    $('moExpr').textContent = here.length ? `${here.length} here right now.` : 'No one here right now.';
    const buildsHere = Object.entries(s.buildSpecs || {}).filter(([, spec]) => spec.at === k).map(([bk, spec]) => { const b = s.builds?.[bk]; if (b?.done) return `${spec.label || bk}: built`; const have = b?.have || {}; return `${spec.label || bk}: ${Object.entries(spec.cost || {}).map(([m, n]) => `${m} ${have[m] || 0}/${n}`).join(', ')}`; });
    if (k === 'store') {
      const st = s.store;
      $('moMeta').textContent = `the village shelf · ${st.coin} coin in the till · a tithe of the till goes to the council each night`;
      setMoHeads('On the shelf', 'The ledger', 'The tithe', 'Here now', 'The council\'s project');
      $('moDoing').innerHTML = Object.entries(st.prices || {}).map(([item, pr]) => `<div class="mem"><b>${esc(item)}</b> <span class="muted">${st.shelf?.[item] || 0} in stock · buy ${pr.buy} · sells for ${pr.sell}</span></div>`).join('');
      $('moSaid').innerHTML = (st.ledger || []).slice(-8).reverse().map(l => `<div class="mem"><span class="muted">d${l.day ?? ''}</span> ${esc(l.who || 'someone')} ${l.bought ? 'bought' : 'sold'} ${l.n} ${esc(l.bought || l.sold || '')} for ${l.coin} coin</div>`).join('') || '<div class="muted">No trade yet.</div>';
      $('moFelt').innerHTML = `<div class="muted">The store is a shelf now, not a bank. Loans and savings are at the bank; the council paid ${s.council?.income || 0} coin in tithe so far.</div>`;
      $('moCarry').textContent = st.project ? `The council is raising the ${s.buildSpecs?.[st.project]?.label || st.project}: a coin per material carried in.` : 'No project right now; see the meeting house.';
      $('moScene').hidden = false;
      const pb = st.project && s.builds?.[st.project]; const pspec = st.project && s.buildSpecs?.[st.project];
      Interior.drawStore($('moScene'), { store: st, here, project: st.project, projectProgress: pb && pspec ? Object.entries(pspec.cost || {}).map(([m, n]) => `${m} ${pb.have?.[m] || 0}/${n}`).join(' · ') : null });
    } else if (k === 'bank') {
      const bk = s.bank || { coin: 0, savings: [], loans: [], civic: {}, ledger: [] };
      const nameOf = (id) => s.agents.find(x => x.id === id)?.name || 'someone';
      $('moMeta').textContent = `${bk.coin} coin in the strongbox · ${bk.savingsTotal || 0} kept by ${bk.savings.length} ${bk.savings.length === 1 ? 'person' : 'people'} · ${bk.interestPaid || 0} paid in interest`;
      setMoHeads('Kept here', 'The book', 'Owed', 'Here now', 'The council');
      $('moDoing').innerHTML = bk.savings.length ? bk.savings.slice().sort((x, y) => y.n - x.n).map(r => `<div class="mem"><b>${esc(nameOf(r.id))}</b> <span class="muted">keeps ${r.n} coin</span></div>`).join('') : '<div class="muted">No one keeps coin here yet.</div>';
      $('moSaid').innerHTML = (bk.ledger || []).slice(-8).reverse().map(l => `<div class="mem"><span class="muted">d${l.day}</span> ${esc(l.who)} ${l.put != null ? `put in ${l.put}` : l.took != null ? `took out ${l.took}` : l.lent != null ? `borrowed ${l.lent}` : `paid back ${l.repaid}`}</div>`).join('') || '<div class="muted">Nothing in the book yet.</div>';
      $('moFelt').innerHTML = (bk.loans || []).length ? bk.loans.map(l => `<div class="mem">${esc(l.name || 'someone')} owes ${l.owed} coin <span class="muted">· since day ${l.since}${l.defaulted ? ' · not paying' : ''}</span></div>`).join('') : '<div class="muted">No one owes the bank.</div>';
      $('moCarry').textContent = bk.civic?.owed ? `The council owes the bank ${bk.civic.owed} coin (${bk.civic.lent} lent, ${bk.civic.repaid} paid back).` : `The council owes nothing${bk.civic?.lent ? ` (${bk.civic.lent} lent over time, all paid back)` : ''}.`;
      $('moScene').hidden = false;
      Interior.drawBank($('moScene'), { bank: bk, here, names: nameOf });
    } else if (k === 'council') {
      const cn = s.council || { project: null, ballot: null, coin: 0, built: [] };
      const nameOf = (id) => s.agents.find(x => x.id === id)?.name || 'someone';
      const lb = (key) => s.buildSpecs?.[key]?.label || key;
      $('moMeta').textContent = cn.ballot ? `a ballot is open until day ${cn.ballot.closes} · ${Object.keys(cn.ballot.votes || {}).length} hands so far` : cn.project ? `raising the ${lb(cn.project)} · ${cn.coin} coin to pay wages with` : `nothing on the board · ${cn.coin} coin in the chest`;
      setMoHeads('The vote', 'The project', 'Raised by the village', 'Here now', 'The chest');
      $('moDoing').innerHTML = cn.ballot ? cn.ballot.options.map(key => `<div class="mem"><b>the ${esc(lb(key))}</b> <span class="muted">${cn.ballot.tally?.[key] || 0} hand${(cn.ballot.tally?.[key] || 0) === 1 ? '' : 's'} · ${esc(s.buildSpecs?.[key]?.effect || '')}</span></div>`).join('') + `<div class="muted" style="margin-top:4px">${Object.entries(cn.ballot.votes || {}).map(([id, key]) => `${esc(nameOf(id))} → ${esc(lb(key))}`).join(' · ') || 'No hands yet.'}</div>` : cn.lastResult ? `<div class="muted">Last vote, day ${cn.lastResult.day}: ${cn.lastResult.winner ? `the ${esc(lb(cn.lastResult.winner))}, ${cn.lastResult.tally?.[cn.lastResult.winner]} of ${cn.lastResult.cast} hands` : 'no hands raised'}.</div>` : '<div class="muted">No vote has been held yet.</div>';
      $('moSaid').innerHTML = cn.project ? `<div class="mem"><b>the ${esc(lb(cn.project))}</b> <span class="muted">${esc(s.buildSpecs?.[cn.project]?.effect || '')}</span><br><span class="muted">${Object.entries(s.buildSpecs?.[cn.project]?.cost || {}).map(([m, n]) => `${m} ${Math.floor(s.builds?.[cn.project]?.have?.[m] || 0)}/${n}`).join(' · ')} · ${cn.wagesPaid} paid in wages</span></div>` : '<div class="muted">No project. A ballot opens when there is something to build.</div>';
      $('moFelt').innerHTML = (cn.built || []).length ? cn.built.slice().reverse().map(b => `<div class="mem">the <b>${esc(lb(b.key))}</b> <span class="muted">· day ${b.day} · ${b.wages} coin in wages</span></div>`).join('') : '<div class="muted">Nothing raised by vote yet.</div>';
      $('moCarry').textContent = `${cn.coin} coin in the chest · ${cn.income || 0} taken in tithe from the store · owes the bank ${s.bank?.civic?.owed || 0}${cn.votesCast ? ` · ${cn.votesCast} votes cast over time` : ''}.`;
      $('moScene').hidden = false;
      Interior.drawCouncil($('moScene'), { council: cn, here, names: nameOf, specs: s.buildSpecs });
    } else if (k === 'graves') {
      const gs = s.graves || [];
      $('moMeta').textContent = gs.length ? `${gs.length} buried here · the village walks out together the afternoon after a death` : 'no one is buried here yet';
      setMoHeads('The stones', 'Words said here', 'What it is for', 'Here now', 'Gone');
      $('moDoing').innerHTML = gs.length ? gs.slice().reverse().slice(0, 12).map(g => `<div class="mem"><b>${esc(g.name)}</b> <span class="muted">· ${g.age ?? '?'} · ${esc(g.cause || '')} · day ${g.day} · ${g.mourners} stood here</span></div>`).join('') : '<div class="muted">No stones yet.</div>';
      $('moSaid').innerHTML = gs.length ? gs.slice().reverse().slice(0, 4).map(g => `<div class="mem"><span class="muted">${esc(g.by)}, over ${esc(g.name)}:</span> "${esc(g.words)}"</div>`).join('') : '<div class="muted">Nothing said yet.</div>';
      $('moFelt').innerHTML = '<div class="muted">Closure is something people do. Everyone who stands here grieves half as long, the ones who believe find the dead somewhere better, and everyone is reminded that time is short and to hold what they have. Grudges thin to nothing over about five years; old wounds no one reopens wear down to scars.</div>';
      $('moNear').innerHTML = here.length ? here.map(o => personRow(o)).join('') : '<div class="muted">No one here right now.</div>';
      $('moCarry').textContent = (s.dead || s.agents.filter(x => !x.alive)).map(x => x.name).join(', ') || 'no one';
    } else if (k === 'rival') {
      const rv = s.rival || {};
      $('moName').textContent = (rv.name || 'the far fire').replace(/^the /, '').replace(/^\w/, ch => ch.toUpperCase());
      $('moMeta').textContent = `${rv.people ?? '?'} people under ${rv.leader || 'someone'} · ${rv.mood || 'unknown'} toward the village · ${rv.food ?? '?'} food by their fire`;
      $('moExpr').textContent = rv.trader?.day === s.day ? `${rv.leader} is at the edge today, trading.` : rv.mood === 'hostile' || rv.mood === 'cold' ? 'Doors are barred on both sides.' : 'Their fire is lit. No one from the village goes there.';
      setMoHeads('What they are', 'What has passed between the fires', 'Raids', 'Here now', 'The sky\'s hand');
      $('moDoing').innerHTML = `<div class="mem">Another people, out where the map ran out. They hunt the same deer. When they are warm toward the village their trader comes to the edge with fish, clay and stone and leaves with food. When they are cold and hungry they come in the night. Villagers can carry food out to the edge for them; dogs, axes at the hearth and the hall hold them off.</div>`;
      $('moSaid').innerHTML = (rv.log || []).slice().reverse().map(l => `<div class="mem"><span class="muted">d${l.day}</span> ${esc(l.text)}</div>`).join('') || '<div class="muted">Nothing yet.</div>';
      $('moFelt').innerHTML = (rv.raids || []).length ? rv.raids.slice().reverse().map(r => `<div class="mem"><span class="muted">d${r.day}</span> ${r.repelled ? '<span style="color:var(--good)">driven off</span>' : `<span style="color:var(--bad)">took ${r.food} food, ${r.wood} wood, ${r.coin} coin</span>`}</div>`).join('') : '<div class="muted">They have never raided.</div>';
      $('moNear').innerHTML = '<div class="muted">No villager has stood at their fire.</div>';
      $('moCarry').textContent = `${rv.trades || 0} trades · ${rv.sent || 0} food left at the edge for them · the sky can stand a star over both fires (Weather tab).`;
    } else if (k === 'hearth' || k === 'camp') {
      const fire = k === 'hearth' ? s.hearth : s.camp;
      $('moMeta').textContent = `${fire.wood > 0 ? 'the fire is lit' : 'the fire is OUT'} · ${fire.wood || 0} wood on the pile`;
      setMoHeads('The fire', 'Said around the fire', 'Lately here', 'Here now', k === 'camp' ? 'Who lives at the camp' : 'Built here');
      $('moDoing').textContent = fire.wood > 0 ? `Warm. ${fire.wood} wood left; it burns a little every tick and someone has to feed it.` : 'Cold ashes. Someone needs to bring wood or the night will hurt.';
      $('moSaid').textContent = here.filter(h => h.lastSaid).map(h => `${h.name}: "${h.lastSaid}"`).join(' ') || 'Quiet.';
      $('moFelt').innerHTML = evHere(e => new RegExp(label, 'i').test(e.text) || (e.who || []).some(id => here.some(h => h.id === id)));
      $('moCarry').textContent = k === 'camp' ? (alive.filter(a => a.settlement === 'camp').map(a => a.name).join(', ') || 'no one') : (buildsHere.join('; ') || 'Nothing built here yet.');
    } else {
      const gives = s.forage?.[k];
      $('moMeta').textContent = gives ? `gives ${Object.entries(gives).map(([m, n]) => `${m} (${n})`).join(', ')} to whoever forages` : k === 'field' ? 'the village grain: work here fills the larder' : k === 'road' ? (s.builds?.road?.done ? 'the road is built; the market cart comes this way' : 'a dirt track; build the road and a market cart will come') : k === 'well' ? 'water, and the place people cross paths' : k === 'edge' ? 'where scouts walk out into the unknown' : '';
      setMoHeads('Going on', 'Said here', 'Lately here', 'Here now', 'Built here');
      $('moDoing').textContent = here.length ? here.map(h => h.doingText || `${h.name} is here.`).join(' ') : 'Nothing. Wind, mostly.';
      $('moSaid').textContent = here.filter(h => h.lastSaid).map(h => `${h.name}: "${h.lastSaid}"`).join(' ') || 'Quiet.';
      $('moFelt').innerHTML = evHere(e => new RegExp(label, 'i').test(e.text) || (e.who || []).some(id => here.some(h => h.id === id)));
      $('moCarry').textContent = buildsHere.join('; ') || 'Nothing built here.';
    }
    $('moNear').innerHTML = here.length ? here.map(o => personRow(o)).join('') : '<div class="muted">No one.</div>';
  }
  $('moWhen').textContent = `Year ${s.year}, day ${s.day}, ${s.tickName}. ${s.weather.season}, ${s.weather.sky}.`;
  wireFaces();
}

function openMoment(id) {
  placeOpen = null; $('moFace').hidden = false; $('moDiary').hidden = false; $('moScene').hidden = true; setMoHeads('Doing', 'Just said', 'Feels', 'Here with them', 'Carrying');
  const a = state?.agents.find(x => x.id === id);
  if (!a || !a.alive) return;
  frozen = true; selected = id;
  $('sky').textContent += ' · TIME STOPPED FOR YOU';
  const p = display.get(a.id) || a.pos;
  const scale = 2.6;
  const r = canvas.getBoundingClientRect();
  camTarget = { scale, x: (r.width * devicePixelRatio) / 2 - (p.x + 1) * TILE * scale, y: (r.height * devicePixelRatio) * 0.32 - (p.y + 1) * TILE * scale };
  $('moment').hidden = false;
  renderMoment(a);
}
async function closeMoment() {
  frozen = false; placeOpen = null; $('moment').hidden = true; camTarget = { scale: 1, x: 0, y: 0 };
  if (heldState) { state = heldState; heldState = null; renderPanels(); }
  // Catch up right now rather than waiting for the next tick to arrive.
  try { const r = await fetch('/api/state'); if (r.ok && !frozen) { state = await r.json(); renderPanels(); } } catch {}
}
$('moClose').onclick = closeMoment;
// See everything again: close any moment, pull the camera back, and refit the map to the pane.
function wholeVillage() {
  if (frozen) closeMoment();
  camTarget = { scale: 1, x: 0, y: 0 };
  resize();
}
$('btnWhole').onclick = wholeVillage;
$('btnBeyond').onclick = () => { showAll = !showAll; $('btnBeyond').textContent = showAll ? '⌂ known land' : '🧭 beyond the pale'; $('btnBeyond').title = showAll ? 'fit the view to the land people know' : 'see the whole land, walked or not'; wholeVillage(); };
// Hide or show the side panel so the map can have the whole screen.
$('btnPanel').onclick = () => { document.body.classList.toggle('mapOnly'); requestAnimationFrame(() => { resize(); camTarget = { scale: 1, x: 0, y: 0 }; }); };
// Clicking the dark outside the card also lets time move again.
$('moment').addEventListener('click', (e) => { if (e.target === $('moment')) closeMoment(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') wholeVillage(); });

function renderMoment(a) {
  const s = state;
  const fc = $('moFace'); const g = fc.getContext('2d'); g.clearRect(0, 0, fc.width, fc.height);
  drawFace(g, 80, 80, 70, a);
  $('moName').textContent = a.name;
  $('moDiary').href = `diaries.html?who=${a.id}`;
  $('moMeta').textContent = `${a.age} · ${a.stage} · ${a.branch} · ${a.location === 'home' ? 'at home' : a.location.startsWith('visit') ? 'at someone\'s door' : 'at ' + (s.places[a.location]?.label || a.location)}`;
  $('moExpr').textContent = expressionOf(a);
  $('moWhen').textContent = `Year ${s.year}, day ${s.day}, ${s.tickName}. ${s.weather.season}, ${s.weather.sky}.`;
  $('moDoing').textContent = (a.doingText ? a.doingText + ' ' : '') + (a.thought ? `Thinking: ${a.thought}` : '');
  $('moSaid').textContent = a.lastSaid ? `"${a.lastSaid}"` : 'Nothing yet today.';
  $('moFelt').innerHTML = (a.felt || []).map(f => `<div class="mem">${esc(f)}</div>`).join('') || '<div class="muted">Their body is quiet.</div>';
  $('moCarry').textContent = describeInv(a.inv) + (a.wants ? (a.inv[a.wants] > 0 ? `. Has the ${a.wants} they wanted.` : `. Longs for a ${a.wants}.`) : '');
  const near = (a.near || []).map(id => s.agents.find(x => x.id === id)).filter(Boolean);
  $('moNear').innerHTML = near.length ? near.map(o => {
    const t = a.trust[o.id];
    const feel = t === undefined ? 'a stranger' : t > 0.5 ? 'someone they trust' : t > 0.15 ? 'someone they like' : t < -0.3 ? 'someone they fear' : t < -0.1 ? 'someone they\'re wary of' : 'barely known';
    return `<div class="mo-person" data-look="${o.id}" title="look at ${esc(o.name)}" style="cursor:pointer"><canvas width="76" height="76" data-face="${o.id}"></canvas><div><b>${esc(o.name)}</b> <span class="muted">${o.age} · ${esc(expressionOf(o))} · ${feel}</span>${o.lastSaid ? `<span class="muted">"${esc(o.lastSaid)}"</span>` : ''}${o.thought ? `<span class="muted">thinking: ${esc(o.thought)}</span>` : ''}</div></div>`;
  }).join('') : '<div class="muted">No one. They are alone right now.</div>';
  for (const c of $('moNear').querySelectorAll('canvas[data-face]')) { const o = s.agents.find(x => x.id === c.dataset.face); const g2 = c.getContext('2d'); drawFace(g2, 38, 38, 33, o); }
  for (const el of $('moNear').querySelectorAll('[data-look]')) el.onclick = () => { selected = el.dataset.look; const o = s.agents.find(x => x.id === selected); renderMoment(o); renderInspector(); };
}

// ---------- panels ----------
for (const b of document.querySelectorAll('nav button')) b.onclick = () => showTab(b.dataset.tab);
function showTab(name) {
  for (const b of document.querySelectorAll('nav button')) b.classList.toggle('on', b.dataset.tab === name);
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.id === 'tab-' + name);
}

function renderPanels() {
  const s = state; if (!s) return;
  $('sky').textContent = `Year ${s.year} · day ${s.day} · ${s.weather.season} · ${s.tickName}${s.paused ? ' · PAUSED' : ''}`;
  const alive = s.agents.filter(a => a.alive);
  const branches = alive.reduce((m, a) => (m[a.branch] = (m[a.branch] || 0) + 1, m), {});
  const builds = Object.entries(s.buildSpecs || {}).map(([k, spec]) => {
    const b = s.builds?.[k];
    if (b?.done) return `<b style="color:var(--good)">${k} built</b>`;
    const have = Object.entries(spec.cost).map(([m, n]) => `${Math.floor(b?.have?.[m] || 0)}/${n} ${m}`).join(', ');
    return `${k}: ${have}`;
  }).join(' · ');
  const lessons = (s.lessons || []).map(l => `<div style="color:var(--bad);margin-top:4px">The village remembers: ${esc(l.text)}</div>`).join('');
  const couples = alive.filter(a => a.family?.partner && a.id < a.family.partner).length;
  const kids = alive.filter(a => a.family?.isChild).length;
  const expecting = (s.due || []).length;
  const campers = alive.filter(a => a.settlement === 'camp').length;
  const found = Object.keys(s.found || {});
  const shelf = s.store ? Object.entries(s.store.shelf).filter(([, n]) => n >= 1).map(([k, n]) => `${k} ${Math.floor(n)}`).join(', ') : '';
  const loans = (s.bank?.loans || []).filter(l => l.owed > 0);
  const lb = (key) => s.buildSpecs?.[key]?.label || key;
  const bt = s.council?.ballot;
  const st = s.store ? `<br>Store: ${shelf || 'empty'} · ${s.store.coin} coin in the till` : '';
  const bk = s.bank ? `<br>Bank: ${s.bank.coin} in the strongbox · ${s.bank.savingsTotal || 0} kept by ${s.bank.savings.length}${loans.length ? ` · owed: ${loans.map(l => `${esc(l.name)} ${l.owed}${l.defaulted ? ' (not paying)' : ''}`).join(', ')}` : ''}${s.bank.civic?.owed ? ` · the council owes ${s.bank.civic.owed}` : ''}` : '';
  const cn = s.council ? `<br>Council: ${bt ? `<b style="color:var(--warm)">a vote is open</b> until day ${bt.closes}: ${bt.options.map(key => `${esc(lb(key))} ${bt.tally?.[key] || 0}`).join(' · ')}` : s.council.project ? `<b style="color:var(--warm)">raising the ${esc(lb(s.council.project))}</b> · ${s.council.coin} coin for wages · ${s.council.wagesPaid} paid` : `nothing on the board · ${s.council.coin} coin in the chest`}${(s.council.built || []).length ? ` · raised by vote: ${s.council.built.map(b => esc(lb(b.key))).join(', ')}` : ''}` : '';
  const arts = (s.works || []).length ? `<br>Works of the village: ${s.works.length}${(s.arts || []).length ? ` · arts of its own: ${s.arts.map(x => `<b style="color:var(--warm)">${esc(x.name)}</b> <span class="muted">(${esc(x.byName)})</span>`).join(', ')}` : ''} · latest: ${s.works.slice(-3).reverse().map(x => `${esc(x.byName)}, "${esc(x.title)}"`).join(' · ')}` : '';
  const hol = (s.holidays || []).length ? `<br>Days the village keeps: ${s.holidays.map(h => `<b style="color:var(--warm)">${esc(h.name)}</b> <span class="muted">(${esc(h.byName)}, year ${h.year}, kept ${h.kept}×)</span>`).join(' · ')}` : '';
  const today = s.holidayToday ? `<br><b style="color:var(--warm)">Today is ${esc(s.holidayToday.name)}.</b> ${esc(s.holidayToday.decorate)} Song: "${esc(s.holidayToday.song)}"` : '';
  const sick = s.sick ? `<br><span style="color:var(--bad)">${s.sick} sick</span>: ${s.agents.filter(a => a.alive && a.ill).map(a => esc(a.name) + ' (' + a.ill.kind + ')').join(', ')}` : '';
  const frontier = `${st}${bk}${cn}${today}${hol}${arts}${sick}<br>Known land: ${found.length ? found.join(', ') : 'only what you see'} · ${Math.round((s.mapped || 0) * 100)}% of the land walked${s.frontierLeft ? ` · ${s.frontierLeft} place${s.frontierLeft === 1 ? '' : 's'} still out in the pale` : ' · every place is found'}`;
  const fam = `<br>${couples} couple${couples === 1 ? '' : 's'} · ${kids} child${kids === 1 ? '' : 'ren'}${expecting ? ` · ${expecting} expecting` : ''}${s.camp?.founded ? `<br><b style="color:var(--warm)">${esc(s.camp.name)}</b>, past the edge: ${campers} people, fire wood ${s.camp.wood}` : ''}`;
  const ended = s.ended ? `<div class="mem" style="border:1px solid var(--bad);padding:8px;margin-bottom:8px"><b style="color:var(--bad)">The book is closed.</b> Day ${s.ended.day}: ${esc(s.ended.why)}. ${s.ended.alive} were left, and none had the heart to go on. <a href="story.html" style="color:var(--warm)">Read it as a book →</a>${godOk ? ` <button class="act warn" id="btnAgain" style="margin-left:6px">Begin again</button>` : ''}</div>` : '';
  const coming = s.threat && !s.threat.landed && s.threat.known ? `<br><b style="color:var(--warm)">Everyone says ${esc(s.threat.name)} is coming</b> in ${s.threat.daysLeft} day${s.threat.daysLeft === 1 ? '' : 's'}.` : s.threat?.landed && s.day - s.threat.landed <= 3 ? `<br><b style="color:var(--bad)">${esc(s.threat.name[0].toUpperCase() + s.threat.name.slice(1))} has landed.</b> ${esc(s.threat.text || '')}` : '';
  const rivalLine = s.rival?.seen ? `<br><b style="color:${s.rival.mood === 'hostile' || s.rival.mood === 'cold' ? 'var(--bad)' : 'var(--warm)'}">${esc(s.rival.name[0].toUpperCase() + s.rival.name.slice(1))}</b>, past the pale: ${s.rival.people} people, ${esc(s.rival.mood)} toward the village${s.rival.trader?.day === s.day ? ' · their trader is at the edge' : ''}` : '';
  const cardLine = s.card && s.day - s.card.day <= 1 ? `<br><b style="color:var(--warm)">The sky turned ${esc(s.card.name)}.</b> ${esc(s.card.text)}` : '';
  $('villageSummary').innerHTML = ended + `${alive.length} alive · ${s.weather.sky} · hearth wood ${s.hearth.wood}${coming}${cardLine}${rivalLine}<br>` +
    Object.entries(branches).map(([k, v]) => `${v} ${k}`).join(' · ') + fam + frontier + `<br>${builds}${lessons}`;
  const again = $('btnAgain'); if (again) again.onclick = () => $('btnReset').click();
  $('events').innerHTML = [...s.events].reverse().map(e => `<div class="ev ${e.kind}"><span class="t">d${e.day} ${['dawn', 'morn', 'mid', 'aft', 'eve', 'night'][e.tick]}</span>${esc(e.text)}</div>`).join('');
  // Right now: what every living person is doing this moment, the interesting ones first.
  const order = { hurt: 0, care: 1, talk: 2, work: 3, doing: 4, quiet: 5 };
  const now = [...(s.now || [])].sort((x, y) => (order[x.kind] ?? 4) - (order[y.kind] ?? 4));
  $('now').innerHTML = now.length ? now.map(n => `<div class="now-line ${n.kind}" data-look2="${n.id}" style="cursor:pointer">${esc(n.text)}</div>`).join('') : (s.tickName === 'night' ? 'Everyone is asleep.' : '');
  for (const el of $('now').querySelectorAll('[data-look2]')) el.onclick = () => { selected = el.dataset.look2; showTab('agent'); renderInspector(); };
  tickerLines = now.filter(n => n.kind !== 'quiet').map(n => n.text);
  // Where things stand today: faces with reasons.
  const st0 = s.standing;
  if (st0) {
    $('standingWhen').textContent = `· day ${st0.dayOfYear} of year ${st0.year}, ${st0.season}`;
    const lines = [];
    for (const r of (st0.recentDead || [])) lines.push(`<div><b style="color:var(--bad)">${esc(r.name)}</b> died on day ${r.day}, aged ${r.age ?? '?'}, of ${esc(r.cause || '')}${r.buried ? ' · buried at the stones' : (st0.funeralsDue || []).includes(r.name) ? ' · the funeral is tomorrow afternoon' : ''}.</div>`);
    for (const l of (st0.why || [])) if (!/was \d+.*died of/.test(l)) lines.push(`<div>${esc(l)}</div>`);
    if (st0.council) lines.push(`<div>The council: ${esc(st0.council)}.</div>`);
    if (st0.card) lines.push(`<div>The sky turned ${esc(st0.card)}</div>`);
    if (st0.rival) lines.push(`<div>${esc(st0.rival[0].toUpperCase() + st0.rival.slice(1))} toward the village.</div>`);
    const standHtml = lines.length ? lines.join('') : 'Everyone is fed, warm and whole tonight. Nothing hangs over the village.';
    if ($('standing').innerHTML !== standHtml) $('standing').innerHTML = standHtml;
  }
  // The long history, condensed: why the village keeps what it keeps.
  const hs = s.history;
  if (hs) {
    const H = [];
    if (hs.holidays.length) H.push(`<div><b>Days the village keeps</b>: ${hs.holidays.map(x => `${esc(x.name)} <span class="muted">(${esc(x.by)}, year ${x.year}, for ${esc(x.why || 'a reason no one wrote down')}; kept ${x.kept}×)</span>`).join(' · ')}</div>`);
    if (hs.raised.length || hs.builds.length) H.push(`<div><b>Raised</b>: ${hs.builds.map(x => `${esc(x.what)}${x.day != null ? ` <span class="muted">day ${x.day}</span>` : ''}`).join(' · ')}${hs.raised.length ? ` · <span class="muted">by vote: ${hs.raised.map(x => esc(x.what)).join(', ')}</span>` : ''}</div>`);
    if (hs.answered.length) H.push(`<div><b>Questions answered</b>: ${hs.answered.map(x => `${esc(x.what)} <span class="muted">(year ${x.year})</span>`).join(' · ')}</div>`);
    if (hs.destinies.length) H.push(`<div><b>Destinies come to pass</b>: ${hs.destinies.map(x => `${esc(x.name)}: "${esc(x.text)}" <span class="muted">day ${x.day}</span>`).join(' · ')}</div>`);
    if (hs.arts.length) H.push(`<div><b>Arts of the village's own</b>: ${hs.arts.map(x => `${esc(x.name)} <span class="muted">(${esc(x.by)})</span>`).join(' · ')}</div>`);
    if (hs.threats.length) H.push(`<div><b>What came out of the pale</b>: ${hs.threats.map(x => `${esc(x.name)} <span class="muted">(year ${x.year}, met ${x.ready ? 'ready' : 'unready'})</span>`).join(' · ')}</div>`);
    if (hs.founded) H.push(`<div><b>${esc(hs.founded.name)}</b> was founded past the edge on day ${hs.founded.day}.</div>`);
    if (hs.deadByYear.length) H.push(`<div><b>Gone</b>: ${hs.deadByYear.map(y => `year ${y.year}: ${y.names.map(esc).join(', ')}`).join(' · ')}</div>`);
    if (hs.chapters.length) H.push(`<div><b>Chapters</b>: ${hs.chapters.slice(-12).map(c => esc(c.title)).join(' · ')}</div>`);
    const histHtml = H.join('') || 'Nothing yet worth the keeping.';
    if ($('history').innerHTML !== histHtml) $('history').innerHTML = histHtml;
  }
  // The chronicle: the last few nights in the village's voice.
  const ch = (s.chronicle || []).slice(-4).reverse();
  $('chronicle').innerHTML = ch.length ? ch.map(c => `<div class="mem" style="font-style:italic;color:var(--ink)"><span class="muted">Day ${c.day} · ${c.alive} alive</span><br>${esc(c.text)}</div>`).join('') : 'Nothing written yet. The village writes at night.';
  // Questions the village can answer.
  const goals = s.goals || [];
  $('goalsNum').textContent = `· ${goals.filter(g => g.done != null).length} of ${goals.length}`;
  $('goals').innerHTML = goals.map(g => `<div class="mem" style="${g.done != null ? 'color:var(--good)' : 'color:var(--dim)'}">${g.done != null ? '✓' : '·'} ${esc(g.label)}${g.done != null ? ` <span class="muted">day ${g.done}</span>` : ''}</div>`).join('');
  renderInspector();
  renderWeather();
  renderBrainTab();
  renderWatchers(s);
}

function dial(label, v, cls = '') { return `<div class="dial"><span>${label}</span><div class="bar ${cls}"><i style="width:${pct(v)}%"></i></div><span>${pct(v)}</span></div>`; }

function renderFamily(a) {
  const f = a.family; if (!f) return '';
  const nm = (id) => esc(state.agents.find(x => x.id === id)?.name || '?');
  const L = [];
  if (f.partner) L.push(`<div>Together with <b>${nm(f.partner)}</b>${f.stars != null ? ` <span class="muted">· stars ${Math.round(f.stars * 100)}</span>` : ''}</div>${dial('bond', f.bondStrength, f.bondStrength < 0.3 ? 'bad' : '')}`);
  if (f.parents?.length) L.push(`<div class="muted">Child of ${f.parents.map(nm).join(' and ')}${f.isChild ? ` · ${f.childDays} days grown, ${f.neglectDays} of them neglected` : ''}</div>`);
  for (const cid of f.children || []) {
    const c = state.agents.find(x => x.id === cid); if (!c) continue;
    L.push(`<div class="mo-person" data-look="${c.id}" style="cursor:pointer"><span>${esc(c.name)} <span class="muted">${c.alive ? `${c.age} · ${esc(expressionOf(c))}` : 'dead'} · tended ${f.attach?.[cid] || 0}×${(f.attach?.[cid] || 0) > 5 ? ' · part of them' : ''}</span></span></div>`);
  }
  if (f.isChild && f.tended && Object.keys(f.tended).length) L.push(`<div class="muted">Tended by ${Object.entries(f.tended).sort((x, y) => y[1] - x[1]).map(([id, n]) => `${nm(id)} ${n}×`).join(', ')}</div>`);
  if (!L.length) return '';
  return `<h3>Family</h3>${L.join('')}`;
}

function describeInv(inv) {
  if (!inv) return 'nothing';
  const parts = [];
  for (const [k, v] of Object.entries(inv)) {
    if (!v || v < 0.5) continue;
    parts.push(k === 'food' ? `${v.toFixed(1)} food` : `${Math.floor(v)} ${k}${Math.floor(v) > 1 && !/s$/.test(k) && k !== 'wood' && k !== 'stone' && k !== 'fiber' && k !== 'herbs' && k !== 'berries' ? 's' : ''}`);
  }
  return parts.length ? parts.join(', ') : 'nothing';
}

// ---------- diary ----------
// Page through a villager's diary one day at a time. Owners can leave a note in the margin.
const diaryPage = new Map();   // agentId -> index into diary (default: latest)
function renderDiary(a) {
  const n = a.diary.length;
  if (!n) return `<div class="muted">Nothing written yet. They write at night.</div>${noteBox(a)}`;
  // Follow the newest entry unless the reader has paged back on purpose.
  let i = diaryPage.has(a.id) ? diaryPage.get(a.id) : n - 1;
  i = Math.max(0, Math.min(n - 1, i));
  if (diaryPage.has(a.id) && i >= n - 1) diaryPage.delete(a.id);
  const d = a.diary[i];
  const notesThatDay = (a.notes || []).filter(x => x.day === d.day);
  return `
    <div class="row" style="justify-content:space-between;margin:4px 0">
      <button class="act" data-diary="${a.id}" data-step="-1" ${i === 0 ? 'disabled' : ''}>‹ earlier</button>
      <span class="muted">Day ${d.day} · ${esc(d.mood || '')}${d.by === 'scripted' ? ' · autopilot' : ''}</span>
      <button class="act" data-diary="${a.id}" data-step="1" ${i === n - 1 ? 'disabled' : ''}>later ›</button>
    </div>
    <div class="quote" style="padding:8px 10px;background:#0a0d12;border-radius:6px;white-space:pre-wrap">${esc(d.text)}</div>
    ${notesThatDay.map(x => `<div class="muted" style="margin:4px 0 0 10px;border-left:2px solid var(--warm);padding-left:8px">margin, day ${x.day}: "${esc(x.text)}"${x.read ? '' : ' · unread'}</div>`).join('')}
    <input type="range" min="0" max="${n - 1}" value="${i}" data-diaryslider="${a.id}" style="margin-top:8px" title="scrub through days">
    ${noteBox(a)}`;
}
function noteBox(a) {
  if (!owned.has(a.id)) return `<div class="muted" style="margin-top:6px">Only ${esc(a.name)}'s higher self can write in their margin.</div>`;
  const unread = (a.notes || []).filter(x => !x.read).length;
  return `<label>Write in the margin of their diary <span class="muted">· a few words from their higher self; they read it before their next choice${unread ? ` · ${unread} unread` : ''}</span></label>
    <div class="row" style="margin-top:4px"><input data-note="${a.id}" placeholder="a few words only they will see" maxlength="400" style="flex:1"><button class="act" data-notesend="${a.id}">Leave it</button></div>`;
}
// Delegate clicks so the buttons survive re-renders.
for (const host of [$('inspector'), $('owned')]) host.addEventListener('click', (e) => {
  const look = e.target.closest('[data-moment]');
  if (look) { openMoment(look.dataset.moment); return; }
  const ob = e.target.closest('[data-observe]'); if (ob) { startObserving(ob.dataset.observe); return; }
  if (e.target.closest('[data-unobserve]')) { stopObserving(); return; }
  const step = e.target.closest('[data-diary]');
  if (step) { const id = step.dataset.diary; const a = state.agents.find(x => x.id === id); const cur = diaryPage.has(id) ? diaryPage.get(id) : a.diary.length - 1; diaryPage.set(id, cur + Number(step.dataset.step)); renderInspector(); return; }
  const cBtn = e.target.closest('[data-communesend]');
  if (cBtn) { const id = cBtn.dataset.communesend; const inp = cBtn.closest('[data-communebox]').querySelector('[data-commune]'); const text = inp.value.trim(); if (text) { send({ type: 'commune', agentId: id, text }); inp.value = ''; inp.blur(); } return; }
  const claimBtn = e.target.closest('[data-adopt]');
  if (claimBtn && $('inspector').contains(claimBtn)) { readBrainForm(); send({ type: 'adopt', agentId: claimBtn.dataset.adopt }); return; }
  const askBtn = e.target.closest('[data-communeask]');
  if (askBtn) { send({ type: 'commune', agentId: askBtn.dataset.communeask, text: askBtn.dataset.q }); return; }
  const mkBtn = e.target.closest('[data-communeguide]');
  if (mkBtn) {
    const id = mkBtn.dataset.communeguide; const inp = mkBtn.closest('[data-communebox]').querySelector('[data-commune]');
    const last = (communeThreads.get(id) || []).filter(t => t.from === 'self').slice(-1)[0];
    const text = (inp.value.trim() || last?.text || '').slice(0, 300);
    if (!text) { toast('Say something first; then it can become their intention.', 'bad'); return; }
    send({ type: 'guide', agentId: id, text });
    if (inp.value.trim()) { send({ type: 'commune', agentId: id, text }); inp.value = ''; }
    toast(`${state.agents.find(x => x.id === id)?.name} will carry this every day: "${text}"`, 'good'); inp.blur(); return;
  }
  const clrBtn = e.target.closest('[data-guideclear]');
  if (clrBtn) { send({ type: 'guide', agentId: clrBtn.dataset.guideclear, text: '' }); return; }
  const guideBtn = e.target.closest('[data-guidesend]');
  if (guideBtn) { const id = guideBtn.dataset.guidesend; const inp = document.querySelector(`[data-guide="${id}"]`); send({ type: 'guide', agentId: id, text: inp.value.trim() }); log(`you guided ${state.agents.find(x => x.id === id)?.name}: ${inp.value.trim() || '(cleared)'}`); inp.blur(); return; }
  const sendBtn = e.target.closest('[data-notesend]');
  if (sendBtn) { const id = sendBtn.dataset.notesend; const inp = document.querySelector(`[data-note="${id}"]`); const text = inp.value.trim(); if (text) { send({ type: 'note', agentId: id, text }); inp.value = ''; log(`you wrote in ${state.agents.find(x => x.id === id)?.name}'s margin: ${text}`); } }
});
$('inspector').addEventListener('input', (e) => {
  const s = e.target.closest('[data-diaryslider]');
  if (s) { diaryPage.set(s.dataset.diaryslider, Number(s.value)); renderInspector(); }
});
for (const host of [$('inspector'), $('owned')]) host.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-note]')) { e.preventDefault(); document.querySelector(`[data-notesend="${e.target.dataset.note}"]`)?.click(); }
  if (e.key === 'Enter' && e.target.matches('[data-guide]')) { e.preventDefault(); document.querySelector(`[data-guidesend="${e.target.dataset.guide}"]`)?.click(); }
  if (e.key === 'Enter' && e.target.matches('[data-commune]')) { e.preventDefault(); e.target.closest('[data-communebox]').querySelector('[data-communesend]')?.click(); }
});

function renderInspector() {
  // Don't redraw under someone's hands: a note being typed or a slider being dragged survives the tick.
  const active = document.activeElement;
  if (active && active !== document.body && $('inspector').contains(active)) return;
  const a = state && state.agents.find(x => x.id === selected);
  if (!a) { $('inspector').innerHTML = '<span class="muted">Click a villager on the map.</span>'; return; }
  const b = a.body;
  const trust = Object.entries(a.trust).map(([id, v]) => { const o = state.agents.find(x => x.id === id); return o ? `<div class="dial"><span>${esc(o.name)}</span><div class="bar ${v < 0 ? 'bad' : ''}"><i style="width:${pct(Math.abs(v))}%"></i></div><span>${v > 0 ? '+' : ''}${v.toFixed(2)}</span></div>` : ''; }).join('');
  $('inspector').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:16px">${esc(a.name)}</b><span class="muted">${a.alive ? `${a.age} · ${a.stage} · ${a.branch}` : `died day ${a.diedDay}${a.ageAtDeath != null ? ' aged ' + a.ageAtDeath : ''}${a.causeOfDeath ? ' of ' + esc(a.causeOfDeath) : ''}`}</span></div>
    <a href="diaries.html?who=${a.id}" style="display:block;text-decoration:none;background:var(--warm);color:#1a1206;font-weight:700;text-align:center;padding:10px;border-radius:8px;margin:8px 0">📖 Read ${esc(a.name)}'s diary (${a.diary.length} night${a.diary.length === 1 ? '' : 's'})</a>
    ${a.alive ? (observing === a.id
      ? `<div style="background:#1d2430;border:1px solid var(--warm);border-radius:8px;padding:8px;margin:0 0 8px"><div class="row" style="justify-content:space-between;align-items:center"><b style="color:var(--warm)">👁 Observing ${esc(a.name)}</b><span class="muted">the camera stays on them · they do not know</span><button class="act" data-unobserve="1">Stop</button></div><div id="eyesPanel" style="margin-top:8px;max-height:46vh;overflow:auto">${eyesHtml()}</div><div class="muted" style="margin-top:4px"><a href="eyes.html?who=${a.id}" target="_blank" style="color:var(--dim)">open this as its own page</a></div></div>`
      : `<button class="act" data-observe="${a.id}" style="display:block;width:100%;background:#2a3242;color:var(--ink);font-weight:600;text-align:center;padding:9px;border-radius:8px;margin:0 0 8px" title="the camera stays on them and their thoughts, doing and hearing stream here as they happen; you only watch">👁 Observe ${esc(a.name)} · follow them closely, hear their thoughts</button>`) : ''}
    <div class="row" style="margin:6px 0">${a.alive ? `<button class="act" data-moment="${a.id}">Look closer · stop time</button><span class="muted">${esc(expressionOf(a))}</span>` : ''}</div>
    ${a.destiny ? `<div class="quote" style="color:var(--warm)">${a.destiny.fulfilled ? 'Destiny come to pass' : 'Marked'}: "${esc(a.destiny.text)}"</div>` : ''}
    ${a.sense ? `<div class="quote" style="color:var(--warm)">Sense: ${esc(a.sense.label)} <span class="muted">· ${esc(a.sense.long)} · opened day ${a.sense.day}</span><br><span class="muted">${esc(a.sense.what)}</span></div>` : ''}
    ${a.gift ? `<div class="quote" style="color:var(--warm)">Gift: ${esc(a.gift.label)} <span class="muted">· woke day ${a.gift.day} · used ${a.gift.uses}×</span><br><span class="muted">${esc(a.gift.what)}</span></div>` : ((a.skills?.stillness || 0) >= 4 ? '<div class="muted">Something stirs when they sit still. Not finished yet.</div>' : '')}
    ${renderCommune(a)}
    <div class="muted">${esc(a.chart.summary)}</div>
    <div class="muted">Born ${a.chart.birth.slice(0, 10)} · raised ${a.upbringing} · one village year is ${state.yearDays} days · brain: ${a.brain}${a.voicedBy ? ` · whispered to by <b>${esc(a.voicedBy)}</b> since day ${a.voicedSince}` : ''}${a.brain === 'remote' ? (a.connected ? (a.autopilot ? ' (owner slow, scripted stood in)' : ' (owner connected)') : ' (owner away)') : ''}</div>
    ${a.transits.length ? `<div class="muted">Sky: ${a.transits.map(esc).join(', ')}</div>` : ''}
    <h3>Who they think they are</h3><div class="quote">${esc(a.selfSummary)}</div>
    ${a.thought ? `<div class="muted" style="margin-top:4px">Thinking: ${esc(a.thought)}</div>` : ''}
    <h3>Body</h3>
    ${dial('warmth', b.warmth, b.warmth < 0.3 ? 'cold' : '')}${dial('food', b.food, b.food < 0.3 ? 'bad' : '')}${dial('energy', b.energy)}
    ${dial('tightness', b.tightness, b.tightness > 0.6 ? 'bad' : '')}${dial('breath', b.breath, b.breath < 0.5 ? 'bad' : '')}${dial('openness', b.openness)}${dial('hurt', b.hurt, 'bad')}${dial('joy', b.joy ?? 0.5, (b.joy ?? 0.5) < 0.25 ? 'cold' : '')}
    ${Object.keys(a.skills || {}).length ? `<div class="muted">Takes up: ${Object.entries(a.skills).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${esc(k)} (${n})`).join(', ')}</div>` : ''}
    ${a.ill ? `<div style="color:var(--bad)">Sick: ${a.ill.kind} since day ${a.ill.day} · ${a.ill.severity > 0.6 ? 'bad' : a.ill.severity > 0.3 ? 'middling' : 'mending'}. Herbs, salve or tonic, and rest.</div>` : ''}
    <div class="muted">Looks ${esc(a.visible)}${b.overwhelmed ? ' · OVERWHELMED' : ''}</div>
    ${(state.works || []).some(x => x.by === a.id) ? `<h3>Made</h3>${(state.works || []).filter(x => x.by === a.id).slice(-6).reverse().map(x => `<div class="mem"><b>"${esc(x.title)}"</b> <span class="muted">· ${esc(x.art)} · day ${x.day}${x.moved ? ` · moved ${x.moved}` : ''}</span><br><i>${esc(x.line)}</i></div>`).join('')}` : ''}
    ${(state.animals || []).some(x => x.owner === a.id) ? `<div class="muted" style="margin-top:4px">Keeps: ${(state.animals || []).filter(x => x.owner === a.id).map(x => `<b>${esc(x.name)}</b> the ${x.young ? (x.kind === 'cat' ? 'kitten' : x.kind === 'dog' ? 'pup' : x.kind) : x.kind}${x.hungry >= 2 ? ' (thin)' : ''}`).join(', ')}</div>` : ''}
    <h3>Carries</h3>
    <div class="muted">${esc(describeInv(a.inv))}${a.savings ? ` · keeps ${a.savings} coin in the bank` : ''}${a.owes ? ` · <span style="color:var(--bad)">owes the bank ${a.owes}</span>` : ''}${a.vote ? ` · voted for the ${esc(state.buildSpecs?.[a.vote]?.label || a.vote)}` : ''}</div>
    ${Object.keys(a.upgrades || {}).length ? `<div class="muted" style="margin-top:4px">Built at home: ${Object.keys(a.upgrades).map(k => esc(state.upgradeSpecs?.[k]?.label || k)).join(', ')}</div>` : ''}
    ${a.wants ? `<div class="muted" style="margin-top:4px">${a.inv[a.wants] > 0 ? `Has the <b>${esc(a.wants)}</b> they longed for.` : `Longs for a <b>${esc(a.wants)}</b>.`}</div>` : ''}
    ${(a.grief || []).length ? `<h3>Grieving</h3>${a.grief.map(g => `<div class="wound"><div>${esc(g.name)} <span class="muted">· since day ${g.day} · shared ${g.shared}×</span></div>${dial('weight', g.intensity, 'cold')}</div>`).join('')}` : ''}
    ${renderFamily(a)}
    <h3>Diary <span class="muted">(${a.diary.length} entr${a.diary.length === 1 ? 'y' : 'ies'})</span></h3>
    ${renderDiary(a)}
    <h3>Rules the body wrote <span class="muted">(they cannot see these)</span></h3>
    ${a.wounds.length ? a.wounds.map(w => `<div class="wound"><div class="b">"${esc(w.belief)}"</div><div class="muted">from ${esc(w.from)}, day ${w.day} · contradicted ${w.contradictions}×</div>${dial('strength', w.strength, 'bad')}</div>`).join('') : '<div class="muted">none</div>'}
    ${a.scars.length ? `<h3>Scars</h3>${a.scars.map(s => `<div class="scar">healed day ${s.healedDay}: "${esc(s.belief)}" no longer runs them</div>`).join('')}` : ''}
    <h3>Trust</h3>${trust || '<div class="muted">knows no one yet</div>'}
    <h3>Remembers</h3>${[...a.memories].reverse().map(m => `<div class="mem"><span class="muted">d${m.day}</span> ${esc(m.text)}</div>`).join('')}
    <h3>What a mind could learn from this life</h3>
    <div class="muted" id="trainInfo-${a.id}">Loading…</div>
    <div class="row" style="margin-top:6px"><a class="act" href="/api/training/${a.id}/sft.jsonl" style="text-decoration:none">Export examples</a><a class="act" href="/api/training/${a.id}/dpo.jsonl" style="text-decoration:none">Export preference pairs</a><a class="act" href="/train/README.md" target="_blank" style="text-decoration:none">How to train</a></div>
    <div class="muted" style="margin-top:10px"><a href="/api/agent/${a.id}.json" target="_blank" style="color:var(--dim)">life record (json)</a> · to bring ${esc(a.name)} into another village, paste that link on the other village's create page under "Bring someone from another world".</div>`;
  fetch(`/api/training/${a.id}`).then(r => r.json()).then(s => {
    const el = document.getElementById(`trainInfo-${a.id}`); if (!el) return;
    if (!s.n) { el.textContent = a.brain === 'remote' || a.brain === 'lent' ? 'No decisions recorded yet. Every choice this mind makes from now on is kept with what it did to the body.' : 'Nothing recorded. Only villagers with a mind (owned or lent) are recorded.'; return; }
    const by = Object.entries(s.byType).sort((x, y) => y[1].mean - x[1].mean).map(([t, v]) => `${t} ${v.mean >= 0 ? '+' : ''}${v.mean} (${v.n})`).join(' · ');
    el.innerHTML = `<b>${s.n}</b> decisions recorded, average outcome <b>${s.mean >= 0 ? '+' : ''}${s.mean}</b>.<br>By choice: ${esc(by)}<br><span class="muted">Best: ${s.best.map(b => `${b.action.type} d${b.day} ${b.reward >= 0 ? '+' : ''}${b.reward}`).join(', ')} · Worst: ${s.worst.map(b => `${b.action.type} d${b.day} ${b.reward}`).join(', ')}</span>`;
  }).catch(() => {});
}

// ---------- weather (god) ----------
let weatherDirty = false;
function renderWeather() {
  if (!state || weatherDirty) return;
  const w = state.weather;
  $('harsh').value = w.winterHarshness; $('vHarsh').textContent = w.winterHarshness.toFixed(2);
  $('harvest').value = w.harvest; $('vHarvest').textContent = w.harvest.toFixed(2);
  $('days').value = w.daysPerSeason; $('vDays').textContent = w.daysPerSeason;
  $('tickms').value = Math.round(w.tickMs / 1000); $('vTick').textContent = Math.round(w.tickMs / 1000) + 's';
  $('btnPause').textContent = state.paused ? 'Resume' : 'Pause';
  // Attention, the name they give you, and what they ask.
  const g = state.god || { attention: 0, max: 8, name: 'the Sky', costs: {} };
  $('attnNum').textContent = `· ${g.attention} of ${g.max}`;
  $('attnBar').style.width = `${Math.round((g.attention / g.max) * 100)}%`;
  $('godName').textContent = g.name;
  $('godNamed').textContent = g.named != null ? ` · since day ${g.named}` : '';
  const can = (op) => g.attention >= (g.costs?.[op] ?? 0);
  $('btnTraveler').disabled = !can('traveler'); $('btnWood').disabled = !can('wood'); $('btnNudge').disabled = !can('nudge');
  $('btnTraveler').title = `costs ${g.costs?.traveler ?? 3}`; $('btnWood').title = `costs ${g.costs?.wood ?? 1}`; $('btnNudge').title = `costs ${g.costs?.nudge ?? 1}`;
  const pr = (state.prayers || []).slice(-8).reverse();
  $('prayers').innerHTML = pr.length ? pr.map(p => `<div class="mem"><span class="muted">d${p.day} ${esc(p.name)}${p.faith < -0.2 ? ' (doubting)' : p.faith > 0.2 ? ' (believing)' : ''}:</span> "${esc(p.text)}"</div>`).join('') : 'No one has spoken to the sky.';
  const opts = state.agents.filter(a => a.alive).map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  if ($('nudgeA').innerHTML !== opts) { $('nudgeA').innerHTML = opts; $('nudgeB').innerHTML = opts; $('destWho').innerHTML = opts; $('giftWho').innerHTML = opts; $('senseWho').innerHTML = opts; }
  $('btnGift').disabled = !can('gift'); $('btnSense').disabled = !can('sense');
  // Destinies spoken, and whether they came to pass. You decide when they have.
  const dest = state.agents.filter(a => a.destiny);
  const destHtml = dest.length ? dest.map(a => `<div class="mem">${esc(a.name)}: "${esc(a.destiny.text)}" ${a.destiny.fulfilled ? `<span style="color:var(--good)">· came to pass day ${a.destiny.fulfilled}</span>` : `<span class="muted">· spoken day ${a.destiny.day}</span> ${a.alive ? `<button class="act" data-fulfil="${a.id}" style="padding:2px 8px;font-size:12px">It has come to pass</button>` : ''}`}</div>`).join('') : '';
  if ($('destList').innerHTML !== destHtml) { $('destList').innerHTML = destHtml; for (const b of $('destList').querySelectorAll('[data-fulfil]')) b.onclick = () => send({ type: 'god', op: 'fulfil', a: b.dataset.fulfil }); }
  $('btnDestiny').disabled = !can('destiny');
  $('btnOmen').disabled = !can('omen');
  // The card the sky turned.
  const cd = state.card;
  const suitCol = (s) => s === 'pentacles' ? '#e8d36a' : s === 'swords' ? '#8fb8e6' : s === 'wands' ? '#ff6a1a' : s === 'cups' ? '#3f6fa8' : '#fff1a8';
  const cardHtml = !cd ? 'No card has been turned.' : `<div class="mem" style="border-left:3px solid ${suitCol(cd.suit)};padding-left:8px"><b style="color:${suitCol(cd.suit)}">${esc(cd.name)}</b> <span class="muted">· ${esc(cd.meaning)} · day ${cd.day} · turned by ${cd.by === 'sky' ? 'the sky itself' : 'you'}</span><br>${esc(cd.text)}</div>`
    + ((state.cards || []).length > 1 ? `<div class="muted" style="margin-top:4px">Before that: ${state.cards.slice(0, -1).reverse().slice(0, 6).map(c => `<span style="color:${suitCol(c.suit)}">${esc(c.name)}</span> <span class="muted">d${c.day}</span>`).join(' · ')}</div>` : '');
  if ($('cardBox').innerHTML !== cardHtml) $('cardBox').innerHTML = cardHtml;
  $('btnParley').disabled = !can('parley') || !state.rival?.seen; $('btnParley').title = state.rival?.seen ? `${state.rival.name} are ${state.rival.mood} toward the village` : 'no other fire has been seen yet';
  $('btnDraw').disabled = !can('draw'); $('deckLeft').textContent = `· ${state.deckLeft ?? 78} left in the deck`;
  // What is coming, how ready they are, and whether to tell them.
  const t = state.threat;
  const threatHtml = !t ? 'Nothing on the horizon.' : t.landed
    ? `<div class="mem"><b style="color:var(--bad)">${esc(t.name[0].toUpperCase() + t.name.slice(1))}</b> landed on day ${t.landed}, the village <b>${esc(t.word)}</b>.<br>${esc(t.text || '')}</div>`
    : `<div class="mem"><b style="color:var(--warm)">${esc(t.name[0].toUpperCase() + t.name.slice(1))}</b> in <b>${t.daysLeft}</b> day${t.daysLeft === 1 ? '' : 's'} · they are <b style="color:${t.readiness >= 0.5 ? 'var(--good)' : 'var(--bad)'}">${esc(t.word)}</b> (${Math.round((t.readiness || 0) * 100)}%)
      <div class="bar" style="height:8px;margin:4px 0"><i style="width:${Math.round((t.readiness || 0) * 100)}%"></i></div>
      <span class="muted">What would help: ${esc(t.help)}.</span><br>
      ${t.known ? `<span class="muted">They know. You warned them on day ${t.warned ?? t.seen}.</span>` : `<button class="act" id="btnWarn" ${can('warn') ? '' : 'disabled'} title="costs ${g.costs?.warn ?? 1}">Warn them · costs ${g.costs?.warn ?? 1}</button> <span class="muted">an omen with a name; the ones who see tomorrow already know</span>`}</div>`;
  if ($('threatBox').innerHTML !== threatHtml) { $('threatBox').innerHTML = threatHtml; const b = $('btnWarn'); if (b) b.onclick = () => send({ type: 'god', op: 'warn' }); }
  const rep = (state.reports || []).slice(-1)[0];
  const repHtml = !rep ? 'No season has turned yet.' : `<div class="mem"><b>${esc(rep.season[0].toUpperCase() + rep.season.slice(1))}, year ${rep.year}</b> · <b style="color:${rep.earned >= 0 ? 'var(--good)' : 'var(--bad)'}">${rep.earned >= 0 ? '+' : ''}${rep.earned} attention</b><br>
    <span class="muted">${rep.why.map(esc).join(' · ')}</span><br>
    ${rep.alive} alive${rep.born.length ? ` · born: ${rep.born.map(esc).join(', ')}` : ''}${rep.died.length ? ` · <span style="color:var(--bad)">lost: ${rep.died.map(esc).join(', ')}</span>` : ''}${rep.questions ? ` · ${rep.questions} question${rep.questions === 1 ? '' : 's'} answered` : ''}${rep.works ? ` · ${rep.works} work${rep.works === 1 ? '' : 's'} made` : ''}${rep.prayers ? ` · ${rep.prayers} prayer${rep.prayers === 1 ? '' : 's'}` : ''}
    ${rep.threat ? `<br><span class="muted">${esc(rep.threat.name)}: ${rep.threat.landed ? `landed, the village ${rep.threat.readiness >= 0.5 ? 'ready' : 'unready'}` : 'never came'}</span>` : ''}</div>`
    + ((state.reports || []).length > 1 ? `<div class="muted" style="margin-top:4px">Before that: ${(state.reports || []).slice(0, -1).reverse().map(r => `${esc(r.season)} ${r.year} ${r.earned >= 0 ? '+' : ''}${r.earned}`).join(' · ')}</div>` : '');
  if ($('reportBox').innerHTML !== repHtml) $('reportBox').innerHTML = repHtml;
  if (g.omens && !$('omenKind').options.length) $('omenKind').innerHTML = Object.entries(g.omens).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('');
}
function sendWeather() {
  send({ type: 'god', op: 'weather', winterHarshness: +$('harsh').value, harvest: +$('harvest').value, daysPerSeason: +$('days').value, tickMs: +$('tickms').value * 1000 });
  weatherDirty = false;
}
for (const id of ['harsh', 'harvest', 'days', 'tickms']) {
  $(id).addEventListener('input', () => { weatherDirty = true; $('vHarsh').textContent = (+$('harsh').value).toFixed(2); $('vHarvest').textContent = (+$('harvest').value).toFixed(2); $('vDays').textContent = $('days').value; $('vTick').textContent = $('tickms').value + 's'; });
  $(id).addEventListener('change', sendWeather);
}
$('godLogin').onclick = () => { const tkn = $('godToken').value.trim() || 'weather'; localStorage.setItem('playinggod.god', tkn); $('godMsg').textContent = 'asking the sky…'; $('godMsg').style.color = ''; if (!ws || ws.readyState !== 1) { $('godMsg').textContent = 'Not connected to the village. Is the server running?'; return; } send({ type: 'hello', token, godToken: tkn }); };
$('godToken').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('godLogin').click(); });
if (/^(localhost|127.0.0.1|192.168.)/.test(location.hostname) && !localStorage.getItem('playinggod.god')) $('godToken').value = 'weather';
$('btnTraveler').onclick = () => send({ type: 'god', op: 'traveler' });
$('btnWood').onclick = () => send({ type: 'god', op: 'wood' });
$('btnPause').onclick = () => send({ type: 'god', op: state.paused ? 'resume' : 'pause' });
$('btnNudge').onclick = () => send({ type: 'god', op: 'nudge', a: $('nudgeA').value, b: $('nudgeB').value, place: $('nudgePlace').value });
$('btnGift').onclick = () => { send({ type: 'god', op: 'gift', a: $('giftWho').value }); };
$('btnSense').onclick = () => { send({ type: 'god', op: 'sense', a: $('senseWho').value, kind: $('senseKind').value }); };
$('btnDestiny').onclick = () => { const text = $('destText').value.trim(); if (!text) return; send({ type: 'god', op: 'destiny', a: $('destWho').value, text }); $('destText').value = ''; };
$('btnOmen').onclick = () => send({ type: 'god', op: 'omen', kind: $('omenKind').value });
$('btnDraw').onclick = () => send({ type: 'god', op: 'draw' });
$('btnParley').onclick = () => send({ type: 'god', op: 'parley' });
$('lendToggle').checked = localStorage.getItem('playinggod.lend') === '1';
$('lendName').value = localStorage.getItem('playinggod.lendName') || '';
$('lendName').onchange = () => { localStorage.setItem('playinggod.lendName', $('lendName').value.trim()); if ($('lendToggle').checked) send({ type: 'lend', on: true, name: $('lendName').value.trim() }); };
$('lendToggle').onchange = () => { localStorage.setItem('playinggod.lend', $('lendToggle').checked ? '1' : '0'); send({ type: 'lend', on: $('lendToggle').checked, name: $('lendName').value.trim() }); };
$('tellToggle').checked = localStorage.getItem('playinggod.tell') === '1';
$('tellToggle').onchange = () => localStorage.setItem('playinggod.tell', $('tellToggle').checked ? '1' : '0');
$('btnReset').onclick = () => { if (confirm('Start the world over? Every life in it ends.')) { owned.clear(); updateBrainPill(); send({ type: 'god', op: 'reset' }); } };

// ---------- brain tab ----------
// Same BYOK shape as PidgeyAssist: pick a provider, paste its key, pick or type a model, Connect & Test.
// Each provider keeps its own key and model so switching back never loses anything.
$('provider').innerHTML = Object.entries(Brain.PROVIDERS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('');
brainCfg.models = brainCfg.models || {};

function loadBrainForm() {
  const p = Brain.PROVIDERS[brainCfg.provider] || Brain.PROVIDERS.local;
  $('provider').value = brainCfg.provider;
  $('baseUrlRow').hidden = brainCfg.provider !== 'local';
  $('baseUrl').value = brainCfg.baseUrl || p.defaultBase || '';
  $('apiKey').value = Brain.keyFor(brainCfg);
  $('apiKey').placeholder = p.keyHint;
  $('keyHint').innerHTML = p.keyUrl ? `· <a href="${p.keyUrl}" target="_blank" style="color:var(--dim)">get one</a>` : '· optional';
  $('model').value = brainCfg.model || '';
  $('modelList').innerHTML = p.models.map(m => `<option value="${esc(m)}">`).join('');
  $('modelHint').textContent = `· ${p.models.length} suggested`;
  $('providerBadge').textContent = `Active brain: ${p.label} · ${brainCfg.model || p.models[0]}`;
}
function readBrainForm() {
  const provider = $('provider').value;
  const keys = { ...(brainCfg.keys || {}), [provider]: $('apiKey').value };
  const models = { ...(brainCfg.models || {}), [provider]: $('model').value.trim() };
  brainCfg = { ...brainCfg, provider, baseUrl: $('baseUrl').value.trim(), model: models[provider], keys, models };
  Brain.saveBrainConfig(brainCfg); loadBrainForm();
}
for (const id of ['baseUrl', 'model', 'apiKey']) $(id).addEventListener('change', readBrainForm);
$('provider').addEventListener('change', () => {
  // Switching provider: restore that provider's remembered model and key.
  const provider = $('provider').value;
  const p = Brain.PROVIDERS[provider];
  brainCfg = { ...brainCfg, provider, model: (brainCfg.models || {})[provider] || p.models[0] };
  Brain.saveBrainConfig(brainCfg); loadBrainForm(); refreshModels();
});
$('btnReveal').onclick = () => { $('apiKey').type = $('apiKey').type === 'password' ? 'text' : 'password'; };

// Offer whatever models the endpoint really has. If the saved model isn't one of them, take the first sensible one.
async function refreshModels() {
  try {
    const models = await Brain.listModels(brainCfg);
    if (!models.length) return;
    const preferred = models.filter(m => !/cloud|embed|whisper|tts|dall|image|audio|realtime|moderation|-vl|vision/i.test(m));
    if (!models.includes(brainCfg.model)) { $('model').value = preferred[0] || models[0]; readBrainForm(); }
    $('modelList').innerHTML = models.map(m => `<option value="${esc(m)}">`).join('');
    $('modelHint').textContent = `· ${models.length} available`;
  } catch { /* keep the suggested list */ }
}
$('baseUrl').addEventListener('change', refreshModels);
$('apiKey').addEventListener('change', refreshModels);
loadBrainForm();
refreshModels();

$('btnTest').onclick = async () => {
  readBrainForm(); $('testOut').textContent = 'thinking…';
  try {
    const r = await Brain.callModel(brainCfg, 'Reply with one word.', 'Say hello.', { maxTokens: 10 });
    $('testOut').textContent = 'ok: ' + r.trim().slice(0, 40);
  } catch (e) { $('testOut').textContent = 'failed: ' + e.message; }
};

function renderBrainTab() {
  if (!state) return;
  const mine = state.agents.filter(a => owned.has(a.id));
  const per = brainCfg.perAgent || {};
  const provOpts = (sel) => `<option value="">(default brain)</option>` + Object.entries(Brain.PROVIDERS).map(([k, p]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${esc(p.label.split(' (')[0])}</option>`).join('');
  const ownedHtml = mine.length ? mine.map(a => `<div class="agentrow" style="flex-wrap:wrap;gap:6px;align-items:flex-start;border:1px solid var(--line);border-radius:8px;padding:8px;margin-bottom:8px"><span style="flex:1 1 100%"><b style="font-size:15px">${esc(a.name)}</b> ${a.alive ? `<button class="act" data-talkto="${a.id}" style="margin-left:6px">Open ${esc(a.name)}'s page</button>` : ''} <span class="muted">${a.alive ? `${a.age} · ${a.branch}` : 'dead'}${a.autopilot ? ' · autopilot' : ''} · mind: ${esc(cfgFor(a.id).provider)} ${esc(cfgFor(a.id).model || '')}</span></span>${a.alive ? `<div style="flex:1 1 100%">${renderCommune(a, true)}</div>` : ''}<select data-pa-prov="${a.id}" style="flex:1">${provOpts(per[a.id]?.provider || '')}</select><input data-pa-model="${a.id}" placeholder="model for ${esc(a.name)}" value="${esc(per[a.id]?.model || '')}" style="flex:1"><button class="act" data-release="${a.id}" title="stop being their higher self; they go on autopilot">Release</button></div>`).join('') : '<span class="muted">None yet. Claim one below, or birth a new villager.</span>';
  const free = state.agents.filter(a => a.alive && !owned.has(a.id) && (a.claimable || (a.owned && godOk)));
  const freeHtml = free.length ? free.map(a => `<div class="agentrow"><span>${esc(a.name)} <span class="muted">${a.branch} · raised ${a.upbringing}${a.owned ? ` · higher self away ${a.ownerAway} days` : ''}</span></span><button class="act" data-adopt="${a.id}">Claim</button></div>`).join('') : '<span class="muted">Everyone has a higher self who is here or has not been gone long.</span>';
  // Only touch the DOM when the lists actually change, so buttons stay clickable between ticks.
  // Leave the list alone while someone is editing a villager's mind.
  const editing = document.activeElement && $('owned').contains(document.activeElement);
  if ($('owned').innerHTML !== ownedHtml && !editing) {
    $('owned').innerHTML = ownedHtml;
    for (const b of document.querySelectorAll('[data-talkto]')) b.onclick = () => { selected = b.dataset.talkto; showTab('agent'); renderInspector(); setTimeout(() => document.querySelector(`[data-commune="${selected}"]`)?.focus(), 50); };
    for (const b of document.querySelectorAll('[data-release]')) b.onclick = () => { send({ type: 'release', agentId: b.dataset.release }); owned.delete(b.dataset.release); updateBrainPill(); renderBrainTab(); };
    const savePer = (id) => {
      const prov = document.querySelector(`[data-pa-prov="${id}"]`).value, model = document.querySelector(`[data-pa-model="${id}"]`).value.trim();
      brainCfg.perAgent = { ...(brainCfg.perAgent || {}) };
      if (prov) brainCfg.perAgent[id] = { provider: prov, model }; else delete brainCfg.perAgent[id];
      Brain.saveBrainConfig(brainCfg);
      const a = state.agents.find(x => x.id === id); log(`${a?.name}'s mind is now ${cfgFor(id).provider} ${cfgFor(id).model || ''}`);
      renderBrainTab();
    };
    for (const s of document.querySelectorAll('[data-pa-prov]')) s.onchange = () => { const id = s.dataset.paProv; const inp = document.querySelector(`[data-pa-model="${id}"]`); if (s.value && !inp.value) inp.value = Brain.PROVIDERS[s.value].models[0]; savePer(id); };
    for (const i of document.querySelectorAll('[data-pa-model]')) i.onchange = () => savePer(i.dataset.paModel);
  }
  if ($('adoptable').innerHTML !== freeHtml) {
    $('adoptable').innerHTML = freeHtml;
    for (const b of document.querySelectorAll('[data-adopt]')) b.onclick = () => { readBrainForm(); send({ type: 'adopt', agentId: b.dataset.adopt }); };
  }
}
$('btnBirth').onclick = () => { readBrainForm(); send({ type: 'birth', name: $('birthName').value.trim() || undefined, upbringing: $('birthUp').value || undefined }); $('birthName').value = ''; };

connect();
