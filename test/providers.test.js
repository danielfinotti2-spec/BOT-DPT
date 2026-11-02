import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { carregarConfig, validar } from '../src/config.js';
import { criarIA } from '../src/providers/ai/index.js';
import { criarClienteOpenAI } from '../src/providers/ai/openai-compatible.js';
import { criarApinex } from '../src/providers/ai/apinex.js';
import { criarAudio } from '../src/providers/audio/index.js';

// servidor falso no formato OpenAI; o "roteiro" define o que responder a cada chamada
function mock(roteiro) {
  const vistos = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      vistos.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(b || '{}') });
      const passo = typeof roteiro === 'function' ? roteiro(vistos.length) : roteiro;
      if (passo.delay) return setTimeout(() => res.end('{}'), passo.delay);
      res.writeHead(passo.status || 200, { 'Content-Type': 'application/json', ...(passo.headers || {}) });
      res.end(JSON.stringify(passo.body ?? { choices: [{ message: { content: 'olá!' } }] }));
    });
  });
  return new Promise((ok) => srv.listen(0, () => ok({ srv, vistos, url: `http://127.0.0.1:${srv.address().port}/v1` })));
}
const cli = (url, timeoutMs = 2000) => criarClienteOpenAI({ nome: 'teste', baseUrl: url, apiKey: 'SEGREDO123', timeoutMs });
const msgs = [{ role: 'user', content: 'oi' }];

test('sucesso: Bearer, endpoint e modelo corretos', async () => {
  const m = await mock({});
  const r = await cli(m.url).chat({ model: 'mistralai/mistral-large-2512', messages: msgs });
  assert.equal(r, 'olá!');
  assert.equal(m.vistos[0].url, '/v1/chat/completions');
  assert.equal(m.vistos[0].auth, 'Bearer SEGREDO123');
  assert.equal(m.vistos[0].body.model, 'mistralai/mistral-large-2512');
  m.srv.close();
});

test('remove <think> de modelos de raciocínio', async () => {
  const m = await mock({ body: { choices: [{ message: { content: '<think>x</think>Oi!' } }] } });
  assert.equal(await cli(m.url).chat({ model: 'a', messages: msgs }), 'Oi!');
  m.srv.close();
});

test('429: tenta de novo e funciona', async () => {
  const m = await mock((n) => (n === 1 ? { status: 429, headers: { 'retry-after': '0' }, body: {} } : {}));
  assert.equal(await cli(m.url).chat({ model: 'a', messages: msgs }), 'olá!');
  assert.equal(m.vistos.length, 2);
  m.srv.close();
});

test('429 persistente: erro tipo "limite"', async () => {
  const m = await mock({ status: 429, headers: { 'retry-after': '0' }, body: {} });
  await assert.rejects(cli(m.url).chat({ model: 'a', messages: msgs }), (e) => e.tipo === 'limite');
  m.srv.close();
});

test('402 e mensagem de saldo: erro tipo "credito"', async () => {
  for (const passo of [{ status: 402, body: {} }, { status: 403, body: { error: { message: 'Insufficient credits' } } }]) {
    const m = await mock(passo);
    await assert.rejects(cli(m.url).chat({ model: 'a', messages: msgs }), (e) => e.tipo === 'credito');
    m.srv.close();
  }
});

test('401 = auth, 404 = modelo, 500 = http, vazio = vazio', async () => {
  const casos = [[{ status: 401, body: {} }, 'auth'], [{ status: 404, body: {} }, 'modelo'], [{ status: 500, body: {} }, 'http'], [{ body: { choices: [] } }, 'vazio']];
  for (const [passo, tipo] of casos) {
    const m = await mock(passo);
    await assert.rejects(cli(m.url).chat({ model: 'a', messages: msgs }), (e) => e.tipo === tipo, tipo);
    m.srv.close();
  }
});

test('timeout', async () => {
  const m = await mock({ delay: 1500 });
  await assert.rejects(cli(m.url, 300).chat({ model: 'a', messages: msgs }), (e) => e.tipo === 'timeout');
  m.srv.close();
});

test('erros e logs nunca contêm a chave', async () => {
  const m = await mock({ status: 401, body: { error: { message: 'bad' } } });
  const logs = []; const orig = console.error; console.error = (...a) => logs.push(a.join(' '));
  const ia = criarIA({ ...carregarConfig(), ai: { provider: 'openai-compatible', baseUrl: m.url, apiKey: 'SEGREDO123', model: 'a', models: ['a'], timeoutMs: 1000 }, alt: {} });
  const r = await ia.conversar(msgs);
  console.error = orig;
  assert.equal(r, '');
  assert.ok(!logs.join('').includes('SEGREDO123') && !JSON.stringify(ia.status()).includes('SEGREDO123'));
  m.srv.close();
});

test('troca de modelo em tempo de execução (Mistral → Qwen) e persistência', async () => {
  const m = await mock({});
  const cfg = { ai: { provider: 'xkiro', baseUrl: m.url, apiKey: 'k', model: 'mistralai/mistral-large-2512', models: ['mistralai/mistral-large-2512', 'qwen/qwen3.7-flash:free'], timeoutMs: 1000 }, alt: {} };
  fs.rmSync('data/runtime.json', { force: true });
  const ia = criarIA(cfg);
  await ia.conversar(msgs); ia.trocarModelo('qwen/qwen3.7-flash:free'); await ia.conversar(msgs);
  assert.deepEqual(m.vistos.map((v) => v.body.model), ['mistralai/mistral-large-2512', 'qwen/qwen3.7-flash:free']);
  assert.throws(() => ia.trocarModelo('modelo/inexistente'));
  assert.equal(criarIA(cfg).status().modelo, 'qwen/qwen3.7-flash:free'); // sobrevive a reinício
  assert.ok(m.vistos[0].body.messages[0].content.includes('português brasileiro'));
  fs.rmSync('data/runtime.json', { force: true });
  m.srv.close();
});

test('fallback para provedor alternativo quando o principal falha', async () => {
  const a = await mock({ status: 500, body: {} }), b = await mock({ body: { choices: [{ message: { content: 'do alt' } }] } });
  const ia = criarIA({ ai: { provider: 'xkiro', baseUrl: a.url, apiKey: 'k', model: 'm', models: ['m'], timeoutMs: 1000 }, alt: { provider: 'openai-compatible', baseUrl: b.url, apiKey: 'k2', model: 'alt-m' } });
  const orig = console.error; console.error = () => {};
  assert.equal(await ia.conversar(msgs), 'do alt'); console.error = orig;
  a.srv.close(); b.srv.close();
});

test('APInex exige URL-base (não presume endpoint)', () => {
  assert.throws(() => criarApinex({ baseUrl: '', apiKey: 'k' }));
});

test('validação de configuração', () => {
  const base = { ai: { provider: 'xkiro', apiKey: 'k', baseUrl: '' }, evo: { url: 'u', key: 'k', inst: 'i' }, dono: '55', audio: { provider: 'none', groqKey: '' } };
  assert.deepEqual(validar(base), []);
  assert.ok(validar({ ...base, ai: { ...base.ai, apiKey: '' } }).length);
  assert.ok(validar({ ...base, ai: { ...base.ai, provider: 'apinex' } }).length);
  assert.ok(validar({ ...base, audio: { provider: 'groq', groqKey: '' } }).length);
});

test('sem Groq: áudio desligado sem erro', () => {
  assert.equal(criarAudio({ audio: { provider: 'none', groqKey: '' } }), null);
  assert.equal(criarAudio({ audio: { provider: 'groq', groqKey: '' } }), null);
});
