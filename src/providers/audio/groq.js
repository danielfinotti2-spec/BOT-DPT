export function criarGroq({ apiKey }) {
  return {
    nome: 'groq',
    async transcrever(buffer) {
      const fd = new FormData();
      fd.append('file', new Blob([buffer], { type: 'audio/ogg' }), 'audio.ogg');
      fd.append('model', 'whisper-large-v3-turbo'); fd.append('language', 'pt');
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
      try {
        const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST', headers: { Authorization: 'Bearer ' + apiKey }, body: fd, signal: ctrl.signal,
        });
        if (!r.ok) throw new Error('Groq HTTP ' + r.status);
        return (await r.json()).text || '';
      } finally { clearTimeout(t); }
    },
  };
}
