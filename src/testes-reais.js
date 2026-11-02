// Testes reais das chaves que o usuário cola no painel. Só diz "ok" se o provedor respondeu de verdade.
const SEM_CREDITO = /insufficient|credit|balance|quota|saldo|billing|top up/i;

async function pedir(url, opts, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    const txt = await r.text();
    let json = {}; try { json = txt ? JSON.parse(txt) : {}; } catch { /* não-JSON */ }
    return { ok: r.ok, status: r.status, json, txt };
  } catch (e) {
    if (e.name === 'AbortError') return { ok: false, status: 0, erro: 'timeout', txt: 'sem resposta (tempo esgotado)' };
    return { ok: false, status: 0, erro: 'rede', txt: 'não foi possível conectar' };
  } finally { clearTimeout(t); }
}

const erroDe = (r) => {
  const m = r.json?.error?.message || r.json?.message || r.erro;
  if (r.status === 401 || r.status === 403) return 'chave inválida ou sem permissão';
  if (r.status === 402 || SEM_CREDITO.test(String(m))) return 'a chave é válida, mas a conta está sem saldo';
  if (r.status === 404) return 'endereço ou modelo não encontrado';
  if (r.status === 429) return 'chave ok, mas atingiu o limite de requisições agora';
  return m ? String(m).slice(0, 140) : `falhou (HTTP ${r.status})`;
};

export async function testarIA({ baseUrl, apiKey, model }) {
  if (!baseUrl) return { ok: false, mensagem: 'informe o endereço (base URL)' };
  if (!apiKey) return { ok: false, mensagem: 'informe a chave' };
  const base = baseUrl.replace(/\/+$/, '');
  const lista = await pedir(`${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  let modelos = Array.isArray(lista.json?.data) ? lista.json.data.map((m) => m.id) : [];
  if (!lista.ok && lista.status !== 404) return { ok: false, mensagem: erroDe(lista) };
  if (!model && modelos.length) model = modelos[0];
  if (!model) return { ok: false, mensagem: 'endereço ok, mas não consegui listar modelos — informe o modelo manualmente' };
  const t0 = Date.now();
  const r = await pedir(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Responda só: ok' }], max_tokens: 12 }),
  });
  const ms = Date.now() - t0;
  if (!r.ok) {
    // mesmo com falha no teste, se a lista de modelos funcionou ainda dá para seguir com outro modelo
    const gratis = modelos.filter((m) => /free/i.test(m)).slice(0, 40);
    return { ok: false, mensagem: erroDe(r), modelos, gratuitos: gratis };
  }
  return { ok: true, mensagem: `respondendo em ${ms} ms`, modelos, modelo: model };
}

export async function testarGroq({ groqKey }) {
  if (!groqKey) return { ok: false, mensagem: 'informe a chave' };
  const r = await pedir('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${groqKey}` } });
  if (!r.ok) return { ok: false, mensagem: erroDe(r) };
  return { ok: true, mensagem: 'chave de áudio válida (transcrição ligada)' };
}

export async function testarEvolution({ evolutionUrl, evolutionKey }) {
  if (!evolutionUrl) return { ok: false, mensagem: 'informe o endereço da Evolution API' };
  if (!evolutionKey) return { ok: false, mensagem: 'informe a chave da Evolution API' };
  const r = await pedir(`${evolutionUrl.replace(/\/+$/, '')}/instance/fetchInstances`, { headers: { apikey: evolutionKey } });
  if (!r.ok) return { ok: false, mensagem: erroDe(r) };
  const n = Array.isArray(r.json) ? r.json.length : 0;
  return { ok: true, mensagem: `conectado (${n} instância${n === 1 ? '' : 's'} encontrada${n === 1 ? '' : 's'})` };
}
