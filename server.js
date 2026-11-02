import express from 'express';
import fs from 'fs';
// O Node não sobrescreve variáveis já existentes no ambiente com as do --env-file.
// Se este PC tiver AI_*/PORT etc. definidos no sistema, eles ganhariam do .env. Aqui o .env manda.
for (const linha of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
  if (!m) continue;
  const valor = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  if (valor) process.env[m[1]] = valor;
}
const { carregarConfig, validar } = await import('./src/config.js');
import { criarIA } from './src/providers/ai/index.js';
import { criarAudio } from './src/providers/audio/index.js';

const cfg = carregarConfig();
const erros = validar(cfg);
if (erros.length) { console.error('Configuração inválida:\n- ' + erros.join('\n- ')); process.exit(1); }

const IA = criarIA(cfg);
const audio = criarAudio(cfg);
const cerebro = fs.readFileSync('cerebro.md', 'utf8');
fs.mkdirSync('data', { recursive: true });
const DB = 'data/db.json';
const db = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB)) : { chats: {}, sent: {}, daily: { d: '', n: 0 } };
const save = () => fs.writeFileSync(DB, JSON.stringify(db));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const comercial = () => { const d = new Date(), h = d.getHours(); return d.getDay() > 0 && d.getDay() < 6 && h >= cfg.ini && h < cfg.fim; };

const REGRAS = `
REGRAS FIXAS:
- Você conversa no WhatsApp como uma pessoa, em português brasileiro. Sem markdown, sem listas longas.
- Responda em no máximo 3 balões curtos, separados por |||
- Nunca invente preço, prazo ou informação que não esteja acima.
- Se o cliente quiser fechar, pedir humano, mandar comprovante, ou fizer pergunta que você não sabe responder: responda e termine com [CHAMAR_DONO]
- Se o cliente pedir pra parar ou disser que não tem interesse: despeça-se com educação e termine com [PARAR]`;

const ESTILOS = {
  direto: 'Vá direto ao ponto: apresente-se e a oferta em 2 frases.',
  curioso: 'Comece com uma pergunta curiosa sobre o negócio da pessoa.',
  consultivo: 'Mostre que pesquisou a empresa e aponte uma oportunidade de melhoria.',
  amigavel: 'Tom leve e amigável, como quem puxa conversa.',
};

