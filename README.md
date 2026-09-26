# ERP Maragogi Lab

Sistema de gestão para a **Maragogi Lab — agência de marketing e produção audiovisual**.
Feito para quem vende **serviços**: propostas, jobs, contratos de fee mensal, notas fiscais de serviço (NFS-e) e financeiro.

Roda com **um único comando**, sem dependências externas: apenas Node.js 22+ (usa o SQLite embutido no Node).

## Módulos

| Módulo | O que faz |
|---|---|
| **Painel** | Recebido no mês, receita recorrente (fee), contas a receber/pagar com vencidos, propostas em aberto, gráfico de recebimentos, jobs em andamento com prazos e próximos vencimentos |
| **Projetos e propostas** | Monte a proposta com os serviços do catálogo (ou itens avulsos), desconto, parcelas e condições, e **imprima para enviar ao cliente**. Quando aprovada, vira job e gera as parcelas a receber. Acompanhe as etapas (Aprovado → Em produção → Em revisão → Entregue), lance **custos do job** (freelancers, locação de equipamento, deslocamento) e veja o **lucro e a margem de cada projeto** |
| **Contratos (fee)** | Clientes com mensalidade (gestão de redes sociais, tráfego pago…). Um clique gera as cobranças do mês de todos os contratos, sem duplicar |
| **Notas fiscais** | NFS-e a partir de um projeto, de uma parcela ou de uma mensalidade. O sistema confere os dados e mostra **o que falta para emitir**. Emissão **manual** (portal da prefeitura) ou **automática** (Focus NFe) |
| **Financeiro** | Contas a receber e a pagar, baixa, estorno, vencidos e **fluxo de caixa** mensal |
| **Clientes** | Todos os dados exigidos na NF: CNPJ/CPF (validado), razão social, inscrição municipal, endereço completo com **preenchimento automático pelo CEP** (inclui o código IBGE do município) e o tipo de serviço contratado |
| **Serviços** | Catálogo com preço de referência e dados fiscais: item da LC 116, alíquota do ISS, CNAE, código municipal e NBS |
| **Fornecedores** | Freelancers e locadoras, com chave PIX |
| **Relatórios** | Lucro por projeto, faturamento por cliente (projetos + fee), serviços mais vendidos e despesas por categoria |

Todas as listagens têm busca, filtros e **exportação para CSV** (abre no Excel).
Funciona no computador e no celular, com tema claro e escuro.

## Como usar

**Na internet (recomendado, para você e seu sócio):** siga o passo a passo em [COLOCAR-NO-AR.md](COLOCAR-NO-AR.md).

**No próprio computador:**

```bash
npm run demo   # opcional: carrega dados de exemplo da agência
npm start      # inicia o sistema
```

Acesse **http://localhost:3000** com `admin@empresa.com` / `admin123`.
**Troque a senha no primeiro acesso** em *Configurações → Minha conta*.

## Orçamento em PDF

Em um orçamento, clique em **Gerar orçamento (PDF)**. Abre o documento em A4 no estilo da Maragogi Lab:
logo, "Preparado para" com o contato do cliente, tabela com serviço, detalhe, quantidade e medida, caixa de total,
pagamento, prazo, bloco de condições (ex.: *Retirada / devolução*), termos e dados do PIX no rodapé.
Na janela de impressão, escolha **Salvar como PDF**.

- Logo, termos padrão, PIX e dados bancários ficam em **Configurações → Orçamento (PDF)**.
- Cada orçamento pode ter categoria, texto de pagamento e prazo, título do bloco de condições e termos próprios
  (os termos padrão vêm preenchidos).

## Importar do painel antigo

Em **Configurações → Importar dados do painel antigo**, selecione o backup `.json`. Também dá para usar o terminal:
`npm run importar -- backup-maragogi-lab.json`. São importados:

- configurações da empresa (CNPJ, endereço, PIX, banco e termos);
- clientes, leads e parceiros (com segmento e estágio);
- orçamentos, incluindo itens, medidas e condições;
- lançamentos financeiros e as notas já emitidas.

Pode importar de novo sem medo: o que já foi importado é ignorado. Agenda e tarefas não são importadas.

## MEI

