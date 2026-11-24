---
name: ilustracao-svg
description: Desenha ilustrações, ícones, grafismos, padrões e arte generativa em SVG limpo e editável. Usar para ícones, ilustrações de post, elementos de marca, padrões/texturas, infográficos e arte vetorial.
---

# Ilustração em SVG

## Estilo antes de desenhar
Defina e mantenha em toda a série: traço (espessura fixa, ex. 4 px a 512 viewBox; pontas `round` ou `square`), preenchimento (chapado, com 1 sombra, ou só contorno), paleta limitada (3–5 cores), cantos (raio fixo).

## Construção
- `viewBox` em números redondos (`0 0 512 512` ícone, `0 0 1080 1350` arte). Sem `width/height` fixos no arquivo de fonte.
- Formas básicas (`rect`, `circle`, `path`) agrupadas em `<g id="...">` com nomes legíveis.
- Coordenadas arredondadas (no máximo 1 casa decimal). Sem transformações aninhadas desnecessárias.
- Cores em variáveis via `currentColor` ou `<style>` com classes, para recolorir fácil.
- Ícones: grade de 24 px com 2 px de margem; peso óptico igual entre ícones (círculo um pouco maior que quadrado).
- Personagens/objetos: construa por formas geométricas simples sobrepostas; luz de uma direção só, sombra = mesma cor, mais escura e menos saturada.

## Padrões e arte generativa
- Padrão: `<pattern>` com célula pequena, ou gere em JS (seed fixa para reprodutibilidade) e salve o SVG resultante.
- Arte generativa: flow fields, grades com ruído, círculos empacotados — gere com um script Node simples escrevendo o SVG, use paleta da marca e seed documentada.

## Verificação
1. Renderize: `node .claude/skills/artes-redes-sociais/scripts/render.js figura.svg saida/`
2. Abra o PNG e confira: proporções, alinhamento, peso visual, nada cortado pelo viewBox.
3. Teste em 32 px (ícone) e em negativo.
4. Corrija e repita. Entregue `.svg` + `.png`.

## Infográfico
Um dado por bloco, números grandes, ícone de apoio, fonte de dados no rodapé. Gráficos simples (barra, rosca) desenhados em SVG com valores reais — nunca invente números.
