import { criarClienteOpenAI } from './openai-compatible.js';
// xKiro: compatível com OpenAI Chat Completions, base https://api.xkiro.com/v1 (docs.xkiro.com)
export const criarXkiro = ({ baseUrl, apiKey, timeoutMs }) =>
  criarClienteOpenAI({ nome: 'xkiro', baseUrl: baseUrl || 'https://api.xkiro.com/v1', apiKey, timeoutMs });
