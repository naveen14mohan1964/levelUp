// Gemini call layer: thinking level, timeouts and model fallback (fetch is stubbed: no real AI quota used).
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('gemini speed + resilience', () => {
  const realFetch = global.fetch;
  let calls;
  let g;
  const ok = (text) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
  const fail = (status, message) => ({ ok: false, status, json: async () => ({ error: { message } }) });

  let keepAlive;
  beforeEach(() => {
    // AbortSignal.timeout's timer doesn't keep Node alive (in the app the HTTP server does), so hold the loop open here.
    keepAlive = setInterval(() => {}, 1000);
    calls = [];
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
    process.env.GEMINI_MODEL = 'main-model';
    process.env.GEMINI_FALLBACK_MODELS = 'backup-model';
    delete process.env.GEMINI_THINKING;
    delete require.cache[require.resolve('../src/gemini')];
    g = require('../src/gemini');
  });
  afterEach(() => { global.fetch = realFetch; clearInterval(keepAlive); });

  const stub = (handler) => {
    global.fetch = async (url, init) => {
      const model = url.match(/models\/([^:]+):/)[1];
      const body = JSON.parse(init.body);
      calls.push({ model, thinking: body.generationConfig.thinkingConfig?.thinkingLevel ?? null });
      return handler(model, body, init);
    };
  };

  test('asks for a low thinking level by default (the main speed-up)', async () => {
    stub(() => ok('hi'));
    assert.equal(await g.generate([{ text: 'x' }]), 'hi');
    assert.deepEqual(calls, [{ model: 'main-model', thinking: 'low' }]);
  });

  test('callers can ask for more thinking (code review), or none', async () => {
    stub(() => ok('hi'));
    await g.generate([{ text: 'x' }], { thinking: 'medium' });
    await g.generate([{ text: 'x' }], { thinking: 'off' });
    assert.deepEqual(calls.map((c) => c.thinking), ['medium', null]);
  });

  test('a model that rejects thinkingLevel is retried without it, and remembered', async () => {
    stub((m, body) => (body.generationConfig.thinkingConfig ? fail(400, 'Thinking level LOW is not supported for this model.') : ok('fine')));
    assert.equal(await g.generate([{ text: 'x' }]), 'fine');
    assert.equal(await g.generate([{ text: 'y' }]), 'fine');
    assert.deepEqual(calls.map((c) => c.thinking), ['low', null, null], 'second call skips thinkingLevel straight away');
  });

  test('a stalled main model gives way to the backup instead of failing', async () => {
    stub((model, body, init) => (model === 'main-model'
      ? new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))))
      : ok('from backup')));
    const t = Date.now();
    assert.equal(await g.generate([{ text: 'x' }], { timeoutMs: 200 }), 'from backup');
    assert.deepEqual(calls.map((c) => c.model), ['main-model', 'backup-model'], 'no second wait on the stalled model');
    assert.ok(Date.now() - t < 2000);
  });

  test('quota on the main model falls through to the backup; quota everywhere gives a friendly message', async () => {
    stub((model) => (model === 'main-model' ? fail(429, 'Quota exceeded. Please retry in 2h10m.') : ok('backup ok')));
    assert.equal(await g.generate([{ text: 'x' }]), 'backup ok');
    stub(() => fail(429, 'Quota exceeded. Please retry in 2h10m.'));
    await assert.rejects(g.generate([{ text: 'x' }]), (e) => e.status === 429 && /free Gemini quota is used up/.test(e.message));
  });

  test('a network blip is retried', async () => {
    let n = 0;
    stub(() => { n++; if (n === 1) throw new TypeError('fetch failed'); return ok('second time'); });
    assert.equal(await g.generate([{ text: 'x' }]), 'second time');
  });
});
