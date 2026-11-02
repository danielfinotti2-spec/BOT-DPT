const E = process.env;
const lista = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);

export function carregarConfig() {
  const cfg = {
    port: +E.PORT || 3000,
    ai: {
      provider: (E.AI_PROVIDER || 'xkiro').toLowerCase(),
      baseUrl: E.AI_BASE_URL || '',
      apiKey: E.AI_API_KEY || '',
      model: E.AI_MODEL || 'mistralai/mistral-large-2512',
      models: lista(E.AI_MODELS),
      timeoutMs: +E.AI_TIMEOUT_MS || 30000,
    },
    alt: {
      provider: (E.ALT_AI_PROVIDER || '').toLowerCase(),
      baseUrl: E.ALT_AI_BASE_URL || '',
      apiKey: E.ALT_AI_API_KEY || '',
      model: E.ALT_AI_MODEL || '',
    },
    evo: { url: E.EVOLUTION_URL, key: E.EVOLUTION_KEY, inst: E.INSTANCE },
    dono: E.DONO_NUMERO,
    audio: { provider: (E.AUDIO_PROVIDER || 'none').toLowerCase(), groqKey: E.GROQ_KEY || '' },
    atend: E.ATENDIMENTO !== '0',
    prosp: E.PROSPECCAO === '1',
    estilo: E.ESTILO || 'amigavel',
    ini: +E.HORA_INICIO || 9,
    fim: +E.HORA_FIM || 18,
    limite: +E.LIMITE_DIA || 30,
  };
  if (!cfg.ai.models.includes(cfg.ai.model)) cfg.ai.models.unshift(cfg.ai.model);
  return cfg;
}

export function validar(cfg) {
  const erros = [];
  if (!cfg.ai.apiKey) erros.push('AI_API_KEY não definida');
  if (!['xkiro', 'apinex', 'openai-compatible'].includes(cfg.ai.provider)) erros.push('AI_PROVIDER inválido (use xkiro, apinex ou openai-compatible)');
  if (['apinex', 'openai-compatible'].includes(cfg.ai.provider) && !cfg.ai.baseUrl) erros.push(`AI_BASE_URL é obrigatória para ${cfg.ai.provider}`);
  if (!cfg.evo.url || !cfg.evo.key || !cfg.evo.inst) erros.push('EVOLUTION_URL, EVOLUTION_KEY e INSTANCE são obrigatórias');
  if (!cfg.dono) erros.push('DONO_NUMERO não definido');
  if (cfg.audio.provider === 'groq' && !cfg.audio.groqKey) erros.push('AUDIO_PROVIDER=groq exige GROQ_KEY (ou use AUDIO_PROVIDER=none)');
  return erros;
}
