import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { connectAI, disconnectAI, saveFinnhub, listModels } from '../api.js';

const PRESETS = [
  { id: 'gemini', name: 'Google Gemini', tag: 'Free', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey', needsKey: true },
  { id: 'openrouter', name: 'OpenRouter', tag: 'Free models', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys', needsKey: true, hint: 'Any model name that ends in :free costs nothing.' },
  { id: 'groq', name: 'Groq', tag: 'Free tier', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys', needsKey: true },
  { id: 'local', name: 'Local model', tag: 'Free and private', kind: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', needsKey: false, hint: 'Works with Ollama. For LM Studio use http://localhost:1234/v1.' },
  { id: 'agent', name: 'My own agent', tag: 'Hermes, Kilo, Paseo, any clone', kind: 'openai', baseUrl: '', model: '', needsKey: false, hint: 'Paste the address of any endpoint that speaks the OpenAI chat format. Key is optional.' },
  { id: 'anthropic', name: 'Claude', tag: 'Paid', kind: 'anthropic', baseUrl: '', model: 'claude-haiku-5-5', keyUrl: 'https://console.anthropic.com/settings/keys', needsKey: true },
];

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-mute">{label}</span>
      {children}
    </label>
  );
}
const inputCls = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-mute/60 focus:border-accent focus:outline-none';


// Loads the provider's model list and lets you search it. Falls back to typing if the list cannot load.
function ModelPicker({ value, onChange, source }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [freeOnly, setFreeOnly] = useState(true);
  const key = JSON.stringify([source.kind, source.baseUrl, source.apiKey, source.useSaved, source.ready]);

  useEffect(() => {
    let dead = false;
    setList(null); setErr('');
    if (!source.ready) return;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const r = await listModels(source); if (!dead) setList(r.models); }
      catch (e) { if (!dead) setErr(e.message); }
      if (!dead) setLoading(false);
    }, 600);
    return () => { dead = true; clearTimeout(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const freeCount = list ? list.filter((m) => m.free).length : 0;
  const shown = (list || []).filter((m) => (!freeOnly || freeCount === 0 || m.free) && m.id.toLowerCase().includes(q.trim().toLowerCase()));

  if (!source.ready) return (
    <Field label="Model"><p className="rounded-lg border border-dashed border-line px-3 py-2.5 text-xs text-mute">{source.waitText}</p></Field>
  );
  if (loading) return <Field label="Model"><p className="px-1 py-2 text-xs text-mute">Loading the model list...</p></Field>;
  if (err || !list) return (
    <Field label="Model name">
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type the model name" />
      {err && <p className="mt-1.5 text-xs text-warn">Could not load the list. {err} You can type the name instead.</p>}
    </Field>
  );
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-mute">
        <span>Model ({list.length} found)</span>
        {freeCount > 0 && (
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> Free only ({freeCount})
          </label>
        )}
      </div>
      <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models" aria-label="Search models" />
      <ul role="listbox" aria-label="Models" className="thin-scroll mt-1.5 max-h-[188px] overflow-y-auto rounded-lg border border-line bg-bg">
        {shown.length === 0 && <li className="px-3 py-3 text-xs text-mute">No model matches that search.</li>}
        {shown.map((m) => {
          const on = m.id === value;
          return (
            <li key={m.id} role="option" aria-selected={on}>
              <button type="button" onClick={() => onChange(m.id)} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] ${on ? 'bg-accent/15 text-ink' : 'text-mute hover:bg-panel hover:text-ink'}`}>
                <span className="min-w-0 flex-1 truncate">{m.id}</span>
                {m.thinks && <span title="Thinks before it answers. Slower, and can fail on free plans." className="shrink-0 rounded bg-warn/15 px-1.5 text-[10px] text-warn">thinks</span>}
                {m.free && <span className="shrink-0 rounded bg-up/15 px-1.5 text-[10px] text-up">free</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-xs text-mute">Chosen: <span className="text-ink">{value || 'none yet'}</span>. Models marked "thinks" are slower. A plain chat model is the safest pick.</p>
    </div>
  );
}

export default function Setup({ open, state, onClose, onChanged }) {
  const ai = state?.ai;
  const [pid, setPid] = useState('gemini');
  const preset = PRESETS.find((p) => p.id === pid);
  const [form, setForm] = useState({ apiKey: '', model: preset.model, baseUrl: preset.baseUrl });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {ok, text}
  const [changing, setChanging] = useState(false);
  const [fkey, setFkey] = useState('');
  const [fmsg, setFmsg] = useState(null);

  useEffect(() => { setForm({ apiKey: '', model: preset.model, baseUrl: preset.baseUrl }); setMsg(null); setChanging(false); }, [pid]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function connect() {
    setBusy(true); setMsg(null);
    try {
      await connectAI(changing ? { useSaved: true, model: form.model } : { preset: preset.id, kind: preset.kind, ...form });
      setMsg({ ok: true, text: 'Connected. Your signals will be reworded in plain English within a minute.' });
      setChanging(false);
      onChanged();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy(false);
  }
  async function disconnect() { await disconnectAI(); setMsg(null); onChanged(); }
  async function saveKey() {
    setFmsg(null);
    try { await saveFinnhub(fkey); setFmsg({ ok: true, text: 'Live prices are on.' }); setFkey(''); onChanged(); }
    catch (e) { setFmsg({ ok: false, text: e.message }); }
  }

  const showAddress = preset.id === 'local' || preset.id === 'agent';

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div role="dialog" aria-modal="true" aria-label="Set up Foxhole" initial={{ y: 16, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ duration: 0.2 }}
            className="thin-scroll max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-line bg-panel p-6">
            <h2 className="text-lg font-semibold tracking-tight">Connect an AI</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-mute">
              Foxhole already works without one. Connect one and every signal is explained in plain words, and a two-sentence brief of what matters now shows up at the top. Free options take about a minute.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-mute">The AI only rewords. The rules still decide every buy, sell, and watch, and the AI cannot add numbers or facts.</p>

            {ai?.connected && !changing ? (
              <div className="mt-5 flex items-center justify-between rounded-xl border border-accent/50 bg-accent/10 px-4 py-3">
                <div className="min-w-0 text-sm"><span className="text-accent">Connected</span> <span className="ml-1 break-all text-mute">{ai.model}</span></div>
                <div className="flex shrink-0 gap-4 pl-3 text-xs">
                  <button onClick={() => { setForm({ ...form, model: ai.model }); setMsg(null); setChanging(true); }} className="text-accent underline">Change model</button>
                  <button onClick={disconnect} className="text-mute underline hover:text-ink">Disconnect</button>
                </div>
              </div>
            ) : (
              <>
                {!changing && (
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    {PRESETS.map((p) => (
                      <button key={p.id} onClick={() => setPid(p.id)} aria-pressed={pid === p.id}
                        className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${pid === p.id ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/50'}`}>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-[11px] text-mute">{p.tag}</div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  {!changing && preset.keyUrl && (
                    <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="inline-block text-xs text-accent underline">
                      Get a key from {preset.name}
                    </a>
                  )}
                  {!changing && showAddress && <Field label="API address"><input className={inputCls} value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="http://localhost:8080/v1" /></Field>}
                  {!changing && <Field label={preset.needsKey ? 'API key' : 'API key (optional)'}><input className={inputCls} type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="Paste here" /></Field>}
                  <ModelPicker
                    value={form.model} onChange={(m) => setForm({ ...form, model: m })}
                    source={changing
                      ? { useSaved: true, ready: true }
                      : { kind: preset.kind, baseUrl: form.baseUrl, apiKey: form.apiKey, ready: preset.needsKey ? !!form.apiKey.trim() : !!form.baseUrl.trim(), waitText: preset.needsKey ? 'Paste your key above and the model list loads here.' : 'Add the API address above and the model list loads here.' }}
                  />
                  {!changing && preset.hint && <p className="text-xs text-mute">{preset.hint}</p>}
                  <div className="flex gap-2">
                    {changing && <button onClick={() => { setChanging(false); setMsg(null); }} className="rounded-lg border border-line px-4 text-sm text-mute hover:text-ink">Cancel</button>}
                    <button onClick={connect} disabled={busy || !form.model.trim()} className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-bg hover:brightness-110 disabled:opacity-60">
                      {busy ? 'Testing...' : changing ? 'Use this model' : 'Connect and test'}
                    </button>
                  </div>
                </div>
              </>
            )}
            {msg && <p className={`mt-3 text-sm ${msg.ok ? 'text-up' : 'text-down'}`}>{msg.text}</p>}

            <div className="mt-7 border-t border-line pt-5">
              <h3 className="text-sm font-medium">Live prices</h3>
              <p className="mt-1 text-xs leading-relaxed text-mute">
                {state?.keys?.finnhub ? 'Live stock and commodity prices are on.' : 'Prices are demo values until you add a free Finnhub key. Signal track records only count live prices.'}
              </p>
              {!state?.keys?.finnhub && (
                <div className="mt-3 flex gap-2">
                  <input className={inputCls} type="password" autoComplete="off" value={fkey} onChange={(e) => setFkey(e.target.value)} placeholder="Finnhub API key" />
                  <button onClick={saveKey} className="shrink-0 rounded-lg border border-accent px-4 text-sm text-accent hover:bg-accent/10">Save</button>
                </div>
              )}
              {!state?.keys?.finnhub && <a href="https://finnhub.io/register" target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-accent underline">Get a free Finnhub key</a>}
              {fmsg && <p className={`mt-2 text-sm ${fmsg.ok ? 'text-up' : 'text-down'}`}>{fmsg.text}</p>}
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-mute hover:text-ink">{ai?.connected ? 'Done' : 'Skip for now'}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
