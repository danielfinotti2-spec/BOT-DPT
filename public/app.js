const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = async (url, opts) => {
  const r = await fetch(url, opts ? { headers: { 'Content-Type': 'application/json' }, ...opts, body: JSON.stringify(opts.body) } : undefined);
  return r.json();
};
const toast = (msg, ms = 3200) => {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(t.t); t.t = setTimeout(() => t.classList.remove('on'), ms);
};
const hora = (ts) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
const quando = (iso) => {
  const d = new Date(iso), s = (Date.now() - d) / 1000;
  if (!iso || Number.isNaN(s)) return '';
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};
const inicial = (s) => (s || '?').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const ROTULO = { novo: 'Novo', interessado: 'Interessado', quer_fechar: 'Quer fechar', ganho: 'Venda feita', descartado: 'Sem interesse', humano: 'Precisa de você' };
const ROTULO_PROSPECTO = { novo: 'novo', enviado: 'mensagem enviada', respondeu: 'respondeu', sem_interesse: 'sem interesse' };

let ESTADO = null;
let conversaAberta = null;
let filtro = 'todos';

// ---------- tema ----------
function temaAtual() {
  const escolhido = localStorage.getItem('botdpt.tema') || 'auto';
  if (escolhido !== 'auto') return escolhido;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}
const ICONE_SOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICONE_LUA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
function aplicarTema() {
  const escuro = temaAtual() === 'escuro';
  document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
  const b = $('#btnTema');
  if (b) {
    b.innerHTML = escuro ? ICONE_SOL : ICONE_LUA;
    b.title = escuro ? 'Modo claro' : 'Modo escuro';
    b.setAttribute('aria-label', b.title);
  }
}
$('#btnTema')?.addEventListener('click', () => {
  localStorage.setItem('botdpt.tema', temaAtual() === 'escuro' ? 'claro' : 'escuro');
  aplicarTema();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if ((localStorage.getItem('botdpt.tema') || 'auto') === 'auto') aplicarTema(); });
aplicarTema();

// ---------- barra da janela (app desktop sem a moldura do Windows) ----------
if (window.janela?.acao) {
  document.body.classList.add('no-app');
  $$('[data-janela]').forEach((b) => b.addEventListener('click', () => window.janela.acao(b.dataset.janela)));
  const marcarMaximizada = (max) => document.body.classList.toggle('maximizada', !!max);
  window.janela.estado?.().then((e) => marcarMaximizada(e?.maximizada));
  window.janela.aoMudar?.((e) => marcarMaximizada(e?.maximizada));
  $('#appBarra')?.addEventListener('dblclick', (e) => {
    if (e.target.closest('button, .chip, a, input, select, textarea, label')) return;
    window.janela.acao('maximizar');
  });
} else {
  // aberto no navegador: sem botões de janela
  $('#janelaBotoes')?.remove();
}

// ---------- configuração inicial ----------
const PROVEDORES = { xkiro: 'https://api.xkiro.com/v1', apinex: 'https://apinex.bond/v1', 'openai-compatible': '' };
let passo = 1;

