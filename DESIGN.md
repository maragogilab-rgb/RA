# DESIGN.md · ERP Maragogi Lab

Linguagem visual do ERP, no formato DESIGN.md (token, regra e motivo no mesmo arquivo). Fonte da verdade: `public/style.css` (sistema) e `public/orcamento.css` (documento A4). Se este arquivo e o CSS divergirem, vale o CSS: atualize este arquivo.

## Personalidade

Ferramenta de trabalho diário para dois sócios de uma agência. **Calma, densa e legível**: muita informação por tela, pouco enfeite. A cor serve para chamar atenção para o que exige ação (vencido, pendente, erro), não para decorar.

## Cores

Use sempre as variáveis CSS, nunca hexadecimal solto. Cada token tem versão clara e escura (`prefers-color-scheme`).

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--fundo` | `#f4f4f2` | `#121211` | Fundo da página, um cinza quente e neutro |
| `--superficie` | `#fcfcfb` | `#1a1a19` | Cartões, tabelas, modais |
| `--superficie-2` | `#f0efec` | `#232322` | Áreas internas, observações, trilhos de barra |
| `--borda` | `#e2e1dc` | `#383835` | Divisórias e contornos (1px) |
| `--texto` | `#0b0b0b` | `#ffffff` | Texto principal |
| `--texto-2` | `#52514e` | `#c3c2b7` | Rótulos, texto secundário |
| `--texto-3` | `#74736e` | `#9a998f` | Dicas, vazio, metadados (`.mudo`) |
| `--acento` | `#2a78d6` | `#3987e5` | **Única cor de marca na interface**: botão primário, links, foco, série 1 dos gráficos |
| `--acento-forte` | `#1c5cab` | `#6da7ec` | Hover do primário, texto sobre `--acento-suave` |
| `--acento-suave` | `#e6f0fc` | `#16273d` | Fundo de item ativo e destaques leves |

**Estados** (sempre o par cor + fundo, por exemplo `--bom` com `--bom-fundo`):

| Estado | Cor clara | Significado |
|---|---|---|
| `--bom` | `#0a7d0a` | Pago, recebido, autorizado, publicado |
| `--aviso` | `#8a5a00` | Vence em breve, aguardando, rascunho com pendências |
| `--critico` | `#c0302f` | Vencido, erro, cancelado, ação destrutiva |
| `--info` | `#1c5cab` | Informativo, em andamento |

**Por quê:** um só acento azul deixa claro onde clicar; verde, âmbar e vermelho ficam livres para o significado financeiro. Não crie cores novas para "dar vida": use um selo de estado.

## Tipografia

- Fonte do sistema (`system-ui, -apple-system, "Segoe UI", Roboto…`), sem fontes externas: a CSP só permite `'self'` e o app precisa abrir rápido no Mac e no celular.
- Base: **14px / 1.5**. `h1` 22px com `letter-spacing: -.01em`; `h2` 16px; título de seção (`.secao`) 15px.
- Números (valores, KPIs, totais): `font-variant-numeric: tabular-nums`, para colunas alinharem.
- KPI: 22px. Total de proposta: 18px negrito.
- Peso: 400 no corpo, 500 em botões, 600 em selos, 700 em totais e na marca.

## Forma e espaço

- Raio: `--raio` (10px) em cartões, tabelas e KPIs; 8px em botões, campos e faixas; 12px em modais; 14px na caixa de login; 999px em selos e barras de progresso.
- Sombra: `--sombra` (muito leve) só em cartões e KPIs; modal usa `0 20px 60px rgb(0 0 0 / .3)`. Nada de sombras fortes no resto.
- Espaçamento em múltiplos de 2 e 4: 8 entre itens pequenos, 12 a 16 dentro de cartões, 16 a 24 entre blocos.
- Menu lateral fixo de 232px (`--lateral`); vira menu recolhível abaixo de 900px. Abaixo de 640px, uma coluna.

## Componentes (de `public/js/nucleo.js`)

Use os componentes que já existem antes de criar outros:

| Componente | Função | Regra |
|---|---|---|
| `cabecalho(titulo, ...acoes)` | Topo da página | No máximo um botão primário por página |
| `btn(texto, fn, classe)` | Botões | `btn-primario` para a ação principal, `btn-perigo` para excluir; o resto sem classe |
| `selo(status)` | Pílula de estado | Rótulo vem de `ROTULOS`, cor de `TOM` |
| `tabela(colunas, linhas)` | Listagens | Já traz busca, mensagem de vazio e exportação CSV |
| `formulario(campos)` | Formulários | Rótulo acima do campo, largura total |
| `modal(titulo, conteudo)` | Edição e detalhes | Largura até 560px (`largo` para mais) |
| `confirmar(msg)` | Antes de excluir ou estornar | Sempre que a ação for difícil de desfazer |
| `aviso(msg, tipo)` | Confirmação rápida | Faixa com borda esquerda de 4px na cor do estado |
| `.kpi` | Números do painel | Rótulo pequeno em `--texto-2`, valor grande, variação colorida pelo estado |

## Texto na interface

- Português do Brasil, frases curtas, sem jargão técnico ("Cliente: CEP" em vez de "campo cep inválido").
- Botões com verbo: "Gerar cobranças do mês", "Emitir nota".
- Dinheiro como `R$ 1.234,56` (`R$()`), data como `dd/mm/aaaa` (`dataBR()`).
- Vazio explica o próximo passo: "Nenhum projeto ainda. Crie o primeiro em + Nova proposta."

## Acessibilidade

- Foco visível sempre: `outline: 2px solid var(--acento)`.
- Estado nunca só pela cor: o selo sempre tem texto.
- Contraste mínimo AA nos dois temas. Ao criar um par cor/fundo, confira o contraste.
- Link "pular para o conteúdo" (`.pular`) mantido.

## Documento de orçamento (A4)

O PDF de orçamento (`public/orcamento.css`) tem identidade própria, de proposta comercial impressa, separada do sistema:

| Token | Valor | Uso |
|---|---|---|
| `--verde` | `#0b4a52` | Barra superior, caixa de total, títulos |
| `--verde-claro` | `#bfe0da` | Destaques e faixas |
| `--cinza-fundo` | `#eef2f2` | Blocos de condições |
| `--texto` | `#171b26` | Texto |
| `--mudo` | `#6b7280` | Rótulos e rodapé |
| `--linha` | `#e5e9ea` | Linhas da tabela |

Fonte Helvetica/Arial a 10pt/1.4, com `print-color-adjust: exact` para as cores saírem na impressão. Não misture os tokens do sistema com os do documento.

## Não fazer

- Gradientes, ícones coloridos, emojis na interface ou animações além de transições curtas (≤ 150ms). Ícones do menu são caracteres monocromáticos (ex.: `◷`) que herdam a cor do texto.
- Bibliotecas de UI, fontes ou ícones de CDN.
- Cores fora dos tokens, ou um segundo acento.
- Tabelas sem a versão em cartão no celular quando houver muitas colunas.
