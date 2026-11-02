import { app, BrowserWindow, shell, ipcMain, nativeTheme } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

// pasta deste arquivo (o main é um módulo ES, aqui não existe __dirname)
const PASTA_ELECTRON = path.dirname(fileURLToPath(import.meta.url));

// O app é uma janela própria. Dentro dela roda o servidor do bot (servidor-painel.js)
// usando o Node embutido no aplicativo — por isso não é preciso instalar nada.
const PORTA = 3100;
const PASTA_DADOS = path.join(app.getPath('userData'), 'dados'); // config, conversas e caches
let servidor = null;
let janela = null;

app.setAppUserModelId('com.botdpt.app');
app.setName('BOT DPT');

function primeiroLog() {
  const arquivo = path.join(app.getPath('userData'), 'servidor.log');
  return fs.createWriteStream(arquivo, { flags: 'a' });
}

function pastasDoApp() {
  // Em desenvolvimento usamos a pasta do projeto; empacotado, a pasta extraResources.
  if (app.isPackaged) {
    return {
      app: path.join(process.resourcesPath, 'app'),
      node: path.join(process.resourcesPath, 'node', 'node.exe'),
      electron: PASTA_ELECTRON,
    };
  }
  const raiz = path.join(process.env.APP_ROOT || process.cwd());
  return { app: raiz, node: null, electron: path.join(raiz, 'electron') };
}

function subirServidor() {
  const raiz = pastasDoApp();
  fs.mkdirSync(PASTA_DADOS, { recursive: true });
  const cwd = path.join(PASTA_DADOS);
  const script = path.join(raiz.app, 'servidor-painel.js');
  const env = {
    ...process.env,
    PORT: String(PORTA),
    ATENDE_DADOS: PASTA_DADOS,
    ATENDE_RAIZ: raiz.app, // onde ficam .env, lista.csv e o .env.example
    EVOLUTION_DOCKER: process.env.EVOLUTION_DOCKER || '1',
  };

  if (raiz.node && fs.existsSync(raiz.node)) {
    servidor = spawn(raiz.node, [script], { cwd, env, windowsHide: true });
  } else {
    // modo desenvolvedor: usa o Node do sistema
    servidor = spawn(process.env.NODE_BIN || 'node', [script], { cwd, env, windowsHide: true });
  }
  const log = primeiroLog();
  servidor.stdout.pipe(log);
  servidor.stderr.pipe(log);
  servidor.on('error', (e) => log.write(`\n[falha ao iniciar o servidor: ${e.message}]\n`));
  servidor.on('exit', (codigo) => {
    log.write(`\n[servidor encerrou com código ${codigo}]\n`);
    if (!app.isQuitando) carregarJanela();
  });
}

function servidorPronto(tentativas = 60) {
  return new Promise((ok) => {
    const tenta = (n) => {
      const req = http.get(`http://127.0.0.1:${PORTA}/api/estado`, (r) => { r.resume(); ok(true); });
      req.on('error', () => (n <= 0 ? ok(false) : setTimeout(() => tenta(n - 1), 500)));
      req.setTimeout(1000, () => req.destroy());
    };
    tenta(tentativas);
  });
}

function carregarJanela() {
  if (!janela) return;
  janela.loadURL(`http://127.0.0.1:${PORTA}`).catch(() => {
    // servidor ainda não subiu: mostra a tela de carregamento e tenta de novo em seguida
    if (janela) janela.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(telaCarregando()));
  });
}

function telaCarregando() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>BOT DPT</title>
  <style>
    html,body{height:100%;margin:0;background:#131514;color:#ecede9;
      font-family:"Segoe UI",system-ui,sans-serif;display:grid;place-items:center}
    .c{text-align:center;padding:32px}
    h1{font-size:17px;font-weight:600;margin:0 0 6px;letter-spacing:-.01em}
    p{font-size:13.5px;color:#a3a8a4;margin:0}
    .b{width:22px;height:22px;border:2px solid #2b2f2d;border-top-color:#35996b;border-radius:50%;
      margin:0 auto 16px;animation:g .8s linear infinite}
    @keyframes g{to{transform:rotate(360deg)}}
  </style></head><body><div class="c">
    <div class="b"></div>
    <h1>BOT DPT</h1>
    <p id="m">Ligando o atendimento…</p>
  </div></body></html>`;
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 380,
    minHeight: 620,
    backgroundColor: '#131514',
    title: 'BOT DPT',
    frame: false, // sem a moldura do Windows: a janela traz só a sua própria barra de título
    titleBarStyle: 'hidden',
    show: false,
    icon: path.join(pastasDoApp().app, 'build', 'icone.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // empacotado: o preload vive dentro do app.asar (mesma raiz do main.js). Em dev: pasta do projeto.
      preload: app.isPackaged ? path.join(PASTA_ELECTRON, 'preload.cjs') : path.join(pastasDoApp().electron, 'preload.cjs'),
    },
  });
  janela.setMenuBarVisibility(false);
  janela.once('ready-to-show', () => { if (janela && !janela.isVisible()) janela.show(); });
  // links externos abrem no navegador do sistema, nunca dentro do app
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // maximizar/restaurar clicando duas vezes na barra do próprio app
  janela.on('maximize', () => janela.webContents.send('janela:estado', { maximizada: true }));
  janela.on('unmaximize', () => janela.webContents.send('janela:estado', { maximizada: false }));
  carregarJanela();
  janela.on('closed', () => { janela = null; });
}

app.on('quit', () => { app.isQuitando = true; });

// A janela não tem a moldura do Windows: estes comandos vêm dos botões da própria barra do app.
ipcMain.handle('janela:acao', (evento, acao) => {
  const w = BrowserWindow.fromWebContents(evento.sender);
  if (!w) return null;
  if (acao === 'minimizar') w.minimize();
  if (acao === 'maximizar') (w.isMaximized() ? w.unmaximize() : w.maximize());
  if (acao === 'fechar') w.close();
  if (acao === 'estado') return { maximizada: w.isMaximized(), escuro: nativeTheme.shouldUseDarkColors };
  return null;
});

app.whenReady().then(async () => {
  subirServidor();
  criarJanela();
  const ok = await servidorPronto();
  if (ok) carregarJanela();
  if (janela && !janela.isVisible()) janela.show(); // nunca deixa a janela escondida
});

app.on('window-all-closed', () => {
  app.isQuitando = true;
  if (servidor) servidor.kill();
  app.quit();
});

// garante que o servidor morre junto com o app (inclusive em fechar pelo X)
app.on('before-quit', () => {
  app.isQuitando = true;
  if (servidor) servidor.kill();
});
