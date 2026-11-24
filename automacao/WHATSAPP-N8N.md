# WhatsApp da agência ligado ao ERP (n8n + Evolution API)

Quando alguém chama a Maragogi Lab no WhatsApp **pela primeira vez**:

1. O contato vira **lead no ERP** (Clientes → relação "lead", estágio "Novo lead", origem "WhatsApp"), com a primeira mensagem nas observações.
2. Uma **tarefa de prioridade alta** "Responder novo lead" aparece para hoje no painel.
3. O cliente recebe na hora uma **mensagem de boas-vindas** automática.

Quem já está cadastrado (mesmo com o número escrito de outro jeito) **não é duplicado** e **não recebe a mensagem automática de novo**.
Mensagens de grupos, de status e as enviadas pela própria agência são ignoradas.

```
WhatsApp → Evolution API → n8n → ERP (lead + tarefa)
                              └→ Evolution API → resposta automática (só no 1º contato)
```

## Jeito mais fácil: no Mac, com um comando

Cole no Terminal (atualiza o ERP, liga a integração, sobe tudo e abre o QR Code):

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

## Mudar a mensagem automática

No `.env`, preencha `MENSAGEM_BOAS_VINDAS` (`{nome}` vira o primeiro nome do contato) e rode `docker compose up -d` de novo. Exemplo:

```
MENSAGEM_BOAS_VINDAS=Oi, {nome}! Aqui é o Rafael, da Maragogi Lab. Já vi sua mensagem e te respondo em instantes.
```

## Cuidados

- O Evolution API usa o **WhatsApp Web** (não é a API oficial da Meta). Funciona bem para atendimento, mas
  **não use para disparos em massa**: o WhatsApp pode bloquear o número. O fluxo só responde quem chamou primeiro.
- Prefira usar o **WhatsApp Business** num número da agência.
- O `.env` tem as senhas: **nunca** envie para o GitHub (ele já está no `.gitignore`).

## Segurança

- O Evolution manda um cabeçalho secreto (`WEBHOOK_TOKEN`) em cada aviso. O fluxo descarta o que chegar sem ele, então ninguém de fora consegue criar leads falsos nem mandar mensagens pelo seu número.
- O ERP só aceita leads com o `ERP_INTEGRACAO_TOKEN` no cabeçalho `x-erp-token`.

## Detalhes técnicos

Rota do ERP: `POST /api/integracoes/lead`, cabeçalho `x-erp-token`, corpo JSON
`{ "telefone": "5582999991234", "nome": "Ana", "mensagem": "...", "origem": "WhatsApp" }`.
Responde `201 { novo: true, cliente, tarefa_id }` no primeiro contato e `200 { novo: false, cliente }` quando o número já existe.
O número é comparado por DDD + 8 últimos dígitos, então `+55 (82) 9 9999-1234`, `82999991234` e `558299991234` são o mesmo contato.
Serve para qualquer outra origem também (formulário do site, Instagram via n8n etc.): basta mudar `origem`.
