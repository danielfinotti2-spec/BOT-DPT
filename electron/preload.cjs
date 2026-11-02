// Ponte mínima entre a tela e o app: só os comandos da janela (minimizar, maximizar, fechar).
// Este arquivo é CommonJS de propósito: o preload do Electron precisa ser CJS.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('janela', {
  acao: (nome) => ipcRenderer.invoke('janela:acao', nome),
  estado: () => ipcRenderer.invoke('janela:acao', 'estado'),
  aoMudar: (fn) => ipcRenderer.on('janela:estado', (_e, dados) => fn(dados)),
});
