// Tests the AI connection and model list against a fake local provider.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DATA_DIR } from './config.js';
import { connect, disconnect, listModels, publicInfo } from './ai.js';

const srv = http.createServer((req, res) => {
  let b = ''; req.on('data', (d) => (b += d)).on('end', () => {
    const body = b ? JSON.parse(b) : {};
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
    const u = req.url;
    if (u.endsWith('/models')) {
      if (u.startsWith('/empty/')) return send(200, { data: [] });
      if (u.startsWith('/down/')) return send(401, { error: { message: 'bad key' } });
      return send(200, { data: [
        { id: 'vendor/plain-chat', pricing: { prompt: '0.001', completion: '0.002' }, supported_parameters: ['temperature'] },
        { id: 'vendor/thinker:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['reasoning'] },
        { id: 'vendor/step-free' },
        { id: 'models/gemini-2.5-flash' },
      ] });
    }
    if (u.startsWith('/think/')) return send(200, { choices: [{ message: { content: body.max_tokens < 1000 ? '' : 'OK' }, finish_reason: body.max_tokens < 1000 ? 'length' : 'stop' }] });
    if (u.startsWith('/stuck/')) return send(200, { choices: [{ message: { content: '' }, finish_reason: 'length' }] });
    if (u.startsWith('/parts/')) return send(200, { choices: [{ message: { content: [{ type: 'text', text: 'OK' }] }, finish_reason: 'stop' }] });
    if (u.startsWith('/plain/')) return send(200, { choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] });
    if (u.startsWith('/badmodel/')) return send(404, { error: { message: 'model not found' } });
    if (u.startsWith('/html/')) return send(200, '<html>nope</html>');
    send(404, {});
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}`;
const mk = (p) => ({ kind: 'openai', preset: 'agent', baseUrl: base + p, model: 'm' });

try {
  // connect cases
  await connect(mk('/plain/v1')); disconnect();
  await connect(mk('/think/v1')); disconnect();            // empty at first, works with more room
  await connect(mk('/parts/v1')); disconnect();
  await assert.rejects(connect(mk('/stuck/v1')), /thinking|no text/);
  await assert.rejects(connect(mk('/badmodel/v1')), /model not found/);
  await assert.rejects(connect(mk('/html/v1')), /Unexpected reply/);

  // model list
  const ms = await listModels({ kind: 'openai', baseUrl: base + '/plain/v1', apiKey: 'k' });
  assert.equal(ms.length, 4);
  assert.ok(ms[0].free && ms[1].free, 'free models sort first');
  assert.ok(ms.find((m) => m.id === 'vendor/thinker:free').thinks, 'reasoning flag detected');
  assert.ok(ms.find((m) => m.id === 'vendor/plain-chat') && !ms.find((m) => m.id === 'vendor/plain-chat').free, 'paid model is not free');
  assert.ok(ms.find((m) => m.id === 'vendor/step-free').free, '-free suffix detected');
  await assert.rejects(listModels({ kind: 'openai', baseUrl: base + '/empty/v1' }), /did not return a model list/);
  await assert.rejects(listModels({ kind: 'openai', baseUrl: base + '/down/v1' }), /bad key/);
  await assert.rejects(listModels({ kind: 'anthropic' }), /key/);

  // change model later without retyping the key
  await connect({ ...mk('/plain/v1'), apiKey: 'secret' });
  await connect({ useSaved: true, model: 'other-model' });
  assert.equal(publicInfo().model, 'other-model');
  assert.equal(publicInfo().hasKey, true);
  const again = await listModels({ useSaved: true });
  assert.equal(again.length, 4);
  disconnect();
  console.log('all AI tests passed');
} finally {
  srv.close();
  try { fs.unlinkSync(path.join(DATA_DIR, 'ai.json')); } catch {}
}
