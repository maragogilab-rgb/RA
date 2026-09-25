# ERP Empresa

Sistema de gestão empresarial (ERP) web, em português, para pequenas e médias empresas.
Roda com **um único comando**, sem dependências externas: apenas Node.js 22+ (usa o SQLite embutido no Node).

## Módulos

| Módulo | O que faz |
|---|---|
| **Painel** | Vendas do mês, saldo de caixa, contas a receber/pagar (com vencidos), valor em estoque, gráfico de vendas dos últimos 6 meses, próximos vencimentos e produtos com estoque baixo |
| **Vendas** | Orçamentos e vendas com vários itens, desconto, forma de pagamento e parcelamento (até 48x). Ao confirmar: baixa o estoque e gera as contas a receber. Cancelamento devolve o estoque. Impressão do pedido |
| **Compras** | Pedidos a fornecedores. Ao receber: dá entrada no estoque, atualiza o preço de custo e gera as contas a pagar |
| **Financeiro** | Contas a receber e a pagar, lançamentos manuais (aluguel, salários…), baixa, estorno, destaque de vencidos e **fluxo de caixa** mensal (realizado e previsto) |
| **Estoque** | Histórico de movimentações (entrada, saída, ajuste de inventário) com saldo e alerta de estoque mínimo |
| **Cadastros** | Clientes, fornecedores e produtos (SKU, custo, preço de venda, margem, estoque mínimo) |
| **Relatórios** | Vendas por produto (com margem), vendas por cliente (ticket médio) e receitas/despesas por categoria |
| **Configurações** | Dados da empresa (aparecem nas impressões), usuários com perfis *Administrador* e *Usuário*, troca de senha |

Todas as listagens têm busca, filtros e **exportação para CSV** (abre direto no Excel).
A interface funciona no computador e no celular, com tema claro e escuro automáticos.

## Como usar

```bash
# 1. (opcional) carregar dados de exemplo para conhecer o sistema
npm run demo

# 2. iniciar o servidor
npm start
```

Acesse **http://localhost:3000** e entre com:

- E-mail: `admin@empresa.com`
- Senha: `admin123`

> **Troque a senha no primeiro acesso** em *Configurações → Minha conta*.
> Para definir outro administrador inicial, use as variáveis `ERP_ADMIN_EMAIL` e `ERP_ADMIN_SENHA` antes do primeiro `npm start`.

## Configuração

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `0.0.0.0` | Interface de rede |
| `ERP_DB` | `data/erp.db` | Arquivo do banco de dados SQLite |
| `ERP_ADMIN_EMAIL` / `ERP_ADMIN_SENHA` | `admin@empresa.com` / `admin123` | Administrador criado quando o banco está vazio |
| `ERP_COOKIE_SEGURO` | — | Use `1` quando o sistema estiver atrás de HTTPS |
| `ERP_LOG` | — | Use `0` para desativar o log de requisições |

### Backup

Todos os dados ficam no arquivo `data/erp.db`. Para fazer backup, copie esse arquivo
(de preferência com o servidor parado) ou use `sqlite3 data/erp.db ".backup backup.db"`.

### Colocando em produção

- Rode atrás de um proxy com HTTPS (Nginx, Caddy) e defina `ERP_COOKIE_SEGURO=1`.
- Use um gerenciador de processos (systemd, pm2) para manter o servidor ativo.
- Agende backups diários do arquivo do banco.

## Regras de negócio

- Valores monetários são guardados em **centavos** (inteiros) para evitar erros de arredondamento.
- Vendas pagas em **dinheiro, PIX ou débito à vista** já entram como recebidas; demais formas geram parcelas mensais em aberto.
- Não é possível vender mais do que há em estoque; a operação inteira é desfeita se algum item faltar.
- Uma venda/compra com parcelas já pagas só pode ser cancelada após estornar os pagamentos.
- Clientes, fornecedores e produtos não são apagados, apenas **inativados**, preservando o histórico.

## Segurança

- Senhas com hash `scrypt` e sal aleatório; sessões em cookie `HttpOnly` + `SameSite=Strict`.
- Limite de tentativas de login por IP.
- Proteção CSRF (mutações exigem `Content-Type: application/json`) e cabeçalhos de segurança (CSP, `X-Frame-Options`).
- Todas as consultas SQL são parametrizadas; a interface nunca insere HTML vindo do usuário.

## Desenvolvimento

```bash
npm test   # testes automatizados da API (node:test)
```

Estrutura:

```
server.js              # ponto de entrada
src/
  app.js               # roteamento HTTP, autenticação e arquivos estáticos
  db.js                # esquema do banco e transações
  auth.js              # senhas e sessões
  validar.js           # validação de entrada e utilitários de data/parcelas
  modulos/             # cadastros, estoque, vendas, compras, financeiro, sistema
public/                # interface web (HTML/CSS/JS puro, sem build)
scripts/dados-demo.js  # gera dados de exemplo
test/                  # testes da API
```

A API REST fica em `/api/*` (JSON). Exemplos: `GET /api/produtos?busca=caneta`,
`POST /api/vendas`, `POST /api/vendas/:id/confirmar`, `GET /api/financeiro/fluxo?de=2026-01-01&ate=2026-12-31`.
