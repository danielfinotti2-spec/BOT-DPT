import fs from 'fs';
import { dirname } from 'path';

// Gerenciador da Evolution API: cria instância, conecta (QR), status e webhook.
// Se não houver Evolution configurada, cai no "modo local": você cola a URL+chave de uma
// Evolution já existente, ou roda sem WhatsApp (só teste de IA no painel).
const CACHE = () => process.env.ATENDE_ARQ_EVOLUTION || 'data/evolution.json';
const ler = () => { try { return JSON.parse(fs.readFileSync(CACHE(), 'utf8')); } catch { return {}; } };
const gravar = (o) => { const arq = CACHE();
  fs.mkdirSync(dirname(arq), { recursive: true }); fs.writeFileSync(arq, JSON.stringify(o, null, 2)); };

async function req(cfg, metodo, caminho, corpo) {
  const base = String(cfg.api.evolutionUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('Evolution API não configurada');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  let r;
  try {
    r = await fetch(`${base}${caminho}`, {
      method: metodo, signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', apikey: cfg.api.evolutionKey || '' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Evolution não respondeu a tempo' : 'Não consegui falar com a Evolution API (ela está ligada?)');
  } finally { clearTimeout(t); }
  const txt = await r.text();
  let json; try { json = txt ? JSON.parse(txt) : {}; } catch { json = { raw: txt }; }
  if (!r.ok) {
    const msg = json?.response?.message || json?.message || json?.error || `HTTP ${r.status}`;
    throw Object.assign(new Error(Array.isArray(msg) ? msg.join(', ') : String(msg)), { status: r.status });
  }
  return json;
}

// Descobre qual número está ligado a uma instância (a Evolution mostra o dono em ownerJid).
export async function donoDaInstancia(cfg, nome) {
  try {
    const lista = await req(cfg, 'GET', '/instance/fetchInstances');
    const achada = (Array.isArray(lista) ? lista : []).find((i) => i?.name === nome || i?.instance?.instanceName === nome);
    if (!achada) return null;
    return {
      jid: achada.ownerJid || null,
      nome: achada.profileName || null,
      conectada: achada.connectionStatus === 'open',
    };
  } catch { return null; }
}

export function criarEvolution(cfg) {
  const inst = () => cfg.instancia || 'bot';

  async function status() {
    if (!cfg.api.evolutionUrl || !cfg.api.evolutionKey) return { estado: 'sem-config' };
    try {
      const r = await req(cfg, 'GET', `/instance/connectionState/${inst()}`);
      const estado = r?.instance?.state || 'desconhecido';
      const numero = ler().numero || '';
      // "close" pode significar sessão encerrada ou instância que nunca foi conectada;
      // a lista de instâncias é a fonte da verdade nesse caso.
      if (estado === 'open') {
        const dono = numero ? null : await donoDaInstancia(cfg, inst());
        const ligado = dono?.jid ? dono.jid.split('@')[0] : numero;
        if (ligado) gravar({ ...ler(), numero: ligado });
        return { estado, numero: ligado, conectado: true, nome: dono?.nome || null };
      }
      const dono = await donoDaInstancia(cfg, inst());
      return { estado, numero: dono?.jid ? dono.jid.split('@')[0] : numero, conectado: false, dono };
    } catch (e) {
      if (e.status === 404) {
        // A Evolution responde 404 tanto para "instância não existe" quanto para "instância sem sessão".
        // Se a instância aparece na lista, é só uma sessão encerrada (pronta para novo QR).
        try {
          const lista = await req(cfg, 'GET', '/instance/fetchInstances');
          const existe = Array.isArray(lista) && lista.some((i) => (i?.name || i?.instance?.instanceName) === inst());
          if (existe) return { estado: 'desconectado', conectado: false, numero: ler().numero || '' };
        } catch { /* segue como não existe */ }
        return { estado: 'nao-existe', conectado: false };
      }
      return { estado: 'offline', erro: e.message, conectado: false };
    }
  }

  async function criar() {
    try {
      await req(cfg, 'POST', '/instance/create', {
        instanceName: inst(), integration: 'WHATSAPP-BAILEYS', qrcode: true,
        webhook: { enabled: true, url: cfg.webhookUrl, byEvents: false, base64: true, events: ['MESSAGES_UPSERT'] },
      });
    } catch (e) {
      if (!/already|existe|in use/i.test(e.message)) throw e;
    }
    return conectar();
  }

  async function conectar() {
    const r = await req(cfg, 'GET', `/instance/connect/${inst()}`);
    const qr = r?.base64 || (r?.code ? null : null) || r?.qrcode?.base64;
    const codigo = r?.code || r?.qrcode?.code;
    const pareamento = r?.pairingCode;
    return { qr, codigo, pareamento };
  }

  async function sair() {
    await req(cfg, 'DELETE', `/instance/logout/${inst()}`).catch(() => {});
    return status();
  }

  async function configurarWebhook() {
    await req(cfg, 'POST', `/webhook/set/${inst()}`, {
      webhook: { enabled: true, url: cfg.webhookUrl, byEvents: false, base64: true, events: ['MESSAGES_UPSERT'] },
    });
  }

  async function enviar(numero, texto) {
    await req(cfg, 'POST', `/message/sendText/${inst()}`, { number: numero, text: texto });
  }

  // Compatível com o formato usado pelo server.js original.
  async function post(caminho, corpo) { return req(cfg, 'POST', `${caminho}/${inst()}`, corpo); }

  return { status, criar, conectar, sair, configurarWebhook, enviar, post, verificar: () => req(cfg, 'GET', '/instance/fetchInstances').then(() => true) };
}
