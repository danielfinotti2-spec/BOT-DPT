// Cliente genérico do formato OpenAI Chat Completions (Authorization: Bearer).
export class AIError extends Error {
  constructor(tipo, mensagem, status) { super(mensagem); this.tipo = tipo; this.status = status; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SEM_CREDITO = /insufficient|credit|balance|quota|saldo|billing/i;

export function criarClienteOpenAI({ nome, baseUrl, apiKey, timeoutMs = 30000 }) {
  const base = baseUrl.replace(/\/+$/, '');

  async function chat({ model, messages, temperature = 0.7, maxTokens = 400 }, tentativa = 0) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let r, corpo;
    try {
      r = await fetch(`${base}/chat/completions`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      });
      corpo = await r.json().catch(() => ({}));
    } catch (e) {
      if (e.name === 'AbortError') throw new AIError('timeout', `${nome}: tempo esgotado (${timeoutMs}ms)`);
      throw new AIError('rede', `${nome}: falha de conexão`);
    } finally { clearTimeout(t); }

    if (r.status === 429) {
      if (tentativa < 2) {
        const ra = +r.headers.get('retry-after');
        await sleep((ra > 0 ? Math.min(ra, 15) : 2 ** tentativa * 2) * 1000);
        return chat({ model, messages, temperature, maxTokens }, tentativa + 1);
      }
      throw new AIError('limite', `${nome}: limite de requisições (429)`, 429);
    }
    const msgApi = String(corpo?.error?.message || corpo?.message || '');
    if (r.status === 402 || (r.status === 403 && SEM_CREDITO.test(msgApi)) || SEM_CREDITO.test(msgApi))
      throw new AIError('credito', `${nome}: saldo/créditos insuficientes`, r.status);
    if (r.status === 401 || r.status === 403) throw new AIError('auth', `${nome}: chave inválida ou sem permissão (${r.status})`, r.status);
    if (r.status === 404 || r.status === 400) throw new AIError('modelo', `${nome}: requisição/modelo inválido (${r.status}) ${msgApi.slice(0, 120)}`, r.status);
    if (!r.ok) throw new AIError('http', `${nome}: erro HTTP ${r.status}`, r.status);

    const texto = corpo?.choices?.[0]?.message?.content;
    if (typeof texto !== 'string' || !texto.trim()) throw new AIError('vazio', `${nome}: resposta vazia`);
    // alguns modelos de raciocínio devolvem <think>...</think>
    return texto.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  return { nome, chat };
}
