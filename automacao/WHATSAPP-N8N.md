# WhatsApp da agência ligado ao ERP (n8n + Evolution API)

Quando alguém chama a Maragogi Lab no WhatsApp **pela primeira vez**:

1. O contato vira **lead no ERP** (Clientes → relação "lead", estágio "Novo lead", origem "WhatsApp"), com a primeira mensagem nas observações.
2. Uma **tarefa de prioridade alta** "Responder novo lead" aparece para hoje no painel.
3. O **robô de atendimento** responde na hora com as boas-vindas e um menu:

```
Oi, Ana! 👋 Aqui é da Maragogi Lab. Que bom ter você por aqui!

Como posso te ajudar? Responda com o número:

*1* - Pedir um orçamento
*2* - Ver nossos trabalhos
*3* - Já sou cliente
*4* - Falar com a equipe
```

- **1 - Orçamento:** pergunta o serviço e depois as perguntas que você definir (data, local, o que a pessoa imagina…).
  As respostas ficam anotadas no cliente e a tarefa vira "Enviar orçamento (WhatsApp): Ana — Fotografia".
- **2 - Trabalhos:** manda o link do portfólio. Só aparece se você preencher a mensagem do portfólio.
- **3 - Já sou cliente:** pede que a pessoa conte o que precisa e passa para a equipe.
- **4 - Falar com a equipe:** avisa a equipe com uma tarefa e o robô fica quieto.

O robô **sai da conversa** quando alguém da agência responde pelo celular, quando passa para a equipe ou depois de
3 respostas que ele não entende. O contato volta ao menu mandando **menu** (ou sozinho, se a conversa ficar parada mais de 30 dias).

Quem já estava cadastrado no ERP (mesmo com o número escrito de outro jeito) **não é duplicado** e **não recebe o robô**.
Mensagens de grupos e de status são ignoradas. Não tem custo: o robô não usa IA, segue o menu.

**Textos, serviços e perguntas** ficam em **Configurações → WhatsApp: atendimento automático**. Lá também dá para deixar
só a mensagem de boas-vindas ou desligar as respostas automáticas.

```
WhatsApp → Evolution API → n8n → ERP (lead, tarefa e próxima resposta do robô)
                              └→ Evolution API → resposta no WhatsApp
```

## Jeito mais fácil: no Mac, com um comando

Cole no Terminal (atualiza o ERP, liga a integração, sobe tudo e abre o QR Code). Para **atualizar** uma instalação
antiga, rode o mesmo comando: ele troca o fluxo do n8n pelo novo sem mexer no WhatsApp conectado.

```bash
curl -fsSL https://raw.githubusercontent.com/maragogilab-rgb/RA/HEAD/mac/instalar-whatsapp.sh | bash
```

Os passos abaixo são para instalar à mão ou num servidor.

## O que tem nesta pasta

| Arquivo | Para quê |
|---|---|
| `docker-compose.yml` | Sobe n8n, Evolution API, Postgres e Redis com um comando |
| `.env.example` | Modelo das senhas e endereços (copie para `.env`) |
| `configurar-whatsapp.sh` | Cria a instância do WhatsApp e liga o webhook para o n8n |
| `fluxo-whatsapp-lead.json` | Fluxo pronto para importar no n8n |

## Passo 1: ligar a integração no ERP

No Railway, no serviço do ERP → **Variables** → **New Variable**:

| Nome | Valor |
|---|---|
| `ERP_INTEGRACAO_TOKEN` | um token aleatório e longo (gere com `openssl rand -hex 24`) |

Sem essa variável, a integração fica desligada.

## Passo 2: subir o n8n e o Evolution API