function irPara(n) {
  passo = n;
  $$('.painel-passo[data-passo]').forEach((s) => s.classList.toggle('escondido', +s.dataset.passo !== n));
  $$('#passos .p').forEach((p, i) => {
    p.classList.toggle('on', i + 1 === n);
    p.classList.toggle('tem', i + 1 < n);
  });
  if (n === 3) gerarQR();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('#aiProvider')?.addEventListener('change', (e) => {
  $('#aiBaseUrl').value = PROVEDORES[e.target.value] || '';
});

$('#btnTestarIA')?.addEventListener('click', async (e) => {
  const b = e.target; b.disabled = true; b.textContent = 'Testando…';
  const r = await api('/api/testar/ia', { method: 'POST', body: {
    aiBaseUrl: $('#aiBaseUrl').value, aiKey: $('#aiKey').value || 'SALVA', aiModel: $('#aiModel').value,
  } });
  mostrarResultado('#resIA', r);
  if (r.ok && r.modelo && !$('#aiModel').value) $('#aiModel').value = r.modelo;
  b.disabled = false; b.textContent = 'Testar chave';
  if (r.ok) { $('#aiKey').placeholder = 'salva'; $('#aiKey').value = ''; }
});

function mostrarResultado(sel, r) {
  const el = $(sel);
  if (!el || !r) return;
  el.innerHTML = `<div class="resultado ${r.ok ? 'ok' : 'falha'}"><span>${r.ok ? '✓' : '!'}</span><span>${esc(r.mensagem || '')}</span></div>`;
}

$$('[data-ir]').forEach((b) => b.addEventListener('click', () => irPara(+b.dataset.ir)));
$$('[data-voltar]').forEach((b) => b.addEventListener('click', () => irPara(+b.dataset.voltar)));

$('#btnSubirEvolution')?.addEventListener('click', async (e) => {
  const b = e.target; b.disabled = true; b.textContent = 'Ligando…';
  const r = await api('/api/whatsapp/docker', { method: 'POST' });
  mostrarResultado('#resWA', { ok: r.ok, mensagem: r.mensagem });
  b.disabled = false; b.textContent = 'Ligar Evolution';
});

$('#btnTestarWA')?.addEventListener('click', async (e) => {
  const b = e.target; b.disabled = true; b.textContent = 'Testando…';
  await salvarPasso1e2();
  const r = await api('/api/testar/evolution', { method: 'POST', body: {
    evolutionUrl: $('#evolutionUrl').value, evolutionKey: $('#evolutionKey').value || 'SALVA',
  } });
  mostrarResultado('#resWA', r);
  b.disabled = false; b.textContent = 'Testar conexão';
});

async function salvarPasso1e2() {
  await api('/api/config', { method: 'POST', body: { api: {
    aiProvider: $('#aiProvider').value, aiBaseUrl: $('#aiBaseUrl').value, aiModel: $('#aiModel').value,
    aiKey: $('#aiKey').value || 'SALVA_MANTEM',
    evolutionUrl: $('#evolutionUrl').value, evolutionKey: $('#evolutionKey').value || 'SALVA_MANTEM',
    evolutionInstancia: $('#evolutionInstancia').value,
  } } });
  $('#aiKey').value = ''; $('#evolutionKey').value = '';
}

async function gerarQR() {
  const area = $('#qrArea');
  area.innerHTML = '<div class="espera">Gerando o código…</div>';
  const r = await api('/api/whatsapp/conectar', { method: 'POST' });
  if (r.estado === 'open') {
    area.innerHTML = '<div class="espera"><strong>WhatsApp já conectado</strong><br>Pode continuar.</div>';
    atualizarChips();
    return;
  }
  if (!r.ok) {
    area.innerHTML = `<div class="espera">${esc(r.mensagem || 'Não consegui gerar o código')}</div>`;
    return;
  }
  if (!r.qr) {
    area.innerHTML = '<div class="espera">A conexão está iniciando. Em 10 segundos o código aparece aqui.</div>';
  } else {
    area.innerHTML = `<img alt="QR Code para conectar o WhatsApp" src="${r.qr}">`;
  }
  acompanharConexao();
}

let vigiando = null;
function acompanharConexao() {
  clearInterval(vigiando);
  let voltas = 0;
  vigiando = setInterval(async () => {
    voltas++;
    const s = await api('/api/whatsapp/status');
    if (s.estado === 'open') {
      clearInterval(vigiando);
      $('#qrArea').innerHTML = `<div class="espera"><strong>Conectado</strong><br>O número ${esc(s.numero || '')} está ligado ao bot.</div>`;
      toast('WhatsApp conectado');
      ESTADO = await api('/api/estado');
      atualizarChips();
    } else if (voltas % 3 === 0) gerarQR();
  }, 4000);
}

$('#btnGerarQR')?.addEventListener('click', gerarQR);

const lerProdutos = (texto) => texto.split('\n').filter((l) => l.trim()).map((l) => {
  const [nome = '', preco = '', desc = ''] = l.split(';').map((s) => s.trim());
  return { nome, preco, desc };
}).filter((p) => p.nome);

$('#btnFinalizar')?.addEventListener('click', async () => {
  await api('/api/config', { method: 'POST', body: { negocio: {
    nome: $('#negNome').value, bot: $('#negBot').value, whatsappDono: $('#negDono').value.replace(/\D/g, ''),
    horario: $('#negHorario').value, produtos: lerProdutos($('#negProdutos').value),
    pagamento: $('#negPagamento').value, prazo: $('#negPrazo').value, naoFalar: $('#negNaoFalar').value,
  } } });
  await api('/api/bot', { method: 'POST', body: { ativo: true } });
  mostrarResultado('#resFim', { ok: true, mensagem: 'Tudo salvo. Abrindo o painel' });
  setTimeout(() => carregar(), 700);
});

// ---------- painel ----------
async function atualizarChips() {
  if (!ESTADO) return;
  const { whatsapp, ia, ativo } = ESTADO;
  const cw = $('#chipWhats');
  cw.className = 'chip clicavel ' + (whatsapp.conectado ? 'ok' : whatsapp.estado === 'offline' ? 'erro' : 'alerta');
  cw.lastElementChild.textContent = whatsapp.conectado ? 'WhatsApp conectado' : whatsapp.estado === 'offline' ? 'WhatsApp indisponível' : 'WhatsApp desconectado';
  const ci = $('#chipIA');
  ci.className = 'chip ' + (ESTADO.config.temChaveIA ? 'ok' : 'erro');
  ci.lastElementChild.textContent = ESTADO.config.temChaveIA ? 'IA pronta' : 'IA sem chave';
  const b = $('#btnLigar');
  b.hidden = false;
  b.textContent = ativo ? 'Desligar' : 'Ligar atendimento';
  b.className = 'btn ' + (ativo ? '' : 'primario');
  $('#caminho').textContent = ativo ? 'Atendendo' : 'Atendimento parado';
}

$('#btnLigar')?.addEventListener('click', async () => {
  const r = await api('/api/bot', { method: 'POST', body: { ativo: !ESTADO.ativo } });
  toast(r.ativo ? 'Atendimento ligado' : 'Atendimento desligado');
  await carregar();
});

async function carregar() {
  ESTADO = await api('/api/estado');
  if (!ESTADO.config.temChaveIA || !ESTADO.config.temEvolution) { abrirSetup(); return; }
  abrirPainel();
  atualizarChips();
  preencherNegocio();
  preencherChaves();
  desenharNumeros();
  desenharEventos();
  if (!$('[data-tela="conversas"]').classList.contains('escondido')) await desenharLista();
  if (!$('[data-tela="clientes"]').classList.contains('escondido')) await desenharListaLeads();
}

function abrirSetup() {
  $('#setup').classList.remove('escondido');
  $('#painel').classList.add('escondido');
  $('#caminho').textContent = 'Configuração';
  $('#btnLigar').hidden = true;
  const c = ESTADO.config;
  $('#aiProvider').value = c.api.aiProvider || 'xkiro';
  $('#aiBaseUrl').value = c.api.aiBaseUrl || PROVEDORES.xkiro;
  $('#evolutionUrl').value = c.api.evolutionUrl || 'http://localhost:8080';
  $('#evolutionInstancia').value = c.api.evolutionInstancia || 'meubot';
  if (c.api.aiKey?.preenchido) $('#aiKey').placeholder = 'salva';
  irPara(1);
}

function abrirPainel() {
  $('#setup').classList.add('escondido');
  $('#painel').classList.remove('escondido');
}

$$('.aba').forEach((a) => a.addEventListener('click', async () => {
  $$('.aba').forEach((x) => x.classList.toggle('on', x === a));
  $$('[data-tela]').forEach((s) => {
    const mostrar = s.dataset.tela === a.dataset.aba;
    s.classList.toggle('escondido', !mostrar);
    if (!mostrar) return;
    // cada troca de aba entra deslizando de leve
    s.classList.remove('entrando');
    void s.offsetWidth;
    s.classList.add('entrando');
  });
  if (a.dataset.aba === 'conversas') await desenharLista();
  if (a.dataset.aba === 'clientes') await desenharListaLeads();
}));

$$('.filtro[data-f]').forEach((f) => f.addEventListener('click', () => {
  $$('.filtro[data-f]').forEach((x) => x.classList.toggle('on', x === f));
  filtro = f.dataset.f;
  desenharLista();
}));

let CONVERSAS = [];
async function desenharLista() {
  CONVERSAS = await api('/api/leads');
  const doFiltro = CONVERSAS.filter((l) => {
    if (filtro === 'todos') return true;
    if (filtro === 'humano') return l.pausado;
    return l.status === filtro;
  });
  const el = $('#listaConv');
  if (!doFiltro.length) {
    el.innerHTML = `<div class="vazio-lista">${CONVERSAS.length ? 'Nenhuma conversa neste filtro.' : 'Sem conversas ainda. Quando alguém escrever para o seu WhatsApp, aparece aqui.'}</div>`;
    return;
  }
  el.innerHTML = doFiltro.map((l) => `
    <button class="conv ${conversaAberta === l.numero ? 'on' : ''}" data-num="${l.numero}">
      <span class="avatar">${esc(inicial(l.nome || l.numero))}</span>
      <span class="txt">
        <span class="nome">${esc(l.nome || 'Cliente')}${l.pausado ? ' <span class="tag humano">você</span>' : ''}</span>
        <span class="numero">${esc(l.numero)}</span>
        <span class="prev">${esc(ultimoTexto(l.ultima))}</span>
      </span>
    </button>`).join('');
  $$('.conv', el).forEach((b) => b.addEventListener('click', () => abrirConversa(b.dataset.num)));
  if (conversaAberta) $$('.conv').forEach((b) => b.classList.toggle('on', b.dataset.num === conversaAberta));
}

async function abrirConversa(num) {
  conversaAberta = num;
  $$('.conv').forEach((b) => b.classList.toggle('on', b.dataset.num === num));
  const c = await api('/api/lead/' + num);
  const j = $('#janela');
  j.innerHTML = `
    <div class="topo">
      <span class="avatar" style="width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--painel-alt);border:1px solid var(--linha);font-size:12px;font-weight:600">${esc(inicial(c.nome || num))}</span>
      <div><div class="nome">${esc(c.nome || 'Cliente')}</div><div class="numero">${esc(c.numero)} · <span class="tag ${c.status}">${ROTULO[c.status] || c.status}</span></div></div>
      <div class="acoes">
        ${c.pausado ? '<button class="btn pequeno" data-acao="retomar">Bot volta a responder</button>'
                    : '<button class="btn pequeno" data-acao="pausar">Assumir conversa</button>'}
        <button class="btn pequeno" data-acao="ganho">Venda feita</button>
        <button class="btn pequeno perigo" data-acao="perder">Sem interesse</button>
      </div>
    </div>
    <div class="mensagens" id="msgs">
      ${c.msgs.map((m) => baloesHTML(m)).join('') || '<div class="vazio-conv">Sem mensagens.</div>'}
      <div class="escrevendo" id="escrevendo" aria-label="O bot está escrevendo"><i></i><i></i><i></i></div>
    </div>
    <div class="caixa-responder">
      <textarea id="txtResponder" placeholder="Responder como você, pelo WhatsApp"></textarea>
      <button class="btn primario" id="btnEnviar">Enviar</button>
    </div>`;
  $('#msgs').scrollTop = 1e6;
  ligarEscrevendo(c);
  $('#btnEnviar').addEventListener('click', enviarManual);
  $('#txtResponder').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarManual(); }
  });
  $$('[data-acao]', j).forEach((b) => b.addEventListener('click', async () => {
    await api(`/api/lead/${num}/acao`, { method: 'POST', body: { acao: b.dataset.acao } });
    toast({ ganho: 'Venda registrada', perder: 'Conversa encerrada', pausar: 'Você assumiu: o bot fica quieto aqui', retomar: 'O bot volta a responder' }[b.dataset.acao]);
    await desenharLista(); await abrirConversa(num);
  }));
  desenharLado(c);
}

