import fs from 'fs';
import path from 'path';
import express from 'express';
import { lerConfig, salvarConfig, configPublica, montarCerebro } from './src/config-painel.js';
import { criarEvolution } from './src/evolution.js';
import { testarIA, testarGroq, testarEvolution } from './src/testes-reais.js';
import { criarIA } from './src/providers/ai/index.js';
import { criarAudio } from './src/providers/audio/index.js';
import { buscarNoGoogleMaps } from './src/google-maps.js';

// ---------- .env manda sobre variáveis do sistema (ver bug do AI_PROVIDER=openai-compatible) ----------
// No app instalado pode não existir .env: aí manda o data/config.json (editado pelo painel).
const ARQUIVO_ENV = path.join(process.env.ATENDE_RAIZ || process.cwd(), '.env');
const PORTA_PEDIDA = process.env.PORT; // o app define a porta dele: o .env não pode trocar
for (const linha of (fs.existsSync(ARQUIVO_ENV) ? fs.readFileSync(ARQUIVO_ENV, 'utf8') : '').split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
  if (!m) continue;
  const valor = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  if (m[1] === 'PORT') continue;
  if (valor) process.env[m[1]] = valor;
}
if (PORTA_PEDIDA) process.env.PORT = PORTA_PEDIDA;

const PORTA = +process.env.PORT || 3100;
// RAIZ = onde ficam .env, .env.example e lista.csv (projeto ou pasta do app instalado)
const RAIZ = process.env.ATENDE_RAIZ || process.cwd();
const IMAGEM_WHATSAPP = process.env.EVOLUTION_IMAGEM || 'evoapicloud/evolution-api:v2.3.0';
const DOCKER = process.env.EVOLUTION_DOCKER !== '0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync('data', { recursive: true });

// ---------- Dados do app (chaves, conversas) ----------
// No app instalado a pasta de dados fica fora da instalação, para sobreviver a uma atualização.
const PASTA_DADOS = process.env.ATENDE_DADOS || 'data';
const ARQ_CONFIG = path.join(PASTA_DADOS, 'config.json');
const ARQ_DB = path.join(PASTA_DADOS, 'db.json');
const ARQ_RUNTIME = path.join(PASTA_DADOS, 'runtime.json');
const ARQ_EVOLUTION = path.join(PASTA_DADOS, 'evolution.json');
fs.mkdirSync(PASTA_DADOS, { recursive: true });
process.env.ATENDE_ARQ_CONFIG = ARQ_CONFIG;
process.env.ATENDE_ARQ_RUNTIME = ARQ_RUNTIME;
process.env.ATENDE_ARQ_EVOLUTION = ARQ_EVOLUTION;

// ---------- Estado vivo (muda em tempo real pelo painel) ----------
let cfg = lerConfig();
let IA = null;
let audio = null;
let evo = null;
const eventos = []; // log recente mostrado no painel
function logar(tipo, texto) {
  eventos.unshift({ tipo, texto, em: new Date().toISOString() });
  if (eventos.length > 200) eventos.pop();
  console.log(`[${tipo}] ${texto}`);
}

// ---------- Banco simples ----------
const DB = ARQ_DB;
const db = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB)) : { chats: {}, sent: {}, daily: { d: '', n: 0 }, contadores: {} };
db.contadores ||= {};
db.leads ||= []; // contatos trazidos do Google Maps (nunca enviados sem o dono marcar)
let gravando = null;
const save = () => {
  clearTimeout(gravando);
  gravando = setTimeout(() => fs.writeFileSync(DB, JSON.stringify(db)), 300);
};
const chat = (n, origem = 'entrada') => (db.chats[n] ||= { msgs: [], paused: false, last: 0, fu: 0, botAt: 0, origem, status: 'novo', nome: '' });

