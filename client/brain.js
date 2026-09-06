// The brain runs here, in the owner's browser. BYOK, same provider set as PidgeyAssist:
// Gemini, OpenAI, Anthropic, OpenRouter, and Local (Ollama / LM Studio / any OpenAI-compatible URL).
// Keys live in localStorage only, one per provider, so switching never loses one.

import { SYSTEM, renderView } from './prompt.js';
export { SYSTEM, renderView };
const LS = 'playinggod.brain.v2';

export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini', keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
  },
  openai: {
    label: 'OpenAI', keyHint: 'sk-proj-…', keyUrl: 'https://platform.openai.com/api-keys',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o3-mini'],
  },
  anthropic: {
    label: 'Anthropic', keyHint: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys',
    models: ['claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-opus-5'],
  },
  openrouter: {
    label: 'OpenRouter', keyHint: 'sk-or-v1-…', keyUrl: 'https://openrouter.ai/keys',
    models: ['google/gemini-2.5-flash', 'google/gemini-2.5-flash-lite', 'openai/gpt-4o-mini', 'anthropic/claude-haiku-4.5', 'meta-llama/llama-3.3-70b-instruct', 'mistralai/mistral-large'],
  },
  local: {
    label: 'Local (Ollama / LM Studio / proxy)', keyHint: 'usually none', keyUrl: '',
    models: ['qwen3.5:latest', 'qwen3.6:latest', 'gemma4:e4b', 'gpt-oss:20b', 'llama3.2'],
    defaultBase: 'http://localhost:11434/v1',
  },
};

export function loadBrainConfig() {
  const d = { provider: 'local', model: '', baseUrl: PROVIDERS.local.defaultBase, keys: {} };
  try { return { ...d, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch { return d; }
}
export function saveBrainConfig(cfg) { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch {} }
export const keyFor = (cfg) => (cfg.keys || {})[cfg.provider] || '';

export function renderConsolidation(m) {
  return `You are ${m.name}. The day is over. You sit with your diary before sleep.
What happened today:
${m.events.length ? m.events.map(e => '- ' + e).join('\n') : '- Nothing much.'}
${m.diary?.length ? '\nYour last entries:\n' + m.diary.map(d => '- ' + d).join('\n') : ''}
${m.notes?.length ? '\nSomeone has written in the margin, in a hand that is not yours:\n' + m.notes.map(n => '- "' + n + '"').join('\n') : ''}
Who you thought you were this morning: ${m.selfSummary || '(no clear sense yet)'}

Answer with ONE JSON object and nothing else:
{"diary": "<tonight's entry, 2 to 4 plain sentences, first person, what happened and how it sat in your body>", "self": "<two sentences: who you are now and who you trust>"}`;
}

const withTimeout = (ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; };

async function post(url, headers, body, ms = 45000) {
  const t = withTimeout(ms);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: t.signal });
    if (!r.ok) { const err = await r.text(); const e = new Error(`${r.status}: ${err.slice(0, 200)}`); e.status = r.status; e.body = err; throw e; }
    return await r.json();
  } finally { t.done(); }
}