// "o bot está escrevendo": aparece quando chegou mensagem do cliente e a resposta ainda não saiu
function ligarEscrevendo(aberta) {
  const balao = $('#escrevendo');
  const caixa = $('#msgs');
  if (!balao || !caixa) return;
  const ultima = aberta?.msgs?.length ? aberta.msgs[aberta.msgs.length - 1] : null;
  const esperando = !!ultima && ultima.role === 'user' && !aberta.pausado;
  balao.classList.toggle('on', esperando);
  if (esperando) caixa.scrollTop = 1e6;
}

async function enviarManual() {
  const t = $('#txtResponder').value.trim();
  if (!t) return;
  $('#btnEnviar').disabled = true;
  await api(`/api/lead/${conversaAberta}/acao`, { method: 'POST', body: { acao: 'responder', texto: t } });
  $('#btnEnviar').disabled = false;
  $('#txtResponder').value = '';
  await abrirConversa(conversaAberta);
}

function desenharLado(c) {
  $('#lado').innerHTML = `
    <div class="painel-superficie bloco"><h3>Cliente</h3>
      <dl class="meta"><dt>Número</dt><dd>${esc(c.numero)}</dd><dt>Mensagens</dt><dd>${c.mensagens}</dd>
        <dt>Etapa</dt><dd>${ROTULO[c.status] || c.status}</dd><dt>Bot</dt><dd>${c.pausado ? 'pausado' : 'respondendo'}</dd></dl>
    </div>
    <div class="painel-superficie bloco"><h3>Resumo</h3>
      <div class="resumo-ia">${esc(c.resumo) || 'Aparece quando o cliente pede para falar com você.'}</div>
    </div>`;
}

