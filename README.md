# BOT DPT

Bot de atendimento no WhatsApp com IA, com painel próprio e busca de clientes no Google Maps.

Windows x64 · Electron + Node · Licença MIT

---

## ⚠️ Aviso — leia antes de usar

**Este software é fornecido "COMO ESTÁ", sem garantia de qualquer tipo**, expressa ou implícita, incluindo garantias de comercialização, adequação a um fim específico e não violação.

**Quem usar é o único e exclusivo responsável por tudo o que fizer com ele.** O autor não se responsabiliza por nada:

- **Bloqueio ou banimento** do número de WhatsApp, da conta, da máquina ou do IP;
- **Custo** de APIs, créditos, assinaturas, faturamento do Google Cloud ou de qualquer provedor de IA;
- **Conteúdo** que a IA escrever ou enviar, incluindo informação errada, ofensiva ou fora do que você configurou;
- **Mensagens não solicitadas**, spam, importunação ou descumprimento de lei (**LGPD**, **CDC**, **Marco Civil da Internet**, legislação de telecomunicações, regras de proteção de dados);
- **Violação dos termos de uso** do WhatsApp/Meta, do Google, da Evolution API, do provedor de IA ou de qualquer serviço usado junto;
- **Prejuízo financeiro**, perda de clientes, perda de dados, lucros cessantes ou dano de qualquer natureza.

Enviar mensagem em massa para números que não pediram o contato costuma dar **bloqueio do número** — no WhatsApp e, dependendo do conteúdo, em outras frentes. A aba **Clientes** só busca dados do Google Maps quando **você** manda, e só envia **depois** do seu clique em Enviar, com a mensagem aberta para revisão. **Mesmo assim, a decisão é sua e a responsabilidade também.**

O uso é de sua conta e risco. Se não concorda com isso, **não use o programa**.

---

## O que ele faz

- **Atende no WhatsApp** com IA: responde dúvidas, informa preço e prazo, conduz a conversa até o fechamento.
- **Sabe quando te chamar**: quando o cliente quer fechar, pechincha demais ou pede algo fora do que está cadastrado, a IA avisa no seu WhatsApp e escreve um resumo da conversa.
- **Painel de verdade, com tema claro e escuro**: conversas, etapa de cada cliente, resumo e histórico balão por balão.
- **Clientes do Google Maps** (opcional): busca empresas por tipo e cidade e traz nome, endereço, nota e telefone. Nada é enviado sem a sua confirmação, uma por uma.
- **Você assume quando quiser**: um clique pausa a IA naquela conversa.
- **Instalador pronto**: não precisa instalar Node, npm nem nada. O app carrega o próprio runtime.

## Instalação

1. Baixe o `BOT-DPT-Instalador-1.0.0.exe` na aba **Releases** (ou compile o seu, abaixo).
2. O Windows vai avisar que o programa não é assinado — **Mais informações → Executar assim mesmo**.
3. Abra o **BOT DPT** e siga a configuração em 4 passos. Na primeira vez, um tutorial guiado explica cada campo.

O que você precisa ter em mãos:

| Item | Para quê |
|---|---|
| Chave de um provedor de IA (xKiro, APInex, OpenAI ou compatível) | escrever as respostas |
| Evolution API rodando (Docker) | a ponte com o WhatsApp |
| Celular com WhatsApp | ler o QR Code uma vez |
| Chave da Places API (New) do Google — **opcional** | só para a aba Clientes |

Dados, chaves e conversas ficam em `%APPDATA%\BOT DPT\dados`, fora da pasta de instalação — atualizar o app não apaga nada.

## Compilando a partir do código

```bash
npm install
npm start          # abre em modo desenvolvimento
npm test           # testes dos provedores
npm run dist       # gera o instalador em dist/
```

O ícone é gerado a partir de `build/icone.svg` com `npm run icone`.

## Estrutura

```
electron/           janela do app (sem a moldura do Windows, barra própria)
public/             interface: HTML, CSS e JS puro
servidor-painel.js  servidor local (Express) que liga tudo
src/                configuração, Evolution API, Google Maps, provedores de IA
recursos/node/      Node embutido no instalador
```

## Aviso sobre segredos

O repositório **não inclui** `.env`, `data/` nem chaves de API. Se for clonar, crie o seu `.env` a partir de `.env.example` e preencha as suas chaves. **Nunca commite chaves.**

## Licença

MIT — veja [LICENSE](LICENSE). Use, modifique, venda, redistribua. Só mantenha o aviso de copyright.

De novo, porque importa: **o uso é por sua conta e risco, e a responsabilidade é toda de quem usa.**
