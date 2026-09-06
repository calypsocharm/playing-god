// Playing God: world server.
// Serves the viewer, runs the tick, and speaks to brains over websockets.
// The server never holds an LLM key. Brains run in their owners' browsers.

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import * as World from './world.js';
import * as Mem from './memory.js';
import * as Chart from './chart.js';
import * as Train from './training.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3333);
const GOD_TOKEN = process.env.GOD_TOKEN || 'weather';
const CLIENT = path.join(ROOT, 'client');
const MIME = { '.md': 'text/plain; charset=utf-8', '.py': 'text/plain; charset=utf-8', '.jsonl': 'application/jsonl', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

let world = World.createWorld(await Mem.load());
const remoteActions = new Map();   // agentId -> normalised action for next tick
const clients = new Map();         // ws -> { role, godOk, owned: Set<agentId>, token }
const uid = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);

// ---------- http ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/agent/')) {
    const id = url.pathname.split('/')[3].replace(/\.json$/, '');
    try {
      const txt = await fs.readFile(path.join(ROOT, 'data', 'agents', `${id}.json`), 'utf8');
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end(txt);
    } catch { res.writeHead(404); return res.end('no such life'); }
  }
  if (url.pathname === '/api/chart') {
    // Preview a chart for the character creator. ?at=ISO date, or omit to roll one.
    const at = url.searchParams.get('at');
    let ms = at ? Date.parse(at) : NaN;
    if (!Number.isFinite(ms)) ms = Chart.rollBirth(World.simDate(world));
    const chart = Chart.makeChart(ms);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ birth: new Date(ms).toISOString(), chart, describe: Chart.describeChart(chart), traits: Chart.traitsFrom(chart), simDate: new Date(World.simDate(world)).toISOString() }));
  }
  if (url.pathname.startsWith('/api/training/')) {
    // /api/training/<id>            summary
    // /api/training/<id>/sft.jsonl  supervised examples (good outcomes)
    // /api/training/<id>/dpo.jsonl  preference pairs
    const [, , , id, what] = url.pathname.split('/');
    const a = World.byId(world, id);
    if (!a) { res.writeHead(404); return res.end('no such villager'); }
    if (what === 'sft.jsonl') { const txt = await Train.exportSFT(id, Number(url.searchParams.get('min') ?? 0)); res.writeHead(200, { 'content-type': 'application/jsonl', 'content-disposition': `attachment; filename="${a.name}-sft.jsonl"` }); return res.end(txt); }
    if (what === 'dpo.jsonl') { const txt = await Train.exportDPO(id); res.writeHead(200, { 'content-type': 'application/jsonl', 'content-disposition': `attachment; filename="${a.name}-dpo.jsonl"` }); return res.end(txt); }
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(await Train.summary(id)));
  }
  if (url.pathname === '/api/story') {
    // The whole story: every chapter, every night, and the diary lines that go with them.
    const remote = world.agents.filter(a => a.brain === 'remote' || a.diary.some(d => d.by === 'remote'));
    const quotes = {};
    for (const a of remote) for (const d of a.diary) if (d.by === 'remote') (quotes[d.day] = quotes[d.day] || []).push({ name: a.name, text: d.text });
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ name: world.camp?.name || '', day: world.day, yearDays: World.yearDays(world), chapters: world.chapters || [], chronicle: world.chronicle, quotes, skyName: world.god.name, goals: Object.entries(World.GOALS).map(([k, label]) => ({ key: k, label, done: world.goals[k]?.done ?? null })), dead: world.agents.filter(a => !a.alive).map(a => ({ name: a.name, day: a.diedDay, age: a.ageAtDeath, cause: a.causeOfDeath })) }));
  }
  if (url.pathname === '/api/state') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(World.publicState(world))); }
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  // The training recipe is served read-only from /train.
  const base = file.startsWith(`${path.sep}train${path.sep}`) || file.startsWith('/train/') ? ROOT : CLIENT;
  const full = path.join(base, file);
  if (!full.startsWith(base)) { res.writeHead(403); return res.end(); }
  try {
    const data = await fs.readFile(full);
    // The page changes often. Never let a browser keep a stale copy.
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});