// Um balão por separador |||, com a hora só no último (é uma mensagem só, dividida em balões no WhatsApp).
const baloesHTML = (m) => {
  const partes = String(m.content ?? '').split('|||').map((x) => x.trim()).filter(Boolean);
  return (partes.length ? partes : ['']).map((p, i, arr) => `
    <div class="bolha ${m.role === 'user' ? 'user' : 'assistant'}">${esc(p)}${i === arr.length - 1 ? `<span class="hora">${hora(m.em)}</span>` : ''}</div>`).join('');
};
const ultimoTexto = (s) => String(s ?? '').split('|||').map((x) => x.trim()).filter(Boolean).join(' ');

function desenharNumeros() {
  const r = ESTADO.resumo;
  const novos = { querFechar: r.querFechar, interessados: r.interessados, conversas: r.conversas, pausadas: r.pausadas };
  const rotulos = { querFechar: 'querendo fechar', interessados: 'interessados', conversas: 'conversas', pausadas: 'esperando você' };
  const el = $('#numeros');
  const existentes = el.querySelectorAll('.num');
  if (existentes.length === 4) {
    // atualização sem redesenhar: só o número que mudou ganha a animação de subir
    Object.keys(novos).forEach((k, i) => {
      const v = existentes[i].querySelector('.v');
      if (v.textContent !== String(novos[k])) {
        v.textContent = novos[k];
        v.classList.remove('mudou');
        void v.offsetWidth;
        v.classList.add('mudou');
      }
    });
    return;
  }
  const anterior = el.dataset.ultimo;
  el.dataset.ultimo = JSON.stringify(novos);
  el.innerHTML = Object.entries(novos).map(([k, v]) => `
    <div class="painel-superficie num"><div class="v">${v}</div><div class="r">${rotulos[k]}</div></div>`).join('');
}

function desenharEventos() {
  $('#eventos').innerHTML = ESTADO.eventos.length
    ? ESTADO.eventos.map((e) => `<div class="evento"><span class="tipo">${esc(e.tipo)}</span><span>${esc(e.texto)}</span><span class="quando">${quando(e.em)}</span></div>`).join('')
    : '<div class="evento">Nada por aqui ainda. Mensagens enviadas e recebidas aparecem neste quadro.</div>';
}

// ---------- clientes (Google Maps) ----------
let LEADS_MAPS = [];
let chaveGoogleSalva = false;

// enquanto o Google responde, mostra linhas fantasma em vez de uma tela parada
function esqueletoLista() {
  const el = $('#listaLeads');
  if (!el || LEADS_MAPS.length) return;
  el.innerHTML = '<div class="esqueleto"><span></span><span></span><span></span></div>'.repeat(3);
}

