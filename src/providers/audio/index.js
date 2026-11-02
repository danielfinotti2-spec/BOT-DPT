import { criarGroq } from './groq.js';
// Para novos provedores de transcrição: crie arquivo com { nome, transcrever(buffer) } e registre aqui.
export function criarAudio(cfg) {
  if (cfg.audio.provider === 'groq' && cfg.audio.groqKey) return criarGroq({ apiKey: cfg.audio.groqKey });
  return null; // sem áudio: o bot segue só com texto
}
