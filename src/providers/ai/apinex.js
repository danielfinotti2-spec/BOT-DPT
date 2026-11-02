import { criarClienteOpenAI } from './openai-compatible.js';
// APInex é compatível com OpenAI: base https://apinex.bond/v1 (confirmado com chave real em 2026-11-02).
// Contas sem saldo só acessam os modelos free/*; modelos pagos devolvem 402 (saldo insuficiente).
export function criarApinex({ baseUrl, apiKey, timeoutMs }) {
  if (!baseUrl) throw new Error('APInex: defina a URL-base (AI_BASE_URL / ALT_AI_BASE_URL) conforme a documentação do painel');
  return criarClienteOpenAI({ nome: 'apinex', baseUrl, apiKey, timeoutMs });
}