// What the sky just did, in a sentence, so the Creator sees a consequence for every act.
function describeGodAct(world, m, r) {
  switch (m.op) {
    case 'traveler': { const a = World.byId(world, r.agentId); return a ? `A traveler named ${a.name} arrives on the road. Raised ${a.upbringing}.` : 'A traveler arrives.'; }
    case 'wood': return 'Wood appeared by the hearth. Anyone who was cold felt watched over.';
    case 'nudge': return 'Two people will find themselves at the same place this moment.';
    case 'weather': return `The dials are set: winter ${world.weather.winterHarshness.toFixed(2)}, harvest ${world.weather.harvest.toFixed(2)}, ${world.weather.daysPerSeason} days a season, ${Math.round(world.weather.tickMs / 1000)}s a tick. They take hold from the next tick.`;
    case 'omen': return 'Everyone saw it. What it means is theirs to decide.';
    case 'destiny': return 'A destiny is spoken. They feel the pull; others sense the mark.';
    case 'fulfil': return 'It has come to pass. The village remembers who did it.';
    case 'pause': return 'Time is stopped for everyone.';
    case 'resume': return 'Time moves again.';
    default: return 'Done.';
  }
}

// The Creator's door. Costs no attention: keeping the gallery civil is not an act of the sky.
function moderate(m) {
  const who = String(m.who || '');                     // a short id from a chat line, or a token
  const tokens = [...clients.values()].map(x => x.token).filter(Boolean);
  const token = tokens.find(t => t === who || shortId(t) === who) || (world.chat || []).find(x => x.who === who)?.token || null;
  const conns = [...clients.entries()].filter(([, x]) => x.token && x.token === token);
  const releaseAll = () => { for (const a of world.agents) if (a.owner && a.owner === token) { a.owner = null; a.brain = 'scripted'; a.connected = false; a.guidance = ''; } for (const [, x] of conns) { x.owned.clear(); x.lend = false; } };
  switch (m.op) {
    case 'mute':   if (!token) return { error: 'no such watcher' }; world.mod.muted[token] = Date.now(); return { text: 'Muted. They can watch and play, not talk.' };
    case 'unmute': if (!token) return { error: 'no such watcher' }; delete world.mod.muted[token]; return { text: 'Unmuted.' };
    case 'boot':   if (!token) return { error: 'no such watcher' }; releaseAll(); for (const [ws] of conns) ws.close(4001, 'booted'); return { text: 'Booted. Their villagers are released to the village; they can come back.' };
    case 'ban':    { if (!token) return { error: 'no such watcher' }; releaseAll(); world.mod.bannedTokens[token] = Date.now(); for (const [ws, x] of conns) { if (x.ip) world.mod.bannedIps[x.ip] = Date.now(); ws.close(4003, 'banned'); } return { text: 'Banned, by token and address. Their villagers are released.' }; }
    case 'unban':  { delete world.mod.bannedTokens[who]; delete world.mod.bannedIps[who]; for (const t of Object.keys(world.mod.bannedTokens)) if (shortId(t) === who) delete world.mod.bannedTokens[t]; return { text: 'Unbanned.' }; }
    case 'delchat': { const n = (world.chat || []).length; world.chat = (world.chat || []).filter(x => x.ts !== Number(m.ts)); return { text: n !== world.chat.length ? 'Removed.' : 'Nothing to remove.' }; }
  }
  return { error: 'unknown' };
}

// ---------- websockets ----------
const wss = new WebSocketServer({ server });
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const broadcast = (msg) => { const s = JSON.stringify(msg); for (const ws of clients.keys()) if (ws.readyState === 1) ws.send(s); };

