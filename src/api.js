async function j(url, opts) {
  const r = await fetch(url, opts);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Server error ${r.status}`);
  return body;
}
export const fetchState = (focus = []) => j(`/api/state${focus.length ? `?focus=${focus.join(',')}` : ''}`);
const post = (url, data) => j(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data || {}) });
export const connectAI = (cfg) => post('/api/ai/connect', cfg);
export const disconnectAI = () => post('/api/ai/disconnect');
export const saveFinnhub = (finnhub) => post('/api/keys', { finnhub });
export const listModels = (cfg) => post('/api/ai/models', cfg);