// ---------- Evolution API ----------
const evo = (p, b) => fetch(`${cfg.evo.url}${p}/${cfg.evo.inst}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.evo.key }, body: JSON.stringify(b),
}).then((r) => r.json()).catch((e) => { console.error('[evolution]', p, e.message); return {}; });

async function enviar(n, texto) {
  for (const b of texto.split('|||').map((s) => s.trim()).filter(Boolean)) {
    await evo('/message/sendText', { number: n, text: b, delay: Math.min(1000 + b.length * 40, 6000) });
    if (db.chats[n]) db.chats[n].botAt = Date.now();
    await sleep(800);
  }
}

const ia = (messages, temp = 0.7) => IA.conversar(messages, { temperature: temp });

// Áudio é opcional: sem provedor (ou com falha) devolve null e o bot pede texto educadamente.
async function transcrever(d) {
  if (!audio) return null;
  try {
    const r = await evo('/chat/getBase64FromMediaMessage', { message: { key: d.key } });
    if (!r.base64) return null;
    return (await audio.transcrever(Buffer.from(r.base64, 'base64'))) || null;
  } catch (e) { console.error('[audio]', e.message); return null; }
}

let ultimoAviso = 0;
async function avisarDonoIA() {
  if (Date.now() - ultimoAviso < 10 * 60e3) return;
  ultimoAviso = Date.now();
  const e = IA.status().ultimoErro;
  await enviar(cfg.dono, `⚠️ A IA não respondeu (${e?.tipo || 'erro'}). Verifique chave/saldo/modelo. Comandos: /ia, /testar, /modelos`);
}

// ---------- Conversa ----------
const chat = (n, origem = 'entrada') => (db.chats[n] ||= { msgs: [], paused: false, last: 0, fu: 0, botAt: 0, origem });

async function responder(n) {
  const c = chat(n);
  if (c.paused) return;
  let out = await ia([{ role: 'system', content: cerebro + REGRAS }, ...c.msgs.slice(-30)]);
  if (!out) { await avisarDonoIA(); return; }
  const chamar = out.includes('[CHAMAR_DONO]'), parar = out.includes('[PARAR]');
  out = out.replace(/\[(CHAMAR_DONO|PARAR)\]/g, '').trim();
  if (out) { c.msgs.push({ role: 'assistant', content: out }); await enviar(n, out); }
  c.last = Date.now(); c.fu = 0;
  if (chamar || parar) c.paused = true;
  if (chamar) {
    const hist = c.msgs.slice(-12).map((m) => `${m.role === 'user' ? 'Cliente' : 'Bot'}: ${m.content}`).join('\n');
    const resumo = await ia([{ role: 'user', content: `Resuma em 3 linhas o que o cliente quer e em que ponto está:\n${hist}` }], 0.3);
    await enviar(cfg.dono, `🔔 Cliente ${n} precisa de você.\n${resumo}\n\nBot pausado. Para reativar: /retomar ${n}`);
  }
  save();
}

// ---------- Webhook ----------
const app = express();
app.use(express.json({ limit: '25mb', type: () => true })); // aceita até requisição sem Content-Type JSON
const timers = {};

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const d = req.body.data;
    if (!d?.key || d.key.remoteJid.endsWith('@g.us') || d.key.remoteJid === 'status@broadcast') return;
    const n = d.key.remoteJid.split('@')[0];
    const m = d.message || {};

    if (d.key.fromMe) { // você respondeu manualmente → bot pausa
      const c = db.chats[n];
      if (c && Date.now() - c.botAt > 20000) { c.paused = true; save(); }
      return;
    }
    let texto = m.conversation || m.extendedTextMessage?.text || '';
    if (m.audioMessage) {
      if (n === cfg.dono) return;
      texto = await transcrever(d);
      if (!texto) {
        if (cfg.atend || db.chats[n]) await enviar(n, 'Desculpa, não consegui ouvir o áudio por aqui 😕 ||| Pode me mandar por escrito?');
        return;
      }
    }
    if (!texto) return;

    if (n === cfg.dono) { // comandos do dono
      const x = texto.match(/^\/retomar\s+(\d+)/);
      if (x && db.chats[x[1]]) { db.chats[x[1]].paused = false; save(); await enviar(n, `✅ Bot reativado para ${x[1]}`); return; }
      const t = texto.trim();
      if (t === '/ia') { const s = IA.status(); await enviar(n, `🤖 Provedor: ${s.provedor}\nModelo: ${s.modelo}\nAlternativo: ${s.alternativo || 'nenhum'}\nÁudio: ${audio ? audio.nome : 'desligado'}\nÚltimo erro: ${s.ultimoErro ? s.ultimoErro.msg : 'nenhum'}`); }
      else if (t === '/modelos') { const s = IA.status(); await enviar(n, 'Modelos:\n' + s.modelos.map((m, i) => `${i + 1}. ${m}${m === s.modelo ? ' ✅' : ''}`).join('\n') + '\n\nTroque com /modelo NUMERO'); }
      else if (t.startsWith('/modelo ')) {
        const a = t.slice(8).trim(), lista = IA.status().modelos, alvo = /^\d+$/.test(a) ? lista[+a - 1] : a;
        try { IA.trocarModelo(alvo); await enviar(n, `✅ Modelo agora: ${alvo}`); } catch (e) { await enviar(n, '❌ ' + e.message); }
      }
      else if (t === '/testar') { try { const r = await IA.testar(); await enviar(n, `✅ IA ok em ${r.ms}ms`); } catch (e) { await enviar(n, '❌ ' + e.message); } }
      return;
    }
    if (!cfg.atend && !db.chats[n]) return;
    const c = chat(n);
    c.msgs.push({ role: 'user', content: texto }); c.last = Date.now(); save();
    clearTimeout(timers[n]);
    timers[n] = setTimeout(() => responder(n).catch(console.error), 5000); // junta mensagens seguidas
  } catch (e) { console.error(e); }
});

// ---------- Prospecção + retomada ----------
let ultimaAcao = 0, gap = 0;
setInterval(async () => {
  try {
    if (!comercial() || Date.now() - ultimaAcao < gap) return;
    const hoje = new Date().toDateString();
    if (db.daily.d !== hoje) db.daily = { d: hoje, n: 0 };

    // 1) retoma quem respondeu e sumiu (1x, após 24h)
    for (const [n, c] of Object.entries(db.chats)) {
      if (c.paused || c.fu >= 1 || !c.msgs.some((m) => m.role === 'user')) continue;
      if (c.msgs.at(-1)?.role !== 'assistant' || Date.now() - c.last < 24 * 3600e3) continue;
      const t = await ia([{ role: 'system', content: cerebro + REGRAS }, ...c.msgs.slice(-10),
        { role: 'user', content: '(O cliente parou de responder. Escreva 1 mensagem curta e simpática retomando a conversa, sem pressionar.)' }]);
      c.fu++; c.last = Date.now();
      if (t) { c.msgs.push({ role: 'assistant', content: t.replace(/\[.*?\]/g, '') }); await enviar(n, t.replace(/\[.*?\]/g, '')); }
      ultimaAcao = Date.now(); gap = 120e3 + Math.random() * 180e3; return save();
    }

    // 2) prospecta o próximo da lista
    if (!cfg.prosp || db.daily.n >= cfg.limite || !fs.existsSync('lista.csv')) return;
    const linhas = fs.readFileSync('lista.csv', 'utf8').split('\n').slice(1).map((l) => l.trim().split(';')).filter((l) => l[0]);
    const prox = linhas.find((l) => !db.sent[l[0]]);
    if (!prox) return;
    const [numero, nome = '', empresa = ''] = prox;
    const msg = await ia([{ role: 'system', content: cerebro + REGRAS },
      { role: 'user', content: `Escreva a PRIMEIRA mensagem de prospecção para ${nome} da empresa "${empresa}". ${ESTILOS[cfg.estilo] || ESTILOS.direto} Termine com uma pergunta fácil de responder. Não use [CHAMAR_DONO].` }]);
    if (!msg) return;
    const limpa = msg.replace(/\[.*?\]/g, '');
    const c = chat(numero, 'prospeccao');
    c.msgs.push({ role: 'assistant', content: limpa }); c.last = Date.now();
    db.sent[numero] = Date.now(); db.daily.n++;
    await enviar(numero, limpa);
    ultimaAcao = Date.now(); gap = 120e3 + Math.random() * 180e3; save();
  } catch (e) { console.error(e); }
}, 60e3);

app.listen(cfg.port, () => console.log('Bot rodando na porta ' + cfg.port));