async function desenharListaLeads() {
  const r = await api('/api/leads/lista');
  LEADS_MAPS = r.leads || [];
  chaveGoogleSalva = !!r.chaveGoogle?.preenchido;
  if (chaveGoogleSalva && !$('#buscaChave').value) $('#buscaChave').placeholder = 'chave salva — cole outra para trocar';
  $('#buscaTermo').value = $('#buscaTermo').value || r.ultimaBusca?.termo || '';
  $('#buscaCidade').value = $('#buscaCidade').value || r.ultimaBusca?.cidade || '';
  $('#tituloLeads').textContent = LEADS_MAPS.length ? `${LEADS_MAPS.length} contato(s) na lista` : 'Contatos encontrados';
  const el = $('#listaLeads');
  if (!LEADS_MAPS.length) {
    el.innerHTML = '<div class="vazio-lista">Nenhum contato ainda. Use a busca acima para trazer empresas do Google Maps.</div>';
    return;
  }
  el.innerHTML = LEADS_MAPS.map((l) => `
    <div class="lead" data-id="${esc(l.placeId)}">
      <div class="info">
        <div class="nome">${esc(l.nome)}</div>
        ${l.endereco ? `<div class="secundario">${esc(l.endereco)}</div>` : ''}
        <div class="detalhe">
          ${l.telefone ? `<span>${esc(l.telefone)}</span>` : '<span>sem telefone</span>'}
          ${l.nota ? `<span>${l.nota} · ${l.avaliacoes} avaliações</span>` : ''}
          ${l.site ? `<span>tem site</span>` : ''}
          <span class="tag ${l.status}">${ROTULO_PROSPECTO[l.status] || l.status}</span>
        </div>
      </div>
      <div class="acoes">
        <button class="btn pequeno" data-acao="sugestao" ${l.whatsapp ? '' : 'disabled'}>Sugerir mensagem</button>
        <button class="btn pequeno primario" data-acao="enviar" ${l.whatsapp && l.status !== 'enviado' ? '' : 'disabled'}>Enviar</button>
        <button class="btn pequeno perigo" data-acao="apagar">Remover</button>
      </div>
    </div>`).join('');

  $$('.lead', el).forEach((linha) => {
    const l = LEADS_MAPS.find((x) => x.placeId === linha.dataset.id);
    $$('[data-acao]', linha).forEach((b) => b.addEventListener('click', async () => {
      const acao = b.dataset.acao;
      if (acao === 'apagar') {
        if (!confirm(`Remover ${l.nome} da lista?`)) return;
        await api(`/api/leads/${l.placeId}`, { method: 'POST', body: { acao: 'apagar' } });
        return desenharListaLeads();
      }
      if (acao === 'sugestao') {
        b.disabled = true; b.textContent = 'Escrevendo…';
        const r = await api('/api/leads/sugestao', { method: 'POST', body: { nome: l.nome, endereco: l.endereco, nota: l.nota } });        b.disabled = false; b.textContent = 'Sugerir mensagem';
        if (!r.ok) return toast(r.mensagem || 'A IA não respondeu');
        return abrirJanelaEnvio(l, r.texto);
      }
      if (acao === 'enviar') return abrirJanelaEnvio(l, '');
    }));
  });
}

function abrirJanelaEnvio(l, texto) {
  const dlg = $('#dlgEnvio');
  $('#envioTitulo').textContent = l.nome;
  $('#envioNumero').textContent = l.whatsapp || l.telefone || '';
  $('#envioTexto').value = texto;
  $('#envioResultado').innerHTML = '';
  dlg.dataset.id = l.placeId;
  dlg.showModal();
  $('#envioTexto').focus();
}
$('#btnFecharEnvio')?.addEventListener('click', () => $('#dlgEnvio').close());

$('#btnEnviarLead')?.addEventListener('click', async (e) => {
  const b = e.target;
  const id = $('#dlgEnvio').dataset.id;
  const texto = $('#envioTexto').value.trim();
  if (!texto) return ($('#envioResultado').innerHTML = '<div class="resultado falha"><span>!</span><span>Escreva a mensagem antes de enviar.</span></div>');
  b.disabled = true; b.textContent = 'Enviando…';
  const r = await api(`/api/leads/${id}/enviar`, { method: 'POST', body: { texto } });
  b.disabled = false; b.textContent = 'Enviar no WhatsApp';
  if (r.ok) {
    $('#dlgEnvio').close();
    toast('Mensagem enviada');
    await desenharListaLeads();
  } else {
    $('#envioResultado').innerHTML = `<div class="resultado falha"><span>!</span><span>${esc(r.mensagem || 'Não deu para enviar')}</span></div>`;
  }
});