// ---------- Aplicar configuração (reconstroi IA/Evolution sem reiniciar) ----------
function montarRuntime() {
  const provider = (cfg.api.aiProvider || 'xkiro').toLowerCase();
  IA = criarIA({
    ai: {
      provider, baseUrl: cfg.api.aiBaseUrl || '', apiKey: cfg.api.aiKey || '',
      model: cfg.api.aiModel || '', models: listaModelos(), timeoutMs: 30000,
    },
    alt: { provider: cfg.api.altProvider || '', baseUrl: cfg.api.altBaseUrl || '', apiKey: cfg.api.altKey || '', model: cfg.api.altModel || '' },
  });
  audio = cfg.atendimento.respondeAudio && cfg.api.groqKey
    ? criarAudio({ audio: { provider: cfg.api.audioProvider || 'groq', groqKey: cfg.api.groqKey } })
    : null;
  evo = criarEvolution({ api: cfg.api, instancia: cfg.api.evolutionInstancia || 'meubot', webhookUrl: `http://localhost:${PORTA}/webhook` });
  evo.post = (caminho, corpo) => postEvolution(caminho, corpo);
}
function listaModelos() {
  const base = [cfg.api.aiModel, 'mistralai/mistral-large-2512', 'mistralai/mistral-medium-3.5', 'mistralai/mistral-small-2603',
    'qwen/qwen3.7-plus:free', 'qwen/qwen3.7-flash:free', 'cohere/command-a'].filter(Boolean);
  return [...new Set(base)];
}
function instancia() {
  return cfg.api.evolutionInstancia || process.env.INSTANCE || 'meubot';
}
async function postEvolution(caminho, corpo) {
  const base = String(cfg.api.evolutionUrl || '').replace(/\/+$/, '');
  if (!base) return {};
  try {
    const r = await fetch(`${base}${caminho}/${instancia()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.api.evolutionKey || '' },
      body: JSON.stringify(corpo),
    });
    return await r.json().catch(() => ({}));
  } catch (e) { console.error('[evolution]', caminho, e.message); return {}; }
}

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

const ia = (messages, temp = 0.7) => IA.conversar(messages, { temperature: temp });
// A IA separa balões com ||| — guardamos como balões reais (array) para a tela nunca mostrar o separador.
const baloes = (s) => String(s || '').split('|||').map((x) => x.trim()).filter(Boolean);
const juntar = (arr) => (Array.isArray(arr) ? arr : baloes(arr)).join('\n');
// Aviso ao dono usa 1 balão: a Evolution não aceita "|||" em mensagem comum.
const baloesPara = (s) => baloes(s).join('\n');
const cerebroAtual = () => montarCerebro(cfg);
const comercial = () => {
  const d = new Date(), h = d.getHours();
  return d.getDay() > 0 && d.getDay() < 6 && h >= cfg.prospeccao.horaInicio && h < cfg.prospeccao.horaFim;
};

// ---------- Envio ----------
async function enviar(n, texto, quem = 'bot') {
  for (const b of String(texto).split('|||').map((s) => s.trim()).filter(Boolean)) {
    await postEvolution('/message/sendText', { number: n, text: b, delay: Math.min(1000 + b.length * 40, 6000) });
    if (db.chats[n]) db.chats[n].botAt = Date.now();
    logar('envio', `→ ${n}: ${b.slice(0, 60)}`);
    await sleep(700);
  }
}

let ultimoAviso = 0;
async function avisarDonoIA() {
  if (!cfg.negocio.whatsappDono || Date.now() - ultimoAviso < 10 * 60e3) return;
  ultimoAviso = Date.now();
  const e = IA.status().ultimoErro;
  await enviar(cfg.negocio.whatsappDono, baloesPara(`⚠️ A IA não respondeu (${e?.tipo || 'erro'}). Abra o painel e use "Testar tudo".`));
}

// ---------- Conversa ----------
async function responder(n) {
  const c = chat(n);
  if (c.paused) return;
  const out0 = await ia([{ role: 'system', content: cerebroAtual() + REGRAS }, ...c.msgs.slice(-30)]);
  if (!out0) { await avisarDonoIA(); return; }
  const chamar = out0.includes('[CHAMAR_DONO]'), parar = out0.includes('[PARAR]');
  const out = out0.replace(/\[(CHAMAR_DONO|PARAR)\]/g, '').trim();
  if (out) { c.msgs.push({ role: 'assistant', content: out, em: new Date().toISOString() }); await enviar(n, out); }
  c.last = Date.now(); c.fu = 0;
  if (chamar || parar) c.paused = true;
  if (chamar) {
    c.status = 'quer_fechar';
    const hist = c.msgs.slice(-12).map((m) => `${m.role === 'user' ? 'Cliente' : 'Bot'}: ${m.content}`).join('\n');
    const resumo = await ia([{ role: 'user', content: `Resuma em 3 linhas o que o cliente quer e em que ponto está:\n${hist}` }], 0.3);
    c.resumo = String(resumo || '').replace(/\*\*/g, '');
    if (cfg.negocio.whatsappDono && cfg.atendimento.avisarDono) {
      await enviar(cfg.negocio.whatsappDono, baloesPara(`🔔 Cliente ${n} precisa de você.\n${c.resumo}\n\nBot pausado nesta conversa.`));
    }
  }
  // classifica o lead para a coluna do painel
  if (c.status === 'novo' || c.status === 'conversando') {
    const cls = await ia([{ role: 'user', content: `Classifique esta conversa em UMA palavra: novo (só perguntou preço/oi), interessado (quer saber mais), quer_fechar (pediu para fechar/comprar), descartado (disse que não quer). Responda só a palavra.\n${c.msgs.slice(-6).map((m) => juntar(m.content)).join('\n')}` }], 0.1).catch(() => '');
    const mapa = { novo: 'novo', interessado: 'interessado', quer_fechar: 'quer_fechar', descartado: 'descartado' };
    if (mapa[cls.trim().toLowerCase()]) c.status = mapa[cls.trim().toLowerCase()];
  }
  save();
}

function resumirLead(c) {
  return {
    numero: Object.keys(db.chats).find((k) => db.chats[k] === c) || '',
    nome: c.nome || '',
    status: c.paused && c.status === 'novo' ? 'humano' : c.status || 'novo',
    pausado: !!c.paused,
    ultima: baloes(c.msgs.at(-1)?.content).join(' ').slice(0, 120),
    ultimaEm: c.last,
    mensagens: c.msgs.length,
    origem: c.origem,
    resumo: c.resumo || '',
  };
}

// ---------- Docker: ligar a Evolution se não estiver no ar ----------
async function subirEvolution() {
  if (!DOCKER) return { ok: false, mensagem: 'Docker desativado nesta instalação' };
  const { execFile } = await import('node:child_process');
  const docker = (args) => new Promise((ok) => execFile('docker', args, { timeout: 180000 }, (e, so, se) => ok({ e, so: String(so), se: String(se) })));
  const ps = await docker(['ps', '-a', '--format', '{{.Names}}']);
  if (ps.e) return { ok: false, mensagem: 'Docker Desktop não está rodando neste PC' };
  if (!ps.so.includes('evolution_api')) return { ok: false, mensagem: 'A Evolution API ainda não foi instalada. Rode o arquivo INSTALAR-EVOLUTION.bat uma vez.' };
  await docker(['start', 'evolution_postgres', 'evolution_redis', 'evolution_api']);
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    try {
      const r = await fetch(`${String(cfg.api.evolutionUrl).replace(/\/+$/, '')}/`, { signal: AbortSignal.timeout(3000) });
      if (r.status < 500) return { ok: true, mensagem: 'Evolution API no ar' };
    } catch { /* ainda subindo */ }
  }
  return { ok: false, mensagem: 'A Evolution não respondeu depois de 60 segundos. Veja o log no Docker Desktop.' };
}

// ---------- API do painel ----------
const app = express();
app.use(express.json({ limit: '25mb', type: () => true }));
app.use(express.static(path.join(import.meta.dirname, 'public')));
const timers = {};

app.get('/api/estado', async (req, res) => {
  const e = await evo.status();
  const chats = Object.values(db.chats);
  res.json({
    config: configPublica(cfg),
    ia: { ...IA.status(), temAlternativo: !!(cfg.api.altKey && cfg.api.altModel) },
    whatsapp: e,
    ativo: cfg.atendimento.ativo,
    resumo: {
      conversas: chats.filter((c) => c.msgs.length).length,
      querFechar: chats.filter((c) => c.status === 'quer_fechar').length,
      interessados: chats.filter((c) => c.status === 'interessado').length,
      pausadas: chats.filter((c) => c.paused).length,
      mensagensHoje: chats.reduce((s, c) => s + c.msgs.filter((m) => new Date(m.em || 0) > new Date(new Date().setHours(0, 0, 0, 0))).length, 0),
    },
    eventos: eventos.slice(0, 40),
    pronto: !!(cfg.api.aiKey && cfg.api.evolutionKey && e.conectado),
  });
});

app.get('/api/leads', (req, res) => {
  const lista = Object.entries(db.chats)
    .filter(([, c]) => c.msgs.length)
    .map(([numero, c]) => ({ ...resumirLead(c), numero }))
    .sort((a, b) => b.ultimaEm - a.ultimaEm);
  res.json(lista);
});

app.get('/api/lead/:numero', (req, res) => {
  const c = db.chats[req.params.numero];
  if (!c) return res.status(404).json({ erro: 'conversa não encontrada' });
  res.json({ ...resumirLead(c), numero: req.params.numero, msgs: c.msgs.slice(-60) });
});

app.post('/api/lead/:numero/acao', async (req, res) => {
  const c = db.chats[req.params.numero];
  if (!c) return res.status(404).json({ erro: 'conversa não encontrada' });
  const { acao } = req.body;
  if (acao === 'pausar') c.paused = true;
  else if (acao === 'retomar') c.paused = false;
  else if (acao === 'perder') { c.status = 'descartado'; c.paused = true; }
  else if (acao === 'ganho') { c.status = 'ganho'; c.paused = true; }
  else if (acao === 'responder') {
    if (!req.body.texto?.trim()) return res.status(400).json({ erro: 'Escreva uma mensagem.' });
    c.msgs.push({ role: 'assistant', content: req.body.texto.trim(), em: new Date().toISOString() });
    c.last = Date.now();
    await enviar(req.params.numero, req.body.texto.trim());
  } else return res.status(400).json({ erro: 'Ação desconhecida.' });
  save();
  res.json({ ok: true });
});

app.post('/api/testar/:tipo', async (req, res) => {
  const dados = { ...cfg.api, ...(req.body || {}) };
  try {
    if (req.body?.usarSalvo) for (const k of ['aiKey', 'altKey', 'groqKey', 'evolutionKey']) if (req.body.usarSalvo === k) dados[k] = cfg.api[k];
    if (req.body?.aiKey === 'SALVA') dados.aiKey = cfg.api.aiKey;
    if (req.body?.altKey === 'SALVA') dados.altKey = cfg.api.altKey;
    if (req.body?.groqKey === 'SALVA') dados.groqKey = cfg.api.groqKey;
    if (req.body?.evolutionKey === 'SALVA') dados.evolutionKey = cfg.api.evolutionKey;
    const tipo = req.params.tipo;
    let r;
    if (tipo === 'ia') r = await testarIA({ baseUrl: dados.aiBaseUrl, apiKey: dados.aiKey, model: dados.aiModel });
    else if (tipo === 'alternativa') r = await testarIA({ baseUrl: dados.altBaseUrl, apiKey: dados.altKey, model: dados.altModel });
    else if (tipo === 'audio') r = await testarGroq({ groqKey: dados.groqKey });
    else if (tipo === 'evolution') r = await testarEvolution({ evolutionUrl: dados.evolutionUrl, evolutionKey: dados.evolutionKey });
    else return res.status(400).json({ erro: 'tipo inválido' });
    res.json(r);
  } catch (e) { res.json({ ok: false, mensagem: e.message }); }
});

app.post('/api/config', (req, res) => {
  const b = req.body || {};
  const anterior = JSON.stringify(cfg);
  if (b.negocio) cfg.negocio = { ...cfg.negocio, ...b.negocio };
  if (b.api) for (const [k, v] of Object.entries(b.api)) {
    if (v === 'SALVA_MANTEM') continue;
    cfg.api[k] = typeof v === 'string' ? v.trim() : v;
  }
  if (b.atendimento) cfg.atendimento = { ...cfg.atendimento, ...b.atendimento };
  if (b.prospeccao) cfg.prospeccao = { ...cfg.prospeccao, ...b.prospeccao };
  if (b.captacao) for (const [k, v] of Object.entries(b.captacao)) {
    if (v === 'SALVA_MANTEM') continue;
    cfg.captacao[k] = typeof v === 'string' ? v.trim() : v;
  }
  if (typeof b.cerebro === 'string') cfg.cerebro = b.cerebro;
  if (JSON.stringify(cfg) !== anterior) {
    salvarConfig(cfg);
    montarRuntime();
    logar('config', 'Configuração atualizada pelo painel');
  }
  res.json({ ok: true, config: configPublica(cfg) });
});

app.post('/api/bot', (req, res) => {
  cfg.atendimento.ativo = !!req.body.ativo;
  salvarConfig(cfg);
  logar('bot', cfg.atendimento.ativo ? 'Bot ligado para atender' : 'Bot desligado');
  res.json({ ok: true, ativo: cfg.atendimento.ativo });
});

app.post('/api/whatsapp/docker', async (req, res) => res.json(await subirEvolution()));

app.post('/api/whatsapp/conectar', async (req, res) => {
  try {
    if (!cfg.api.evolutionKey) return res.json({ ok: false, mensagem: 'Cole a chave da Evolution API no passo anterior.' });
    const s = await evo.status();
    if (s.estado === 'offline') return res.json({ ok: false, mensagem: 'A Evolution API não está respondendo. Volte um passo e clique em "Ligar Evolution".' });
    const r = s.estado === 'nao-existe' || s.estado === 'sem-config' ? await evo.criar() : await evo.conectar();
    await evo.configurarWebhook().catch(() => {});
    logar('whatsapp', s.estado === 'open' ? 'Já estava conectado' : 'QR Code gerado');
    res.json({ ok: true, ...r, estado: s.estado });
  } catch (e) {
    const msg = /unauthorized|forbidden|401|403/i.test(e.message) ? 'A chave da Evolution API está errada. Volte um passo e confira.' : e.message;
    res.json({ ok: false, mensagem: msg });
  }
});

app.post('/api/whatsapp/desconectar', async (req, res) => {
  try { res.json({ ok: true, ...(await evo.sair()) }); } catch (e) { res.json({ ok: false, mensagem: e.message }); }
});

// Abre a Evolution e devolve o QR sem sair do painel (usado pelo botão "Conectar WhatsApp").
app.post('/api/whatsapp/qr', async (req, res) => {
  try {
    const d = await subirEvolution();
    if (!d.ok && !/já está/i.test(d.mensagem)) return res.json({ ok: false, mensagem: d.mensagem });
    const s = await evo.status();
    if (s.estado === 'open') return res.json({ ok: true, jaConectado: true });
    const r = s.estado === 'nao-existe' ? await evo.criar() : await evo.conectar();
    await evo.configurarWebhook().catch(() => {});
    res.json({ ok: true, ...r });
  } catch (e) { res.json({ ok: false, mensagem: e.message }); }
});

app.get('/api/whatsapp/status', async (req, res) => res.json(await evo.status()));

// ---------- Clientes do Google Maps ----------
// Fluxo: buscar (rede) -> aprovar (lista no banco) -> enviar (WhatsApp). Cada etapa é um clique do dono.
app.post('/api/leads/buscar', async (req, res) => {
  const b = req.body || {};
  const apiKey = b.googleKey && b.googleKey !== 'SALVA' ? b.googleKey : cfg.captacao.googleKey;
  const termo = (b.termo ?? cfg.captacao.termo ?? '').trim();
  const cidade = (b.cidade ?? cfg.captacao.cidade ?? '').trim();
  if (!apiKey) return res.json({ ok: false, mensagem: 'Cole a chave da API do Google para buscar.' });
  try {
    const achados = await buscarNoGoogleMaps({ apiKey, termo, cidade });
    if (b.googleKey && b.googleKey !== 'SALVA') cfg.captacao.googleKey = b.googleKey.trim();
    cfg.captacao.termo = termo; cfg.captacao.cidade = cidade;
    salvarConfig(cfg);

    const existentes = new Set(db.leads.map((l) => l.placeId));
    const existentesTel = new Set(Object.keys(db.chats));
    let novos = 0;
    for (const a of achados) {
      if (existentes.has(a.id)) continue;
      if (a.whatsapp && existentesTel.has(a.whatsapp)) continue;
      db.leads.push({
        placeId: a.id, nome: a.nome, endereco: a.endereco, telefone: a.telefone, whatsapp: a.whatsapp,
        site: a.site, nota: a.nota, avaliacoes: a.avaliacoes,
        origem: [termo, cidade].filter(Boolean).join(' em '), status: 'novo', enviadoEm: null,
      });
      existentes.add(a.id); novos++;
    }
    save();
    const comTelefone = achados.filter((a) => a.whatsapp).length;
    logar('captacao', `Busca "${[termo, cidade].filter(Boolean).join(' em ')}": ${achados.length} empresas, ${novos} novas`);
    res.json({ ok: true, encontrados: achados.length, comTelefone, novos, mensagem: novos ? `${novos} contato(s) novo(s) na lista.` : 'Nenhum contato novo: o que o Google devolveu já estava na lista.' });
  } catch (e) {
    res.json({ ok: false, mensagem: e.message });
  }
});

app.get('/api/leads/lista', (req, res) => {
  res.json({
    leads: [...db.leads].sort((a, b) => (a.status === 'enviado') - (b.status === 'enviado') || (b.nota || 0) - (a.nota || 0)),
    chaveGoogle: cfg.captacao.googleKey ? { preenchido: true } : { preenchido: false },
    ultimaBusca: { termo: cfg.captacao.termo, cidade: cfg.captacao.cidade },
  });
});

app.post('/api/leads/:placeId', (req, res) => {
  const l = db.leads.find((x) => x.placeId === req.params.placeId);
  if (!l) return res.status(404).json({ erro: 'Contato não encontrado.' });
  const { acao, texto } = req.body || {};
  if (acao === 'apagar') {
    db.leads = db.leads.filter((x) => x !== l); save();
    return res.json({ ok: true });
  }
  if (acao === 'status' && req.body.status) { l.status = req.body.status; save(); return res.json({ ok: true, lead: l }); }
  if (acao === 'enviar') {
    if (!l.whatsapp) return res.json({ ok: false, mensagem: 'Esse contato não tem telefone identificado.' });
    if (!texto?.trim()) return res.json({ ok: false, mensagem: 'Escreva a mensagem antes de enviar.' });
    return res.json({ ok: true });
  }
  res.status(400).json({ erro: 'Ação desconhecida.' });
});

// Envio individual: o texto vem do painel, com o nome da empresa já trocado.
app.post('/api/leads/:placeId/enviar', async (req, res) => {
  const l = db.leads.find((x) => x.placeId === req.params.placeId);
  if (!l) return res.status(404).json({ ok: false, mensagem: 'Contato não encontrado.' });
  if (!l.whatsapp) return res.json({ ok: false, mensagem: 'Esse contato não tem telefone identificado.' });
  const texto = String(req.body?.texto || '').trim();
  if (!texto) return res.json({ ok: false, mensagem: 'Escreva a mensagem antes de enviar.' });
  if (!cfg.atendimento.ativo) return res.json({ ok: false, mensagem: 'Ligue o atendimento no topo antes de enviar.' });
  try {
    await enviar(l.whatsapp, texto);
    const c = chat(l.whatsapp, 'google');
    c.nome = l.nome;
    c.msgs.push({ role: 'assistant', content: texto, em: new Date().toISOString() });
    c.last = Date.now();
    l.status = 'enviado'; l.enviadoEm = new Date().toISOString();
    db.sent[l.whatsapp] = Date.now();
    save();
    logar('captacao', `Mensagem enviada para ${l.nome} (${l.whatsapp})`);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, mensagem: e.message });
  }
});

// Sugestão de mensagem (só quando o dono pede) — e ele pode editar antes de enviar.
app.post('/api/leads/sugestao', async (req, res) => {
  const { nome = '', endereco = '', nota = '' } = req.body || {};
  const texto = await ia([{ role: 'system', content: cerebroAtual() + REGRAS },
    { role: 'user', content: `Escreva a primeira mensagem de WhatsApp para a empresa "${nome}"${endereco ? ` (${endereco})` : ''}${nota ? `, que tem nota ${nota} no Google` : ''}. Tom ${cfg.prospeccao.estilo}, máximo 2 frases curtas, sem emoji, sem [CHAMAR_DONO], terminando com uma pergunta fácil de responder.` }], 0.8);
  if (!texto) return res.json({ ok: false, mensagem: 'A IA não respondeu. Teste a chave em Conexões.' });
  res.json({ ok: true, texto: texto.replace(/\[.*?\]/g, '').replace(/\|\|\|/g, '\n').trim() });
});

// ---------- Webhook do WhatsApp ----------
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const ev = String(req.body?.event || '').toLowerCase();
    const d = req.body?.data;
    if (!d?.key || d.key.remoteJid?.endsWith('@g.us') || d.key.remoteJid === 'status@broadcast') return;
    const n = d.key.remoteJid.split('@')[0];
    const m = d.message || {};
    if (d.pushName && db.chats[n]) db.chats[n].nome ||= d.pushName;

    if (d.key.fromMe) {
      const c = db.chats[n];
      if (c && cfg.atendimento.pausarSeHumanoEscrever && Date.now() - c.botAt > 20000) { c.paused = true; save(); }
      return;
    }
    let texto = m.conversation || m.extendedTextMessage?.text || '';
    if (m.audioMessage) {
      if (!audio) { if (cfg.atendimento.ativo || db.chats[n]) await enviar(n, 'Opa, por aqui eu não consigo ouvir áudio 😅 Mas me manda por escrito que eu já te respondo!'); return; }
      const r = await postEvolution('/chat/getBase64FromMediaMessage', { message: { key: d.key } });
      if (!r?.base64) return;
      texto = await audio.transcrever(Buffer.from(r.base64, 'base64')).catch(() => '');
      if (!texto) { await enviar(n, 'Não consegui entender o áudio 😅 Pode me escrever?'); return; }
    }
    if (!texto) return;
    logar('recebe', `← ${n}: ${texto.slice(0, 60)}`);

    if (!cfg.atendimento.ativo && !db.chats[n]) { logar('bot', 'Mensagem recebida, mas o bot está desligado'); return; }
    const c = chat(n);
    if (d.pushName && !c.nome) c.nome = d.pushName;
    c.msgs.push({ role: 'user', content: texto, em: new Date().toISOString() }); c.last = Date.now(); save();
    clearTimeout(timers[n]);
    timers[n] = setTimeout(() => responder(n).catch((e) => console.error(e)), 5000);
  } catch (e) { console.error(e); }
});

// ---------- Retomada de quem sumiu + prospecção ----------
let ultimaAcao = 0, gap = 0;
setInterval(async () => {
  try {
    if (!cfg.atendimento.ativo || !comercial() || Date.now() - ultimaAcao < gap) return;
    const hoje = new Date().toDateString();
    if (db.daily.d !== hoje) db.daily = { d: hoje, n: 0 };

    for (const [n, c] of Object.entries(db.chats)) {
      if (c.paused || c.fu >= 1 || !c.msgs.some((m) => m.role === 'user')) continue;
      if (c.msgs.at(-1)?.role !== 'assistant' || Date.now() - c.last < 24 * 3600e3) continue;
      const t = await ia([{ role: 'system', content: cerebroAtual() + REGRAS }, ...c.msgs.slice(-10),
        { role: 'user', content: '(O cliente parou de responder. Escreva 1 mensagem curta e simpática retomando a conversa, sem pressionar.)' }]);
      c.fu++; c.last = Date.now();
      if (t) { const limpo = t.replace(/\[.*?\]/g, '').trim(); c.msgs.push({ role: 'assistant', content: limpo, em: new Date().toISOString() }); await enviar(n, limpo); }
      ultimaAcao = Date.now(); gap = 120e3 + Math.random() * 180e3; return save();
    }

    if (!cfg.prospeccao.ativo || db.daily.n >= cfg.prospeccao.limiteDia || !fs.existsSync(path.join(RAIZ, 'lista.csv'))) return;
    const linhas = fs.readFileSync(path.join(RAIZ, 'lista.csv'), 'utf8').split('\n').slice(1).map((l) => l.trim().split(';')).filter((l) => l[0]);
    const prox = linhas.find((l) => !db.sent[l[0]]);
    if (!prox) return;
    const [numero, nome = '', empresa = ''] = prox;
    const msg = await ia([{ role: 'system', content: cerebroAtual() + REGRAS },
      { role: 'user', content: `Escreva a PRIMEIRA mensagem de prospecção para ${nome} da empresa "${empresa}". ${ESTILOS[cfg.prospeccao.estilo] || ESTILOS.direto} Termine com uma pergunta fácil de responder. Não use [CHAMAR_DONO].` }]);
    if (!msg) return;
    const limpa = msg.replace(/\[.*?\]/g, '');
    const c = chat(numero, 'prospeccao');
    c.msgs.push({ role: 'assistant', content: limpa, em: new Date().toISOString() }); c.last = Date.now();
    db.sent[numero] = Date.now(); db.daily.n++;
    await enviar(numero, limpa);
    ultimaAcao = Date.now(); gap = 120e3 + Math.random() * 180e3; save();
  } catch (e) { console.error(e); }
}, 60e3);

// ---------- Subida ----------
montarRuntime();
const servidor = app.listen(PORTA, () => {
  console.log(`\n  BOT DPT no ar:  http://localhost:${PORTA}\n`);
});
servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  A porta ${PORTA} já está em uso — provavelmente o bot já está rodando numa outra janela.\n  Feche a outra janela preta e abra de novo.\n`);
    setTimeout(() => process.exit(1), 1200);
  } else throw e;
});