export async function callModel(cfg, system, user, { maxTokens = 300, json = false } = {}) {
  const key = keyFor(cfg);
  const model = cfg.model || PROVIDERS[cfg.provider]?.models[0];

  if (cfg.provider === 'anthropic') {
    const j = await post('https://api.anthropic.com/v1/messages',
      { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] });
    return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  }

  if (cfg.provider === 'gemini') {
    const body = { system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0.8, maxOutputTokens: maxTokens } };
    if (json) body.generationConfig.responseMimeType = 'application/json';
    const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key }, body);
    return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  }

  // Everything else speaks OpenAI's chat format.
  let base;
  const headers = {};
  if (cfg.provider === 'openai') base = 'https://api.openai.com/v1';
  else if (cfg.provider === 'openrouter') { base = 'https://openrouter.ai/api/v1'; headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'Playing God'; }
  else {
    base = (cfg.baseUrl || PROVIDERS.local.defaultBase).trim();
    if (!/^https?:\/\//.test(base)) base = 'http://' + base;
    base = base.replace(/\/(chat\/completions)?\/?$/, '');
  }
  headers.authorization = `Bearer ${key || 'ollama'}`;

  // Ollama: use its native chat so thinking can be turned off and JSON forced.
  // Thinking models otherwise spend the whole budget before the answer.
  if (/:11434(\/|$)/.test(base)) {
    const root = base.replace(/\/v1$/, '');
    const body = { model, stream: false, think: false, options: { num_predict: maxTokens, temperature: 0.8 }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (json) body.format = 'json';
    try {
      const j = await post(`${root}/api/chat`, headers, body, 90000);
      return j.message?.content || '';
    } catch (e) {
      if (!/think/i.test(e.body || '')) throw e;
      delete body.think;
      const j = await post(`${root}/api/chat`, headers, body, 90000);
      return j.message?.content || '';
    }
  }

  const body = { model, max_tokens: maxTokens, temperature: 0.8, stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  if (json && cfg.provider !== 'local') body.response_format = { type: 'json_object' };
  const j = await post(`${base}/chat/completions`, headers, body, cfg.provider === 'local' ? 90000 : 45000);
  return j.choices?.[0]?.message?.content || '';
}

// Ask the endpoint what models it has. Ollama, LM Studio, OpenAI and OpenRouter all answer this.
export async function listModels(cfg) {
  const key = keyFor(cfg);
  if (cfg.provider === 'gemini') {
    if (!key) return [];
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    if (!r.ok) return [];
    const j = await r.json();
    return (j.models || []).map(m => m.name.replace(/^models\//, '')).filter(n => /gemini/.test(n));
  }
  if (cfg.provider === 'anthropic') {
    if (!key) return [];
    const r = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.data || []).map(m => m.id);
  }
  let base;
  const headers = {};
  if (cfg.provider === 'openai') { if (!key) return []; base = 'https://api.openai.com/v1'; }
  else if (cfg.provider === 'openrouter') base = 'https://openrouter.ai/api/v1';
  else { base = (cfg.baseUrl || PROVIDERS.local.defaultBase).trim(); if (!/^https?:\/\//.test(base)) base = 'http://' + base; base = base.replace(/\/(chat\/completions)?\/?$/, ''); }
  if (key) headers.authorization = `Bearer ${key}`;
  const r = await fetch(`${base}/models`, { headers });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.data || []).map(m => m.id).filter(Boolean);
}

// Find the first balanced {...} that parses and looks like an action.
// Thinking models wrap reasoning in <think> tags; strip those first.
export function parseAction(text) {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').replace(/[“”]/g, '"');
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] !== '{') continue;
    let depth = 0, inStr = false;
    for (let j = i; j < clean.length; j++) {
      const ch = clean[j];
      if (inStr) { if (ch === '\\') j++; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) {
        const cand = clean.slice(i, j + 1);
        try { const o = JSON.parse(cand.replace(/,\s*([}\]])/g, '$1')); if (o && (o.action || o.type)) return o; } catch {}
        break;
      } }
    }
  }
  return null;
}

export async function decide(cfg, view) {
  const text = await callModel(cfg, SYSTEM, renderView(view), { maxTokens: 900, json: true });
  const parsed = parseAction(text);
  if (!parsed) throw new Error('no JSON in reply: ' + text.slice(0, 120));
  const action = parsed.action || parsed;
  return { action, thought: parsed.thought || '', raw: text };
}

// Returns { self, diary }. Falls back to using the whole reply as the diary if the JSON is missing.
export async function consolidate(cfg, msg) {
  const text = await callModel(cfg, 'You are a person writing in a diary at the end of a day. Plain words, first person, no lists. Reply with the JSON asked for.', renderConsolidation(msg), { maxTokens: 700, json: true });
  const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  try {
    const m = clean.match(/\{[\s\S]*\}/);
    const o = JSON.parse(m[0]);
    return { self: String(o.self || '').slice(0, 600), diary: String(o.diary || '').slice(0, 700) };
  } catch {
    return { self: '', diary: clean.replace(/^["']|["']$/g, '').slice(0, 700) };
  }
}
