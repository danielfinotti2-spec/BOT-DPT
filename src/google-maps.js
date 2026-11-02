// Busca empresas no Google Maps (Places API — New) e pede o telefone de cada uma.
// Só roda quando o dono clica em buscar e tem a chave cadastrada: nada aqui é automático.
const ENDERECO = process.env.ATENDE_GOOGLE_URL || 'https://places.googleapis.com/v1/places:searchText'; // env só para testes

const CAMPOS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
].join(',');

async function chamar(apiKey, corpo, campos) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  let r;
  try {
    r = await fetch(ENDERECO, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': campos },
      body: JSON.stringify(corpo),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('O Google não respondeu a tempo. Tente de novo.');
    throw new Error('Não consegui falar com o Google. Verifique a internet.');
  } finally { clearTimeout(t); }

  const json = await r.json().catch(() => ({}));
  if (r.ok) return json;
  const msg = json?.error?.message || `HTTP ${r.status}`;
  if (r.status === 403) {
    throw new Error(/not enabled|has not been used|disabled/i.test(msg)
      ? 'A "Places API (New)" não está ativada nessa chave. Ative no Google Cloud e tente de novo.'
      : /referer|ip|restrict/i.test(msg)
        ? 'A chave tem restrição de endereço ou IP. Para uso no app, libere a restrição ou crie uma chave só para a Places API.'
        : 'Chave recusada pelo Google (403). Confira se está correta e se o faturamento está ativo.');
  }
  if (r.status === 400) throw new Error(`O Google recusou a busca: ${String(msg).slice(0, 140)}`);
  if (r.status === 429) throw new Error('Muitas buscas em pouco tempo. Espere um minuto.');
  throw new Error(String(msg).slice(0, 160));
}

// "5521999998888" ok; "21999998888" ganha o 55; fixo/local sem DDD é descartado.
export function normalizarTelefone(bruto, cidadeCodigo = '') {
  const digitos = String(bruto || '').replace(/\D/g, '');
  if (!digitos) return null;
  let n = digitos;
  if (n.startsWith('0800')) return null; // 0800 não recebe WhatsApp
  if (n.startsWith('0')) n = n.replace(/^0+/, '');
  if (n.startsWith('55') && (n.length === 12 || n.length === 13)) return n;
  if (n.length === 11 || n.length === 10) return '55' + n; // DDD + número
  if (n.length === 9 || n.length === 8) return null; // sem DDD: arriscado demais
  if (n.length === 12 || n.length === 13) return '55' + n;
  return null;
}

export async function buscarNoGoogleMaps({ apiKey, termo, cidade, limite = 20 }) {
  if (!apiKey) throw new Error('Informe a chave da API do Google.');
  if (!termo?.trim()) throw new Error('Escreva o que você procura (ex: barbearia).');
  const texto = [termo.trim(), cidade?.trim()].filter(Boolean).join(' em ');
  const corpo = { textQuery: texto, languageCode: 'pt-BR', regionCode: 'BR', pageSize: Math.min(Math.max(limite, 1), 20) };
  const json = await chamar(apiKey, corpo, CAMPOS);
  const lugares = (json.places || []).filter((p) => !p.businessStatus || p.businessStatus === 'OPERATIONAL');

  // A busca de texto não devolve telefone; então pedimos os detalhes de cada lugar (um por um, com calma).
  const resultados = [];
  for (const p of lugares) {
    let telefone = p.nationalPhoneNumber || null;
    if (!telefone) {
      try {
        const det = await chamar(apiKey, { textQuery: p.displayName?.text || '', placeId: p.id }, 'places.nationalPhoneNumber,places.internationalPhoneNumber');
        const achado = det.places?.[0];
        telefone = achado?.nationalPhoneNumber || achado?.internationalPhoneNumber || null;
      } catch { /* segue sem telefone */ }
      await new Promise((r) => setTimeout(r, 150));
    }
    resultados.push({
      id: p.id,
      nome: p.displayName?.text || '',
      endereco: p.formattedAddress || '',
      telefone,
      whatsapp: normalizarTelefone(telefone),
      site: p.websiteUri || '',
      nota: p.rating || null,
      avaliacoes: p.userRatingCount || 0,
    });
  }
  return resultados;
}
