# Painel do bot (Atende)

Abra o painel em **http://localhost:3100** (ou dê duplo clique em `INICIAR-BOT.bat`).

## O que dá para fazer no painel

| Aba / botão | Serve para |
|---|---|
| **Configuração inicial** (4 passos) | Cole as chaves, ligue a Evolution, escaneie o QR e descreva seu negócio. Aparece só na primeira vez. |
| Chip do **WhatsApp** (topo) | Ver o QR Code de novo, conectar outro número ou desconectar. |
| **Conversas** | Cada cliente com a etapa (novo, interessado, quer fechar, precisa de você). Dá para assumir a conversa, responder pelo painel, marcar venda ou sem interesse. |
| **Visão do dia** | Quantos estão querendo fechar, interessados e esperando você + registro em tempo real das mensagens. |
| **Meu negócio** | O texto que a IA usa para responder: produtos, preços, pagamento, prazo. |
| **Chaves e conexões** | Trocar as chaves e testar tudo de uma vez. As chaves nunca aparecem na tela depois de salvas. |
| **Ligar / Desligar bot** (topo) | Liga e desliga o atendimento na hora, sem reiniciar nada. |

## Onde ficam as configurações

`data/config.json` — editável pelo painel. O `.env` antigo continua funcionando como reserva.

## Arquivos

- `servidor-painel.js` — servidor principal (API do painel + webhook do WhatsApp). É esse que o `INICIAR-BOT.bat` abre.
- `server.js` — versão antiga, só pelo WhatsApp. Ainda funciona se quiser usar sem painel.
- `public/` — a interface (HTML, CSS, JS), sem dependências externas.
- `src/config-painel.js`, `src/evolution.js`, `src/testes-reais.js` — configuração, conexão com a Evolution e testes reais das chaves.
