# Bot de WhatsApp com IA

## Requisitos
Node 20+, Evolution API (WhatsApp) rodando, chave de IA (xKiro ou outro provedor compatível com OpenAI) e, opcionalmente, chave Groq (áudio).

## Instalação
1. `npm install`
2. `cp .env.example .env` e preencha `AI_API_KEY`, `EVOLUTION_KEY`, `DONO_NUMERO` (o `.env` nunca vai pro Git)
3. Edite `cerebro.md` com seu negócio (preços, tom, FAQ, objeções)
4. Na Evolution API: crie a instância, leia o QR Code com o WhatsApp Business e configure o webhook:
   URL `http://IP-DO-BOT:3000/webhook`, evento `MESSAGES_UPSERT`
5. `npm start` (em servidor: `npm i -g pm2 && pm2 start "npm start" --name bot`)

## Como funciona
- **Atendimento**: responde quem chama, entende áudio, passa preço, trata objeção.
- **Chama você**: quando o cliente quer fechar/pede humano, manda resumo no seu WhatsApp e pausa o bot naquele contato. Reative com `/retomar NUMERO` (mandado do seu número pessoal pro bot).
- **Você assume manualmente**: se responder pelo celular, o bot pausa sozinho.
- **Prospecção** (`PROSPECCAO=1`): lê `lista.csv` (numero;nome;empresa, com DDI, ex 5521...), manda 1ª mensagem no estilo escolhido, só seg-sex no horário definido, com limite por dia e intervalo aleatório.
- **Retomada**: quem respondeu e sumiu recebe 1 lembrete após 24h.

## Cuidado
Prospecção em massa pode banir o número. Comece com limite baixo (10-20/dia), use número aquecido e só liste quem faz sentido contatar.

## Provedores de IA
- **xKiro** (padrão): crie a chave em xkiro.com (modelos `:free` funcionam sem cartão). Base `https://api.xkiro.com/v1`, formato OpenAI Chat Completions, `Authorization: Bearer`. Modelo padrão `mistralai/mistral-large-2512`.
- **APInex** (alternativo, já configurado): base confirmada `https://apinex.bond/v1` (formato OpenAI). Atenção: conta sem saldo só usa modelos `free/*` (ex.: `free/gemini-3.8-flash`); modelos pagos devolvem 402. Se o principal falhar, o bot usa o alternativo automaticamente.
- Outro provedor OpenAI-compatível: `AI_PROVIDER=openai-compatible` + `AI_BASE_URL`.
- Nem todo modelo se comporta igual: teste o tom no `/testar` e em conversas reais antes de colocar em produção.

## Trocar modelo sem reiniciar (pelo seu WhatsApp)
Mande do número do `DONO_NUMERO` para o bot: `/ia` (status), `/modelos`, `/modelo 4` ou `/modelo nome`, `/testar` (checa conexão). A lista vem de `AI_MODELS` no `.env`; a escolha fica salva em `data/runtime.json`.

## Áudio (opcional)
`AUDIO_PROVIDER=groq` + `GROQ_KEY`. Sem isso o bot funciona só com texto e responde educadamente que não consegue ouvir o áudio. Novo provedor: crie `src/providers/audio/<nome>.js` com `transcrever(buffer)` e registre em `audio/index.js`.

## Testes
`npm test` (usa servidor falso, sem gastar créditos).
