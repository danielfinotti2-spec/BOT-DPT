# Relatório de alterações

**Novos:** `src/config.js` (leitura/validação do .env), `src/providers/ai/{index,openai-compatible,xkiro,apinex}.js`, `src/providers/audio/{index,groq}.js`, `test/providers.test.js`, `.gitignore`.
**Alterados:** `server.js` (usa `IA.conversar` e `audio`; DeepSeek/Groq saíram do código), `.env.example`, `package.json`, `LEIAME.md`.
**Preservado:** Evolution API, webhook, histórico, pausa/atendimento humano, aviso ao dono, cerebro.md, horário, prospecção/CSV, retomada.
**Novo comportamento:** timeout, retry em 429, erro de saldo/auth/modelo identificados, fallback automático p/ provedor alternativo, aviso ao dono se a IA cair (máx. 1 a cada 10 min), logs sem chaves, comandos /ia /modelos /modelo /testar, áudio opcional.
**Bug corrigido:** a resposta vazia da IA antes ia ser tratada como sucesso; agora o bot não envia nada e avisa o dono.

## Testado de verdade (npm test, servidor falso): 13/13 passaram
Bearer/endpoint/modelo, troca Mistral→Qwen + persistência, 429 (retry e esgotado), 402/saldo, 401, 404, 500, resposta vazia, timeout, chave fora dos logs, fallback, APInex sem URL, validação do .env, áudio desligado.

## NÃO testado (sem rede/dependências neste ambiente)
Chamada real à xKiro (Mistral Large e Qwen), `npm install`/`npm start` (express não instalou), Evolution API real, Groq real, e a transcrição de áudio ponta a ponta. `server.js` só passou na checagem de sintaxe.