$('#btnBuscar')?.addEventListener('click', async (e) => {
  const b = e.target;
  const termo = $('#buscaTermo').value.trim();
  if (!termo) return toast('Escreva o que você procura');
  if (!$('#buscaChave').value && !chaveGoogleSalva) return toast('Cole a chave da API do Google');
  b.disabled = true; b.classList.add('carregando');
  $('#resBusca').innerHTML = '<div class="resultado"><span>·</span><span>Consultando o Google Maps e o telefone de cada empresa. Pode levar alguns segundos.</span></div>';
  esqueletoLista();
  const r = await api('/api/leads/buscar', { method: 'POST', body: {
    termo, cidade: $('#buscaCidade').value.trim(), googleKey: $('#buscaChave').value || 'SALVA',
  } });
  b.disabled = false; b.classList.remove('carregando');
  if (r.ok) {
    $('#buscaChave').value = '';
    if (r.novos) chaveGoogleSalva = true;
    $('#resBusca').innerHTML = `<div class="resultado ok"><span>✓</span><span>${esc(r.mensagem)} ${r.comTelefone} de ${r.encontrados} têm telefone.</span></div>`;
    await desenharListaLeads();
  } else {
    $('#resBusca').innerHTML = `<div class="resultado falha"><span>!</span><span>${esc(r.mensagem || 'A busca falhou')}</span></div>`;
  }
});
$('#btnAtualizarLeads')?.addEventListener('click', desenharListaLeads);

// ---------- conectar WhatsApp pelo painel ----------
$('#chipWhats')?.addEventListener('click', () => {
  if (ESTADO?.whatsapp.conectado) return desenharConexao();
  abrirQRPainel();
});

async function abrirQRPainel() {
  const dlg = $('#dlgQR');
  $('#qrArea2').innerHTML = '<div class="espera">Ligando a Evolution e gerando o código… pode levar até 1 minuto.</div>';
  dlg.showModal();
  await novoQRPainel();
}
async function novoQRPainel() {
  const r = await api('/api/whatsapp/qr', { method: 'POST' });
  if (!r.ok) { $('#qrArea2').innerHTML = `<div class="espera">${esc(r.mensagem || 'Não consegui gerar o código')}</div>`; return; }
  if (r.jaConectado) { $('#qrArea2').innerHTML = '<div class="espera"><strong>Já está conectado</strong></div>'; return; }
  if (!r.qr) { $('#qrArea2').innerHTML = '<div class="espera">A conexão está iniciando. Clique em "Gerar novo código" em 10 segundos.</div>'; return; }
  $('#qrArea2').innerHTML = `<img alt="QR Code para conectar o WhatsApp" src="${r.qr}">`;
  clearInterval(vigiando);
  vigiando = setInterval(async () => {
    const s = await api('/api/whatsapp/status');
    if (s.estado === 'open') {
      clearInterval(vigiando);
      $('#qrArea2').innerHTML = '<div class="espera"><strong>Conectado</strong><br>O bot já pode receber mensagens.</div>';
      toast('WhatsApp conectado');
      await carregar();
    }
  }, 4000);
}
$('#btnFecharQR')?.addEventListener('click', () => { clearInterval(vigiando); $('#dlgQR').close(); });
$('#btnNovoQR')?.addEventListener('click', novoQRPainel);

function desenharConexao() {
  const dlg = $('#dlgQR');
  if (dlg.open) return;
  const w = ESTADO.whatsapp;
  $('#qrArea2').innerHTML = `
    <div class="espera">
      <strong>${w.conectado ? 'WhatsApp conectado' : 'WhatsApp não está conectado'}</strong><br>
      <span style="font-size:13.5px">${w.conectado ? 'Para trocar de número, desconecte e escaneie o novo código.' : 'Clique em "Gerar novo código" e escaneie com o celular.'}</span>
      ${w.conectado ? '<div style="margin-top:14px"><button class="btn perigo" id="btnDesconectar">Desconectar este número</button></div>' : ''}
    </div>`;
  $('#btnDesconectar')?.addEventListener('click', async () => {
    if (!confirm('Desconectar o WhatsApp? O bot para de receber mensagens até você escanear de novo.')) return;
    await api('/api/whatsapp/desconectar', { method: 'POST' });
    toast('WhatsApp desconectado');
    await carregar();
    dlg.close();
  });
  dlg.showModal();
}

function preencherNegocio() {
  const n = ESTADO.config.negocio;
  $('#eNegNome').value = n.nome || '';
  $('#eNegBot').value = n.bot || '';
  $('#eNegDono').value = n.whatsappDono || '';
  $('#eNegHorario').value = n.horario || '';
  $('#eNegProdutos').value = (n.produtos || []).map((p) => [p.nome, p.preco, p.desc].filter(Boolean).join('; ')).join('\n');
  $('#eNegPagamento').value = n.pagamento || '';
  $('#eNegPrazo').value = n.prazo || '';
  $('#eNegNaoFalar').value = n.naoFalar || '';
}
$('#btnSalvarNegocio')?.addEventListener('click', async () => {
  await api('/api/config', { method: 'POST', body: { negocio: {
    nome: $('#eNegNome').value, bot: $('#eNegBot').value, whatsappDono: $('#eNegDono').value.replace(/\D/g, ''),
    horario: $('#eNegHorario').value, produtos: lerProdutos($('#eNegProdutos').value),
    pagamento: $('#eNegPagamento').value, prazo: $('#eNegPrazo').value, naoFalar: $('#eNegNaoFalar').value,
  } } });
  await carregar();
  toast('Salvo. A IA já usa o texto novo');
});

