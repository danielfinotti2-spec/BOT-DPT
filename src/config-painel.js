import fs from 'fs';
import { dirname } from 'path';

// Configuração do bot fica em data/config.json e é editável pelo painel.
// Valores em branco caem para o .env (compatibilidade). Segredos nunca saem daqui para o navegador.
// Pode ser trocado pelo app (ATENDE_ARQ_CONFIG) para ficar fora da pasta de instalação.
const ARQ = () => process.env.ATENDE_ARQ_CONFIG || 'data/config.json';
const PADRAO = {
  negocio: {
    nome: '', bot: '', whatsappDono: '', dono: '', cidade: '', site: '', horario: 'Seg a sex, 9h às 18h',
    produtos: [], pagamento: '', prazo: '', garantia: '', faq: [], naoFalar: '',
  },
  api: {
    aiProvider: 'xkiro', aiBaseUrl: 'https://api.xkiro.com/v1', aiKey: '', aiModel: '',
    altProvider: 'apinex', altBaseUrl: 'https://apinex.bond/v1', altKey: '', altModel: 'free/gemini-3.8-flash',
    audioProvider: 'groq', groqKey: '', evolutionUrl: 'http://localhost:8080', evolutionKey: '',
    evolutionInstancia: 'meubot',
  },
  atendimento: { ativo: false, respondeAudio: true, mensagemForaHora: false, pausarSeHumanoEscrever: true, avisarDono: true },
  prospeccao: { ativo: false, estilo: 'amigavel', horaInicio: 9, horaFim: 18, limiteDia: 10 },
  // Busca de clientes no Google Maps: desligada até o dono colar a chave e mandar buscar.
  captacao: { ativa: false, googleKey: '', termo: '', cidade: '' },
  cerebro: '',
};

const fundir = (a, b) => {
  if (Array.isArray(a)) return Array.isArray(b) ? b : a;
  if (a && typeof a === 'object') return Object.fromEntries(Object.keys(a).map((k) => [k, fundir(a[k], b?.[k])]));
  return b === undefined || b === null ? a : b;
};

export function lerConfig() {
  let salvo = {};
  try { salvo = JSON.parse(fs.readFileSync(ARQ(), 'utf8')); } catch { /* primeira execução */ }
  return fundir(PADRAO, salvo);
}

export function salvarConfig(cfg) {
  fs.mkdirSync(dirname(ARQ()), { recursive: true });
  fs.writeFileSync(ARQ(), JSON.stringify(cfg, null, 2));
}

export const mascarar = (s) => (!s ? '' : s.length <= 8 ? '••••' : `${s.slice(0, 4)}••••${s.slice(-4)}`);

// Versão segura para o navegador: sem chaves, com apenas a máscara e se está preenchida.
export function configPublica(cfg) {
  const mascararChaves = (obj, campos) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, campos.includes(k) ? { preenchido: !!v, dica: mascarar(v) } : v]));
  return {
    negocio: cfg.negocio,
    api: mascararChaves(cfg.api, ['aiKey', 'altKey', 'groqKey', 'evolutionKey']),
    atendimento: cfg.atendimento,
    prospeccao: cfg.prospeccao,
    captacao: { ativa: cfg.captacao.ativa, termo: cfg.captacao.termo, cidade: cfg.captacao.cidade, googleKey: { preenchido: !!cfg.captacao.googleKey, dica: mascarar(cfg.captacao.googleKey) } },
    temChaveIA: !!cfg.api.aiKey,
    temEvolution: !!(cfg.api.evolutionUrl && cfg.api.evolutionKey),
  };
}

// Monta o texto que a IA usa como "cérebro". Se o dono escreveu um cerebro manual, ele manda.
export function montarCerebro(cfg) {
  if (cfg.cerebro?.trim()) return cfg.cerebro.trim();
  const n = cfg.negocio || {};
  const linhas = [];
  linhas.push(`Você se chama ${n.bot || 'Atendimento'} e atende pelo WhatsApp da empresa ${n.nome || '(nome não cadastrado)'}.`);
  if (n.cidade) linhas.push(`A empresa fica em ${n.cidade}.`);
  if (n.produtos?.length) {
    linhas.push('', 'O que vendemos:');
    for (const p of n.produtos) {
      const preco = p.preco ? ` — R$ ${Number(String(p.preco).replace(/[^\d,.]/g, '').replace(',', '.') || 0).toFixed(2).replace('.', ',')}` : '';
      linhas.push(`- ${p.nome}${preco}${p.desc ? `: ${p.desc}` : ''}`);
    }
  } else linhas.push('', 'O que vendemos: (ainda não cadastrado — pergunte ao cliente o que procura e chame o dono para passar preço)');
  if (n.pagamento) linhas.push('', `Pagamento: ${n.pagamento}`);
  if (n.prazo) linhas.push(`Prazo de entrega: ${n.prazo}`);
  if (n.garantia) linhas.push(`Garantia: ${n.garantia}`);
  if (n.horario) linhas.push(`Atendimento: ${n.horario}`);
  if (n.faq?.length) {
    linhas.push('', 'Perguntas frequentes:');
    for (const f of n.faq) if (f.q && f.r) linhas.push(`- ${f.q} -> ${f.r}`);
  }
  linhas.push('', 'Regras de venda: trate bem, descubra o que o cliente precisa, responda dúvidas e conduza para o fechamento sem pressão. Se o cliente pedir para fechar, pedir desconto maior que o permitido, mandar comprovante ou perguntar algo que não está aqui, chame o dono.');
  if (n.naoFalar) linhas.push('', `O que nunca falar: ${n.naoFalar}`);
  return linhas.join('\n');
}
