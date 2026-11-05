import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const FILE = path.join(DATA_DIR, 'ai.json');
let conf = null;
try { conf = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
let lastError = '';
let failures = 0;
let pausedUntil = 0;

export const aiConnected = () => !!conf?.verified;
export const publicInfo = () => ({
  connected: aiConnected(), kind: conf?.kind || null, preset: conf?.preset || null,
  baseUrl: conf?.baseUrl || '', model: conf?.model || '', hasKey: !!conf?.apiKey, lastError,
  paused: Date.now() < pausedUntil,
});

// Pull text out of a reply, whether content is a string or a list of parts.
function textOf(msg) {
  const c = msg?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('');
  return '';
}
const clean = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();

async function callOnce(c, system, user, maxTokens) {
  if (c.kind === 'anthropic') {
    const base = (c.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    const r = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': c.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: c.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      signal: AbortSignal.timeout(45000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
    return { text: clean((j.content || []).map((b) => b.text || '').join('')), finish: j.stop_reason };
  }
  // Anything that speaks the OpenAI chat format: OpenRouter, Gemini, Groq, Kilo, Ollama, LM Studio, most agents.
  const base = c.baseUrl.replace(/\/+$/, '');
  const headers = { 'content-type': 'application/json' };
  if (c.apiKey) headers.authorization = `Bearer ${c.apiKey}`;
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers,
    body: JSON.stringify({ model: c.model, temperature: 0.2, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    signal: AbortSignal.timeout(45000),
  });
  const raw = await r.text();
  let j = {};
  try { j = JSON.parse(raw); } catch {}
  if (!r.ok) {
    const m = j?.error?.message || (typeof j?.error === 'string' ? j.error : '') || j?.message || raw.slice(0, 160);
    throw new Error(`The provider said: ${m || 'HTTP ' + r.status}`);
  }
  if (!j.choices) throw new Error(`Unexpected reply. Is the address right? It should end before /chat/completions. Got: ${raw.slice(0, 120)}`);
  const ch = j.choices[0] || {};
  return { text: clean(textOf(ch.message)), finish: ch.finish_reason };
}

// "Thinking" models spend tokens on reasoning first. If the answer got cut off, retry with more room.
async function call(c, system, user, maxTokens = 400) {
  let res = await callOnce(c, system, user, maxTokens);
  if (!res.text && (res.finish === 'length' || res.finish === 'max_tokens')) res = await callOnce(c, system, user, Math.min(maxTokens * 5, 3000));
  if (!res.text) {
    const why = res.finish === 'length' || res.finish === 'max_tokens'
      ? 'It ran out of room while thinking, even with extra room. Try a model that does not "think" (a plain chat or instruct model).'
      : `It stopped with reason "${res.finish || 'unknown'}". Try another model.`;
    throw new Error(`The AI replied, but with no text. ${why}`);
  }
  return res.text;
}

// Try the settings first. Save only if the test works.
export async function connect(next) {
  if (next.useSaved && conf) next = { ...conf, ...next, baseUrl: conf.baseUrl, apiKey: conf.apiKey, kind: conf.kind, preset: conf.preset };
  const c = {
    kind: next.kind === 'anthropic' ? 'anthropic' : 'openai',
    preset: String(next.preset || 'custom'),
    baseUrl: String(next.baseUrl || '').trim(),
    apiKey: String(next.apiKey || '').trim(),
    model: String(next.model || '').trim(),
  };
  if (!c.model) throw new Error('Pick a model name.');
  if (c.kind === 'openai' && !c.baseUrl) throw new Error('Add the API address.');
  if (c.kind === 'anthropic' && !c.apiKey) throw new Error('Paste your API key.');
  await call(c, 'Reply with the single word OK.', 'Test', 400);
  conf = { ...c, verified: true };
  fs.writeFileSync(FILE, JSON.stringify(conf, null, 2));
  lastError = ''; failures = 0; pausedUntil = 0;
  return publicInfo();
}

// Ask the provider which models it offers (OpenAI-style GET /models, or Anthropic's /v1/models).
const FREE_RE = /(:|-)free$/i;
const THINK_RE = /think|reason|(^|[/-])r1\b|\bo[134]\b/i;
export async function listModels(src) {
  const saved = src.useSaved && conf ? conf : null;
  const kind = (saved?.kind || src.kind) === 'anthropic' ? 'anthropic' : 'openai';
  const apiKey = String(saved?.apiKey ?? src.apiKey ?? '').trim();
  const baseUrl = String(saved?.baseUrl ?? src.baseUrl ?? '').trim().replace(/\/+$/, '');
  let r;
  if (kind === 'anthropic') {
    if (!apiKey) throw new Error('Paste your API key to see the models.');
    r = await fetch(`${baseUrl || 'https://api.anthropic.com'}/v1/models?limit=100`, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(15000) });
  } else {
    if (!baseUrl) throw new Error('Add the API address to see the models.');
    const headers = {};
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    r = await fetch(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(15000) });
  }
  const raw = await r.text();
  let j = {};
  try { j = JSON.parse(raw); } catch {}
  if (!r.ok) throw new Error(`The provider said: ${j?.error?.message || j?.message || raw.slice(0, 120) || 'HTTP ' + r.status}`);
  const arr = Array.isArray(j) ? j : j.data || j.models || [];
  if (!Array.isArray(arr) || !arr.length) throw new Error('This address did not return a model list.');
  const gemini = /generativelanguage\.googleapis\.com/.test(baseUrl);
  const out = arr.map((m) => {
    let id = String(typeof m === 'string' ? m : m.id || m.name || '');
    if (gemini) id = id.replace(/^models\//, '');
    const p = m.pricing;
    const priced = p && p.prompt !== undefined && p.completion !== undefined;
    const free = FREE_RE.test(id) || (priced && Number(p.prompt) === 0 && Number(p.completion) === 0);
    const sp = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
    const thinks = sp.includes('reasoning') || sp.includes('include_reasoning') || THINK_RE.test(id);
    return { id, name: m.display_name || m.name || id, free: !!free, thinks };
  }).filter((m) => m.id);
  out.sort((a, b) => Number(b.free) - Number(a.free) || a.id.localeCompare(b.id));
  return out.slice(0, 600);
}

export function disconnect() {
  conf = null; try { fs.unlinkSync(FILE); } catch {}
  cache.clear(); pending.clear(); brief.text = '';
  return publicInfo();
}

// Guard: the AI may reword, never add facts. Reject output with new digits.
export function safeReword(input, output) {
  const out = String(output || '').split('\n')[0].trim().replace(/^["']|["']$/g, '');
  if (!out || out.length > 220) return null;
  const digits = (s) => (s.match(/\d+/g) || []).join(',');
  if (digits(out) && digits(out) !== digits(input)) return null;
  return out;
}

async function callRetry(c, system, user, max) {
  try { return await call(c, system, user, max); }
  catch (e) {
    if (!/rate|429|provider returned error|overload|temporar|try again|busy/i.test(e.message)) throw e;
    await new Promise((r) => setTimeout(r, 5000));
    return call(c, system, user, max);
  }
}

const cache = new Map();   // key -> text
const pending = new Set();
const queue = [];
let running = false;
export const aiWhyCache = cache;

export function requestWhy(items) {
  if (!aiConnected()) return;
  for (const it of items) {
    if (cache.has(it.key) || pending.has(it.key)) continue;
    pending.add(it.key);
    queue.push(it);
  }
  pump();
}

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    if (!aiConnected() || Date.now() < pausedUntil) { queue.length = 0; pending.clear(); break; }
    const it = queue.shift();
    try {
      const out = await callRetry(conf,
        'You rewrite one trading note in plain, simple English. Max 22 words. Keep every fact. Do not add facts, numbers, names, or advice. Output only the sentence.',
        it.text, 400);
      const safe = safeReword(it.text, out);
      cache.set(it.key, safe || it.text);
      failures = 0; lastError = '';
    } catch (e) {
      lastError = e.message; failures += 1;
      if (failures >= 3) { pausedUntil = Date.now() + 5 * 60000; failures = 0; }
    }
    pending.delete(it.key);
    await new Promise((r) => setTimeout(r, 1500));
  }
  running = false;
}

const brief = { text: '', ts: 0, busy: false, sig: '' };
export const getBrief = () => brief.text;
export async function refreshBrief(lines) {
  if (!aiConnected() || brief.busy || Date.now() < pausedUntil) return;
  const sig = lines.join('|');
  if (sig === brief.sig && Date.now() - brief.ts < 300000) return;
  if (!lines.length) return;
  brief.busy = true;
  try {
    const out = await callRetry(conf,
      'You write a two-sentence market brief in plain, simple English from the notes given. Say what is happening and which assets are most exposed. Do not add facts or numbers. No promises. Output only the two sentences.',
      lines.join('\n'), 500);
    const t = String(out || '').replace(/\s+/g, ' ').trim();
    if (t && t.length < 400) { brief.text = t; brief.ts = Date.now(); brief.sig = sig; }
    lastError = ''; failures = 0;
  } catch (e) {
    lastError = e.message; failures += 1;
    if (failures >= 3) { pausedUntil = Date.now() + 5 * 60000; failures = 0; }
  }
  brief.busy = false;
}