Com o regime **MEI** em Configurações, o painel mostra o faturamento do ano em relação ao teto do MEI. As notas
seguem as regras do MEI: a emissão é feita no **Emissor Nacional** ([nfse.gov.br](https://www.nfse.gov.br/EmissorNacional)),
sem inscrição municipal nem alíquota de ISS, que já é paga no DAS. Use **Copiar dados** e depois **Registrar nota emitida**.

## Nota fiscal de serviço (NFS-e)

1. **Configurações → Dados da empresa e nota fiscal**: preencha razão social, CNPJ, inscrição municipal,
   regime tributário, endereço (o CEP preenche o código IBGE) e os padrões da nota (item LC 116 e alíquota do ISS).
2. **Serviços**: informe o item da LC 116 e a alíquota de cada serviço. Os itens mais comuns para agências já vêm na lista:
   `17.06` (propaganda e publicidade), `13.03` (fotografia e cinematografia), `13.02` (gravação de som),
   `23.01` (comunicação visual/design), `17.01` (consultoria), `1.08` (sites) e outros.
   **Confirme os códigos e a alíquota com seu contador**, porque eles dependem da prefeitura e do enquadramento da empresa.
3. **Clientes**: complete CNPJ/CPF e endereço. A lista mostra quais clientes estão com os dados para NF completos.
4. Em um projeto (**Emitir NF**) ou em uma parcela a receber (**NF**), o sistema monta a nota com o texto dos serviços.

Formas de emissão:

- **Manual (padrão)**: use **Copiar dados** e cole no portal NFS-e da prefeitura. Depois, clique em **Registrar nota emitida**
  e informe o número. Funciona em qualquer município, sem custo extra.
- **Automática (Focus NFe)**: crie uma conta em [focusnfe.com.br](https://focusnfe.com.br), cadastre a empresa e envie
  o certificado digital A1 no painel da Focus. Depois, em Configurações, escolha *Automática — Focus NFe*, cole o token e
  teste primeiro em **Homologação**. Só então mude para **Produção**. O sistema envia a nota, consulta a situação
  (**Atualizar situação**), mostra o motivo de uma recusa da prefeitura, abre o PDF e cancela notas.

## Configuração

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `ERP_DB` | `data/erp.db` | Arquivo do banco de dados |
| `ERP_ADMIN_EMAIL` / `ERP_ADMIN_SENHA` | `admin@empresa.com` / `admin123` | Administrador criado quando o banco está vazio |
| `ERP_COOKIE_SEGURO` | — | Use `1` quando estiver atrás de HTTPS |
| `ERP_LOG` | — | Use `0` para desativar o log de requisições |

**Backup:** todos os dados ficam em `data/erp.db`. Copie esse arquivo regularmente.

**Em produção:** rode atrás de HTTPS (Nginx/Caddy) com `ERP_COOKIE_SEGURO=1`, use um gerenciador de processos
(systemd/pm2) e agende backups diários.

## Regras de negócio

- Valores monetários são guardados em centavos para evitar erros de arredondamento.
- Uma proposta só pode ser editada antes de aprovada. Na aprovação são geradas as parcelas mensais a partir do 1º vencimento.
- Um projeto com parcela já recebida só pode ser cancelado depois de estornar o recebimento.
- A cobrança de fee mensal é gerada uma única vez por contrato e mês.
- Clientes, fornecedores e serviços não são apagados, apenas inativados.

## Segurança

- Senhas com hash `scrypt` e sessões em cookie `HttpOnly` + `SameSite=Strict`, com limite de tentativas de login.
- O token da Focus NFe fica apenas no servidor e nunca é enviado ao navegador.
- Proteção CSRF, cabeçalhos de segurança (CSP) e consultas SQL parametrizadas.

## Desenvolvimento

```bash
npm test   # testes automatizados da API (inclui a emissão de NFS-e com a Focus NFe simulada)
```

```
server.js              # ponto de entrada
src/app.js             # roteamento HTTP, autenticação e arquivos estáticos
src/db.js              # esquema do banco e migrações automáticas
src/modulos/           # cadastros, projetos, contratos, financeiro, notas, sistema
src/nfse/focusnfe.js   # integração com a API de NFS-e da Focus NFe
public/                # interface web (HTML/CSS/JS puro, sem build)
scripts/dados-demo.js  # dados de exemplo
test/                  # testes da API
```