function preencherChaves() {
  const a = ESTADO.config.api;
  $('#kAiModel').value = a.aiModel || '';
  $('#kAltModel').value = a.altModel || '';
  if (a.aiKey?.preenchido) $('#kAiKey').placeholder = a.aiKey.dica;
  if (a.altKey?.preenchido) $('#kAltKey').placeholder = a.altKey.dica;
  if (a.groqKey?.preenchido) $('#kGroqKey').placeholder = a.groqKey.dica;
  if (a.evolutionKey?.preenchido) $('#kEvolutionKey').placeholder = a.evolutionKey.dica;
}

$('#btnSalvarChaves')?.addEventListener('click', async () => {
  await api('/api/config', { method: 'POST', body: { api: {
    aiKey: $('#kAiKey').value || 'SALVA_MANTEM', altKey: $('#kAltKey').value || 'SALVA_MANTEM',
    groqKey: $('#kGroqKey').value || 'SALVA_MANTEM', evolutionKey: $('#kEvolutionKey').value || 'SALVA_MANTEM',
    aiModel: $('#kAiModel').value, altModel: $('#kAltModel').value,
  } } });
  ['#kAiKey', '#kAltKey', '#kGroqKey', '#kEvolutionKey'].forEach((s) => ($(s).value = ''));
  await carregar();
  toast('Chaves salvas');
});

$('#btnTestarTudo')?.addEventListener('click', async (e) => {
  const b = e.target; b.disabled = true; b.textContent = 'Testando…';
  const corpo = {
    aiKey: $('#kAiKey').value || 'SALVA', altKey: $('#kAltKey').value || 'SALVA',
    groqKey: $('#kGroqKey').value || 'SALVA', evolutionKey: $('#kEvolutionKey').value || 'SALVA',
  };
  const [ia, alt, au, ev] = await Promise.all([
    api('/api/testar/ia', { method: 'POST', body: corpo }),
    api('/api/testar/alternativa', { method: 'POST', body: corpo }),
    api('/api/testar/audio', { method: 'POST', body: corpo }),
    api('/api/testar/evolution', { method: 'POST', body: corpo }),
  ]);
  $('#resChaves').innerHTML = [
    ['IA principal', ia], ['IA reserva', alt], ['Áudio', au], ['WhatsApp', ev],
  ].map(([n, r]) => `<div class="resultado ${r.ok ? 'ok' : 'falha'}"><span>${r.ok ? '✓' : '!'}</span><span><strong>${n}:</strong> ${esc(r.mensagem || '')}</span></div>`).join('');
  b.disabled = false; b.textContent = 'Testar tudo';
});

// ---------- tutorial guiado ----------
const ROTEIRO_SETUP = [
  { alvo: '.setup .cabeca', titulo: 'Configuração em 4 passos', texto: 'Nenhum campo é definitivo: dá para mudar tudo depois, com o atendimento rodando. Se travar no meio, feche e abra o app — o que foi preenchido continua salvo.' },
  { alvo: '[data-passo="1"]', titulo: 'A chave da IA', texto: 'Cole a chave do provedor e clique em "Testar chave". Um aviso verde com o tempo de resposta quer dizer que está valendo. Aviso de saldo quer dizer que a conta está sem crédito, não que a chave esteja errada.' },
  { alvo: '[data-passo="2"]', titulo: 'A conexão com o WhatsApp', texto: 'O app usa a Evolution API como ponte. Se ela já estiver no ar, use "Testar conexão". Se não, clique em "Ligar Evolution" e espere até um minuto.' },
  { alvo: '[data-passo="3"]', titulo: 'Ler o QR Code', texto: 'No celular do número que vai atender: Dispositivos conectados › Conectar dispositivo. Aponte a câmera. O código expira em cerca de 40 segundos; se não der tempo, gere de novo.' },
  { alvo: '[data-passo="4"]', titulo: 'Seu negócio', texto: 'Produtos, preços e prazo precisam ser os reais: o que estiver errado aqui sai errado no WhatsApp. O "seu WhatsApp" é o número onde você recebe o aviso quando um cliente quer fechar.' },
];
const ROTEIRO_PAINEL = [
  { alvo: '.marca', titulo: 'O app fica aberto atendendo', texto: 'Se fechar a janela, o bot para de responder — mas nenhuma conversa se perde, tudo fica salvo em Conversas. O botão do sol/lua, ao lado, alterna entre tema claro e escuro.' },
  { alvo: '#chipWhats', titulo: 'Estado do WhatsApp', texto: 'Verde: conectado. Clique no indicador para ver o QR Code de novo, trocar de número ou desconectar.' },
  { alvo: '#btnLigar', titulo: 'Ligar e desligar', texto: 'Liga e desliga o atendimento na hora. Desligado, as mensagens continuam chegando, mas ninguém responde.' },
  { alvo: '.abas', titulo: 'As cinco abas', texto: 'Conversas é o dia a dia. Clientes traz empresas do Google Maps para você procurar. Resumo mostra os números. Negócio é o texto que a IA usa. Conexões serve para trocar chaves e testar.' },
  { alvo: '#filtros', titulo: 'Quem precisa de você', texto: '"Querem fechar" são clientes pedindo para comprar — o filtro mais importante do dia. "Precisam de mim" são conversas que o bot pausou para você assumir.' },
  { alvo: '#listaConv', titulo: 'Cada conversa', texto: 'À esquerda ficam as conversas com a etapa de cada cliente. Quem escreveu aparece com a etiqueta "você" quando o bot está pausado.' },
  { alvo: '#janela', titulo: 'O que o bot respondeu', texto: 'Clique numa conversa para ler tudo, balão por balão. Dá para responder por aqui, assumir a conversa e registrar a venda.' },
  { alvo: '#lado', titulo: 'O resumo', texto: 'Quando o cliente pede para falar com você, a IA escreve um resumo curto: o que ele quer e onde parou. Não precisa reler a conversa inteira.' },
];
const ROTEIRO_CLIENTES = [
  { alvo: '#formBusca', titulo: 'Procurar clientes no Google Maps', texto: 'Escreva o tipo de empresa e a cidade. O app traz nome, endereço, nota e telefone — e só faz isso quando você clica em Buscar. A busca é opcional: nada roda sozinha e nada é enviado sem você mandar.' },
  { alvo: '#listaLeads', titulo: 'A lista', texto: 'Cada empresa encontrada fica aqui como sugestão. "Sugerir mensagem" pede um texto à IA, que você pode editar antes. "Enviar" abre a mensagem para revisar. Só sai depois do seu clique em Enviar no WhatsApp.' },
  { alvo: '#buscaChave', titulo: 'Sua chave do Google', texto: 'É uma chave da Places API (New), do Google Cloud. Fica salva no seu computador, igual às outras, e nunca aparece inteira na tela.' },
];