Precisa de um lugar com Docker que fique ligado 24h, porque o WhatsApp precisa ficar conectado.
Um servidor VPS simples (Hostinger, Contabo, DigitalOcean, a partir de ~R$ 30/mês, 2 GB de RAM) resolve.
Para testar antes, dá para rodar no Mac com o [Docker Desktop](https://www.docker.com/products/docker-desktop/).

Na pasta `automacao`:

```bash
cp .env.example .env
```

Abra o `.env` e preencha. Use o **mesmo** `ERP_INTEGRACAO_TOKEN` do passo 1 e invente senhas aleatórias para o resto.
Depois:

```bash
docker compose up -d
```

- n8n: http://localhost:5678 (no primeiro acesso ele pede para criar seu usuário)
- Evolution API: http://localhost:8080/manager (entre com a `EVOLUTION_APIKEY`)

> Num servidor, troque `localhost` pelo endereço do servidor e coloque HTTPS na frente
> (o painel da maioria das VPS ou o Caddy/Nginx Proxy Manager fazem isso). Ajuste `N8N_URL`,
> `N8N_HOST`, `EVOLUTION_URL_PUBLICA` e `N8N_SECURE_COOKIE=true` no `.env`.

## Passo 3: importar o fluxo no n8n

1. No n8n: **Create workflow** → menu **⋯** → **Import from File** → escolha `fluxo-whatsapp-lead.json`.
2. Clique em **Publish** (ou no botão de ativar) no canto superior direito.

O fluxo lê as senhas do `.env`, então não precisa configurar nada dentro dele.

## Passo 4: conectar o WhatsApp

```bash
./configurar-whatsapp.sh
```

Depois abra http://localhost:8080/manager, clique na instância **maragogi** e leia o QR Code com o
WhatsApp da agência (**WhatsApp → Aparelhos conectados → Conectar um aparelho**).

Pronto: mande um "oi" de outro número e confira o lead e a tarefa no ERP.

## Mudar as mensagens do robô

No ERP: **Configurações → WhatsApp: atendimento automático**. Não precisa mexer no n8n nem reiniciar nada.
(A variável `MENSAGEM_BOAS_VINDAS` do `.env` não é mais usada.)

## Cuidados

- O Evolution API usa o **WhatsApp Web** (não é a API oficial da Meta). Funciona bem para atendimento, mas
  **não use para disparos em massa**: o WhatsApp pode bloquear o número. O fluxo só responde quem chamou primeiro.
- Prefira usar o **WhatsApp Business** num número da agência.
- O `.env` tem as senhas: **nunca** envie para o GitHub (ele já está no `.gitignore`).

## Segurança

- O Evolution manda um cabeçalho secreto (`WEBHOOK_TOKEN`) em cada aviso. O fluxo descarta o que chegar sem ele, então ninguém de fora consegue criar leads falsos nem mandar mensagens pelo seu número.
- O ERP só aceita leads com o `ERP_INTEGRACAO_TOKEN` no cabeçalho `x-erp-token`.

## Detalhes técnicos

Rota do robô: `POST /api/integracoes/whatsapp`, cabeçalho `x-erp-token`, corpo JSON
`{ "telefone": "558299991234", "nome": "Ana", "mensagem": "oi", "de_mim": false }`. Responde `{ resposta, novo, cliente_id }`:
`resposta` é o texto a enviar ou `null` para não responder. Com `de_mim: true` (mensagem enviada pelo WhatsApp da agência)
o robô sai da conversa, a não ser que seja o próprio texto que ele acabou de mandar. As conversas ficam na tabela `whatsapp_conversas`.

Rota só de cadastro: `POST /api/integracoes/lead`, cabeçalho `x-erp-token`, corpo JSON
`{ "telefone": "5582999991234", "nome": "Ana", "mensagem": "...", "origem": "WhatsApp" }`.
Responde `201 { novo: true, cliente, tarefa_id }` no primeiro contato e `200 { novo: false, cliente }` quando o número já existe.
O número é comparado por DDD + 8 últimos dígitos, então `+55 (82) 9 9999-1234`, `82999991234` e `558299991234` são o mesmo contato.
Serve para qualquer outra origem também (formulário do site, Instagram via n8n etc.): basta mudar `origem`.
