import fs from 'fs';
import { dirname } from 'path';
import { criarXkiro } from './xkiro.js';
import { criarApinex } from './apinex.js';
import { criarClienteOpenAI } from './openai-compatible.js';

const FABRICAS = {
  xkiro: criarXkiro,
  apinex: criarApinex,
  'openai-compatible': (o) => criarClienteOpenAI({ nome: 'openai-compatible', ...o }),
};
const RUNTIME = () => process.env.ATENDE_ARQ_RUNTIME || 'data/runtime.json'; // modelo escolhido em tempo de execução (sem reiniciar)

export function criarIA(cfg) {
  const lerRuntime = () => { try { return JSON.parse(fs.readFileSync(RUNTIME(), 'utf8')); } catch { return {}; } };
  const rt = lerRuntime();
  const estado = { model: rt.model || cfg.ai.model, ultimoErro: null };

  const principal = FABRICAS[cfg.ai.provider]({ baseUrl: cfg.ai.baseUrl, apiKey: cfg.ai.apiKey, timeoutMs: cfg.ai.timeoutMs });
  let alt = null, altModel = cfg.alt.model;
  if (cfg.alt.apiKey && cfg.alt.provider && FABRICAS[cfg.alt.provider] && altModel) {
    try { alt = FABRICAS[cfg.alt.provider]({ baseUrl: cfg.alt.baseUrl, apiKey: cfg.alt.apiKey, timeoutMs: cfg.ai.timeoutMs }); }
    catch (e) { console.warn('[ia] provedor alternativo desativado:', e.message); }
  }

  const SISTEMA_PT = 'Responda sempre em português brasileiro.';

  // Única função de conversação usada pelo restante do bot.
  async function conversar(messages, opts = {}) {
    const msgs = messages.map((m, i) => (i === 0 && m.role === 'system' ? { ...m, content: m.content + '\n' + SISTEMA_PT } : m));
    if (msgs[0]?.role !== 'system') msgs.unshift({ role: 'system', content: SISTEMA_PT });
    try {
      const r = await principal.chat({ model: estado.model, messages: msgs, ...opts });
      estado.ultimoErro = null; return r;
    } catch (e) {
      estado.ultimoErro = { tipo: e.tipo, msg: e.message, em: new Date().toISOString() };
      console.error('[ia]', e.message);
      if (alt) {
        try { return await alt.chat({ model: altModel, messages: msgs, ...opts }); }
        catch (e2) { console.error('[ia-alt]', e2.message); estado.ultimoErro = { tipo: e2.tipo, msg: e2.message, em: new Date().toISOString() }; }
      }
      return ''; // o bot continua vivo; quem chama decide o que fazer com resposta vazia
    }
  }

  function trocarModelo(m) {
    if (!cfg.ai.models.includes(m)) throw new Error('Modelo fora da lista AI_MODELS');
    estado.model = m;
    fs.mkdirSync(dirname(RUNTIME()), { recursive: true });
    fs.writeFileSync(RUNTIME(), JSON.stringify({ model: m }));
  }

  async function testar() {
    const t0 = Date.now();
    const r = await principal.chat({ model: estado.model, messages: [{ role: 'user', content: 'Responda apenas: ok' }], maxTokens: 20 });
    return { ok: true, ms: Date.now() - t0, amostra: r.slice(0, 40) };
  }

  return {
    conversar, trocarModelo, testar,
    status: () => ({ provedor: principal.nome, modelo: estado.model, alternativo: alt ? alt.nome : null, modelos: cfg.ai.models, ultimoErro: estado.ultimoErro }),
  };
}