// ---------- guardrails ----------
// Who is on the other end, how fast they may talk, and who has been shown the door.
const shortId = (s) => { let h = 2166136261; for (const ch of String(s || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36).slice(0, 6); };
const ipOf = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
world.mod = world.mod || { bannedIps: {}, bannedTokens: {}, muted: {} };
const perIp = new Map();   // ip -> open connections
function allow(c, kind, limit, windowMs) {
  // token bucket per connection per kind: at most `limit` in `windowMs`
  const now = Date.now(); c.rates = c.rates || {};
  const r = c.rates[kind] = (c.rates[kind] || []).filter(t => now - t < windowMs);
  if (r.length >= limit) return false;
  r.push(now); return true;
}

wss.on('connection', (ws, req) => {
  const ip = ipOf(req);
  if (world.mod.bannedIps[ip]) { ws.close(4003, 'banned'); return; }
  const open = (perIp.get(ip) || 0) + 1; perIp.set(ip, open);
  if (open > 6) { ws.close(4008, 'too many connections'); perIp.set(ip, open - 1); return; }
  const c = { role: 'spectator', godOk: false, owned: new Set(), token: null, ip, since: Date.now() };
  clients.set(ws, c);
  send(ws, { type: 'welcome', godRequired: true });
  send(ws, { type: 'state', state: World.publicState(world) });

  ws.on('message', (buf) => {
    if (buf.length > 64 * 1024) return;                                   // nothing legitimate is this big
    if (!allow(c, 'any', 60, 10000)) return;                              // 60 messages per 10s, silently dropped past that
    let m; try { m = JSON.parse(buf); } catch { return; }
    if (c.token && world.mod.bannedTokens[c.token]) { ws.close(4003, 'banned'); return; }
    try { handle(ws, c, m); } catch (e) { send(ws, { type: 'error', error: String(e.message || e) }); }
  });
  ws.on('close', () => {
    for (const id of c.owned) { const a = World.byId(world, id); if (a) a.connected = false; }
    clients.delete(ws);
    perIp.set(ip, Math.max(0, (perIp.get(ip) || 1) - 1));
  });
});

function handle(ws, c, m) {
  switch (m.type) {
    case 'hello': {
      if (m.godToken !== undefined) { c.godOk = m.godToken === GOD_TOKEN; send(ws, { type: 'god', ok: c.godOk }); }
      if (m.token) c.token = String(m.token).slice(0, 40);
      if (c.token && world.mod.bannedTokens[c.token]) { ws.close(4003, 'banned'); return; }
      // Reconnect any agents this token owns.
      if (c.token) for (const a of world.agents) if (a.owner === c.token && a.alive) { a.connected = true; c.owned.add(a.id); send(ws, { type: 'adopted', agentId: a.id, token: c.token }); send(ws, { type: 'communeLog', agentId: a.id, thread: (a.commune || []).slice(-20) }); }
      break;
    }
    case 'god': {
      if (!c.godOk) return send(ws, { type: 'error', error: 'not the weather' });
      if (['mute', 'unmute', 'boot', 'ban', 'unban', 'delchat'].includes(m.op)) {
        const r = moderate(m); if (r.error) return send(ws, { type: 'error', error: r.error });
        send(ws, { type: 'result', text: r.text }); broadcast({ type: 'state', state: World.publicState(world) }); return;
      }
      if (m.op === 'reset') { world = World.createWorld(null); remoteActions.clear(); for (const cc of clients.values()) cc.owned.clear(); Mem.save(world); }
      else { const r = World.godAct(world, m); if (r.error) return send(ws, { type: 'error', error: r.error }); send(ws, { type: 'result', text: r.text || describeGodAct(world, m, r) }); }
      broadcast({ type: 'state', state: World.publicState(world) });
      break;
    }
    case 'adopt': {
      if (!allow(c, 'claim', 3, 60000)) return send(ws, { type: 'error', error: 'slow down: three claims a minute' });
      const a = World.byId(world, m.agentId);
      if (!a || !a.alive) return send(ws, { type: 'error', error: 'no such villager' });
      if (a.owner && a.owner !== c.token) return send(ws, { type: 'error', error: `${a.name} already has an owner` });
      // Nobody may be the higher self of more than five at once; the village is not one person's.
      if (c.token && world.agents.filter(x => x.alive && x.owner === c.token).length >= 5 && a.owner !== c.token) return send(ws, { type: 'error', error: 'You already hold five. Release one first.' });
      // Children cannot be adopted; a grown child's family has first claim for two seasons.
      if (a.upbringing === 'raised') return send(ws, { type: 'error', error: `${a.name} is a child. Their mind is still forming.` });
      if (a.kinOwner && a.kinOwner !== c.token && world.day < (a.comeOfAgeDay || 0) + world.weather.daysPerSeason * 2) return send(ws, { type: 'error', error: `${a.name}'s family has first claim for now.` });
      c.token = c.token || uid();
      a.owner = c.token; a.brain = 'remote'; a.connected = true; c.owned.add(a.id);
      send(ws, { type: 'adopted', agentId: a.id, token: c.token });
      send(ws, { type: 'communeLog', agentId: a.id, thread: (a.commune || []).slice(-20) });
      send(ws, { type: 'decide', agentId: a.id, view: World.viewFor(a, world) });
      break;
    }
    case 'birth': {
      if (!allow(c, 'claim', 3, 60000)) return send(ws, { type: 'error', error: 'slow down: three births a minute' });
      if (World.alive(world).length >= 60) return send(ws, { type: 'error', error: 'the village is full for now' });
      c.token = c.token || uid();
      // A chosen birth must land the villager between 16 and 60 in sim years.
      let birthMs;
      if (m.birth) {
        const ms = Date.parse(m.birth);
        const age = (World.simDate(world) - ms) / (365.25 * 86400000);
        if (Number.isFinite(ms) && age >= 16 && age <= 60) birthMs = ms;
      }
      const a = World.newAgent(world, { name: m.name ? String(m.name).slice(0, 24) : undefined, upbringing: ['warm', 'cold', 'inconsistent'].includes(m.upbringing) ? m.upbringing : undefined, birthMs, brain: 'remote' });
      a.owner = c.token; a.connected = true; c.owned.add(a.id);
      a.location = 'road'; a.pos = { ...World.PLACES.road };
      send(ws, { type: 'adopted', agentId: a.id, token: c.token, born: true });
      send(ws, { type: 'decide', agentId: a.id, view: World.viewFor(a, world) });
      broadcast({ type: 'state', state: World.publicState(world) });
      break;
    }
    case 'release': {
      const a = World.byId(world, m.agentId);
      if (a && a.owner === c.token) { a.owner = null; a.brain = 'scripted'; a.connected = false; c.owned.delete(a.id); }
      break;
    }
    case 'action': {
      const a = World.byId(world, m.agentId);
      if (!a || a.owner !== c.token) return;
      const act = World.normaliseAction(world, m.action);
      if (act) {
        if (m.thought) act.thought = String(m.thought).slice(0, 300);
        remoteActions.set(a.id, act);
        if (a.lastView) Train.begin(world, a, a.lastView, act, act.thought);
        // Remember it so the villager can carry on with it while nothing new calls their attention.
        // Words are said once; carrying on a talk means staying, not repeating the line.
        a.lastAction = act.type === 'talk' ? { type: 'go', to: act.to, thought: act.thought } : { ...act };
      }
      else send(ws, { type: 'error', error: `could not understand action for ${a.name}` });
      break;
    }
    case 'summary': {
      const a = World.byId(world, m.agentId);
      if (a && a.owner === c.token) {
        if (typeof m.text === 'string' && m.text.trim()) a.selfSummary = m.text.slice(0, 600);
        if (typeof m.diary === 'string' && m.diary.trim()) World.writeDiary(world, a, m.diary, 'remote');
        // Notes shown in the consolidation prompt have now been read.
        for (const n of a.notes) n.read = true;
      }
      break;
    }
    case 'commune': {
      // The higher self speaks. The villager hears it as the voice they have always had, and answers
      // in their own words through their owner's model. Kept as an inner dialogue in the record.
      const a = World.byId(world, m.agentId);
      if (!a || a.owner !== c.token || !a.alive) return;
      if (!allow(c, 'commune', 10, 60000)) return send(ws, { type: 'error', error: 'slow down; they need a moment' });
      const text = String(m.text || '').trim().slice(0, 500);
      if (!text) return;
      a.commune = a.commune || [];
      a.commune.push({ day: world.day, tick: world.tick, from: 'self', text });
      if (a.commune.length > 80) a.commune.shift();
      World.remember(world, a, `A voice inside you said: "${text}"`, 0.6);
      send(ws, { type: 'communeView', agentId: a.id, view: World.viewFor(a, world), thread: a.commune.slice(-20), text });
      break;
    }
    case 'communed': {
      // The villager's answer, as their model gave it.
      const a = World.byId(world, m.agentId);
      if (!a || a.owner !== c.token) return;
      const text = String(m.text || '').trim().slice(0, 700);
      if (!text) return;
      a.commune = a.commune || [];
      a.commune.push({ day: world.day, tick: world.tick, from: 'villager', text });
      if (a.commune.length > 80) a.commune.shift();
      World.remember(world, a, `You answered the voice inside: "${text.slice(0, 160)}"`, 0.5);
      send(ws, { type: 'communeLog', agentId: a.id, thread: a.commune.slice(-20) });
      break;
    }
    case 'guide': {
      // A standing intention from the owner. The villager hears it as a voice they have always had.
      const a = World.byId(world, m.agentId);
      if (!a || a.owner !== c.token) return;
      a.guidance = typeof m.text === 'string' ? m.text.trim().slice(0, 300) : '';
      if (a.guidance) World.remember(world, a, 'Something in you settled on a direction.', 0.5);
      broadcast({ type: 'state', state: World.publicState(world) });
      break;
    }
    case 'lend': {
      // Anyone present may lend their model to villagers nobody has claimed. The unclaimed are
      // split among all the lenders, so the village thinks with whoever shows up.
      c.token = c.token || uid();
      if (m.on && [...clients.values()].filter(x => x.lend && x !== c).length >= 8) return send(ws, { type: 'error', error: 'eight people are already lending; the unclaimed have voices enough' });
      c.lend = !!m.on;
      c.lendName = String(m.name || '').slice(0, 24);
      for (const a of world.agents) if (!a.owner) a.lent = [...clients.values()].some(x => x.lend);
      broadcast({ type: 'state', state: World.publicState(world) });
      break;
    }
    case 'actions': {
      // Batched answers for lent villagers, from the weather's model.
      if (!c.lend || !Array.isArray(m.items)) return;
      for (const it of m.items) {
        const a = World.byId(world, it.agentId) || world.agents.find(x => x.alive && x.name.toLowerCase() === String(it.name || '').toLowerCase());
        if (!a || a.owner || a.voicedBy !== c.token) continue;   // only the whisperer assigned this tick
        const act = World.normaliseAction(world, it.action);
        if (act) { if (it.thought) act.thought = String(it.thought).slice(0, 300); remoteActions.set(a.id, act); a.lastAction = act.type === 'talk' ? { type: 'go', to: act.to, thought: act.thought } : { ...act }; if (a.lastView) Train.begin(world, a, a.lastView, act, act.thought); }
      }
      break;
    }
    case 'chat': {
      // Watchers talking about the village. Anyone on the page. Villagers never see it.
      // One line every three seconds per connection, so a bored stranger cannot flood the gallery.
      const now = Date.now();
      if (c.lastChat && now - c.lastChat < 3000) return send(ws, { type: 'error', error: 'slow down' });
      c.lastChat = now;
      c.token = c.token || uid();
      if (world.mod.muted[c.token]) return send(ws, { type: 'error', error: 'you have been muted here' });
      const msg = World.chat(world, m.name, m.text, shortId(c.token), c.token);
      if (msg) broadcast({ type: 'chat', msg });
      break;
    }
    case 'told': {
      // The weather's own model told tonight's story. It replaces the scripted line.
      if (!c.godOk) return;
      if (World.setChronicle(world, Number(m.day), m.text)) broadcast({ type: 'state', state: World.publicState(world) });
      break;
    }
    case 'note': {
      // A margin note from the owner. The villager reads it in their next prompt.
      const a = World.byId(world, m.agentId);
      if (!a || a.owner !== c.token || typeof m.text !== 'string' || !m.text.trim()) return;
      World.leaveNote(world, a, m.text);
      broadcast({ type: 'state', state: World.publicState(world) });
      break;
    }
  }
}

// What a villager would notice: where they are, who is here, how the body feels, what has been
// done to them (memories not about their own doing), unread notes, and the time of day at dawn.
function attentionKey(a, view) {
  const doneToThem = a.memories.filter(m => !/^You /.test(m.text)).length;
  return JSON.stringify([view.where, view.near, view.felt, view.sky, doneToThem, view.notes.length, view.wants, view.guidance, view.omen, world.tick === 0 ? world.day : 'day']);
}

// ---------- the clock ----------
async function tick() {
  if (!world.paused) {
    const wasNight = world.tick === World.TICKS_PER_DAY - 1;
    World.step(world, remoteActions);
    remoteActions.clear();
    Train.settle(world);   // close every recorded decision with what it did to the body
    broadcast({ type: 'state', state: World.publicState(world) });
    // Attention. A brain is only asked to choose when something calls to it: a new face, a word
    // spoken to them, a change in the body, nightfall. Otherwise the villager keeps doing what they
    // were doing. Fewer calls, and a life that is not re-decided from scratch six times a day.
    for (const [ws, c] of clients) for (const id of c.owned) {
      const a = World.byId(world, id);
      if (!a || !a.alive) continue;
      if (wasNight) {
        const today = a.memories.filter(m => m.day === world.day - 1).map(m => m.text);
        send(ws, { type: 'consolidate', agentId: a.id, day: world.day - 1, events: today, selfSummary: a.selfSummary, name: a.name, diary: a.diary.slice(-2).map(d => `Day ${d.day}: ${d.text}`), notes: a.notes.filter(n => !n.read).map(n => n.text) });
      }
      const view = World.viewFor(a, world);
      const key = attentionKey(a, view);
      const unchanged = a.lastAttention === key && a.lastAction && !wasNight && (a.sinceDecide || 0) < 2;
      if (unchanged) {
        // Nothing new. Carry on.
        remoteActions.set(a.id, { ...a.lastAction, thought: a.lastAction.thought });
        a.sinceDecide = (a.sinceDecide || 0) + 1;
        continue;
      }
      a.lastAttention = key;
      a.sinceDecide = 0;
      a.lastView = view;
      send(ws, { type: 'decide', agentId: a.id, view });
      // A hard moment? Put it to the higher self as a choice, once per kind per day.
      const d = World.dilemmaFor(world, a);
      a.dilemmaSent = a.dilemmaSent || {};
      if (d && a.dilemmaSent[d.key] !== world.day) { a.dilemmaSent[d.key] = world.day; send(ws, { type: 'dilemma', agentId: a.id, name: a.name, day: world.day, ...d }); }
    }
    // Lent minds: villagers nobody has claimed are split among everyone lending a model right now.
    // A villager keeps the same whisperer while that whisperer stays, so a voice has continuity.
    const lenders = [...clients.entries()].filter(([, cc]) => cc.lend);
    if (lenders.length) {
      const byToken = new Map(lenders.map(([ws, cc]) => [cc.token, { ws, cc, items: [] }]));
      const order = lenders.map(([, cc]) => cc.token);
      let i = 0;
      for (const a of world.agents) {
        if (!a.alive || a.owner || World.ageOf(world, a) < 16) continue;
        a.lent = true;
        if (!a.voicedBy || !byToken.has(a.voicedBy)) { a.voicedBy = order[i++ % order.length]; a.voicedSince = world.day; }
        a.voicedName = byToken.get(a.voicedBy).cc.lendName || 'someone';
        const view = World.viewFor(a, world);
        const key = attentionKey(a, view);
        const unchanged = a.lastAttention === key && a.lastAction && !wasNight && (a.sinceDecide || 0) < 2;
        if (unchanged) { remoteActions.set(a.id, { ...a.lastAction }); a.sinceDecide = (a.sinceDecide || 0) + 1; continue; }
        a.lastAttention = key; a.sinceDecide = 0; a.lastView = view;
        byToken.get(a.voicedBy).items.push({ agentId: a.id, view });
      }
      for (const { ws, items } of byToken.values()) if (items.length) send(ws, { type: 'decideMany', items: items.slice(0, 4) });   // four at a time keeps a batch under a tick on a modest card
    } else for (const a of world.agents) { a.lent = false; a.voicedBy = null; }
    if (wasNight) {
      // Offer tonight's facts to any connected weather with a model, so the story can be told, not listed.
      const digest = World.dayDigest(world, world.day - 1);
      for (const [ws, c] of clients) if (c.godOk) send(ws, { type: 'tell', digest });
      await Mem.save(world).catch(e => console.error('save failed', e));
    }
  }
  setTimeout(tick, world.weather.tickMs);
}

server.listen(PORT, () => {
  console.log(`Playing God on http://localhost:${PORT}`);
  console.log(`God token: ${GOD_TOKEN}  (set GOD_TOKEN to change)`);
  console.log(`Village: ${world.agents.filter(a => a.alive).length} alive, day ${world.day}`);
  setTimeout(tick, world.weather.tickMs);
});
setInterval(() => Mem.save(world).catch(() => {}), 60000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await Mem.save(world).catch(() => {}); process.exit(0); });