let tourPassos = [];
let tourIndice = 0;

function iniciarTutorial(roteiro) {
  tourPassos = roteiro.filter((p) => $(p.alvo) && !$(p.alvo).classList.contains('escondido'));
  if (!tourPassos.length) return;
  tourIndice = 0;
  $('#tour').hidden = false;
  mostrarPassoTour();
}
function mostrarPassoTour() {
  const p = tourPassos[tourIndice];
  const el = $(p.alvo);
  const r = el.getBoundingClientRect();
  const alvo = $('#tourAlvo');
  const cartao = $('#tourCartao');
  alvo.style.top = `${r.top - 6}px`; alvo.style.left = `${r.left - 6}px`;
  alvo.style.width = `${r.width + 12}px`; alvo.style.height = `${r.height + 12}px`;
  $('#tourContador').textContent = `${tourIndice + 1} de ${tourPassos.length}`;
  $('#tourTitulo').textContent = p.titulo;
  $('#tourTexto').textContent = p.texto;
  $('#tourVoltar').hidden = tourIndice === 0;
  $('#tourProximo').textContent = tourIndice === tourPassos.length - 1 ? 'Começar a usar' : 'Entendi';
  const larg = Math.min(360, window.innerWidth - 32);
  const altura = cartao.offsetHeight || 200;
  let top = r.bottom + 14;
  if (top + altura > window.innerHeight - 12) top = Math.max(12, r.top - altura - 14);
  const left = Math.min(Math.max(16, r.left + r.width / 2 - larg / 2), window.innerWidth - larg - 16);
  cartao.style.top = `${top}px`; cartao.style.left = `${left}px`;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function fecharTutorial() {
  $('#tour').hidden = true;
  localStorage.setItem('botdpt.tutorial.painel', '1');
  localStorage.setItem('botdpt.tutorial.setup', '1');
}
$('#tourProximo')?.addEventListener('click', () => {
  if (tourIndice < tourPassos.length - 1) { tourIndice++; mostrarPassoTour(); return; }
  const eraSetup = !$('#setup').classList.contains('escondido') && !ESTADO?.config.temChaveIA;
  fecharTutorial();
  if (eraSetup) localStorage.removeItem('botdpt.tutorial.painel');
});
$('#tourVoltar')?.addEventListener('click', () => { if (tourIndice > 0) { tourIndice--; mostrarPassoTour(); } });
$('#tourPular')?.addEventListener('click', fecharTutorial);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#tour').hidden) fecharTutorial(); });
window.addEventListener('resize', () => { if (!$('#tour').hidden) mostrarPassoTour(); });
$('#btnTutorial')?.addEventListener('click', () => {
  if (!$('#setup').classList.contains('escondido')) return iniciarTutorial(ROTEIRO_SETUP);
  const aba = $('.aba.on')?.dataset.aba;
  iniciarTutorial(aba === 'clientes' ? ROTEIRO_CLIENTES : ROTEIRO_PAINEL);
});

// ---------- inicialização ----------
carregar().then(() => {
  if (ESTADO && !ESTADO.config.temChaveIA && !localStorage.getItem('botdpt.tutorial.setup')) iniciarTutorial(ROTEIRO_SETUP);
  else if (!localStorage.getItem('botdpt.tutorial.painel')) iniciarTutorial(ROTEIRO_PAINEL);
});
setInterval(async () => {
  if ($('#painel').classList.contains('escondido')) return;
  if (!$('#tour').hidden) return;
  const antes = ESTADO;
  ESTADO = await api('/api/estado');
  atualizarChips(); desenharNumeros(); desenharEventos();
  const novos = ESTADO.resumo.conversas !== antes?.resumo.conversas ||
    ESTADO.resumo.querFechar !== antes?.resumo.querFechar;
  if (novos && !$('[data-tela="conversas"]').classList.contains('escondido')) await desenharLista();
}, 6000);
