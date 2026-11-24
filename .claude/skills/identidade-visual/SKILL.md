---
name: identidade-visual
description: Cria logo e identidade visual como um sistema (símbolo, logotipo, cores, tipografia, aplicações) e entrega um mini manual de marca. Usar para marca nova, rebranding ou quando o cliente não tem guia.
---

# Identidade visual

## Processo
1. **Essência**: 3 adjetivos da marca + 1 que ela **não** é. Concorrentes: o que todos fazem (para fugir).
2. **Território visual**: escolha um eixo — geométrico × orgânico, sério × lúdico, clássico × contemporâneo.
3. **Exploração**: 6 rascunhos rápidos em SVG (monograma, símbolo abstrato, símbolo figurativo, wordmark, emblema, combinação). Apresente os 3 melhores lado a lado.
4. **Refino** do escolhido: ajuste óptico (letras redondas passam levemente da linha de base, espaçamento ótico, não matemático), peso de traço consistente.
5. **Sistema**: cores, tipografia, grafismos de apoio, padrão/textura.

## Regras do logo
- Funciona **em 1 cor**, em negativo, e a 16 px (favicon). Teste os três.
- Sem degradê obrigatório, sem detalhes finos que somem ao reduzir.
- Construído em SVG com `viewBox` limpo, formas unidas, sem texto vivo (converta para path ou use fonte livre e documente).
- Área de proteção = altura de um elemento do logo (ex.: altura do "x").
- Tamanho mínimo documentado (px e mm).

## Versões a entregar
`logo-principal.svg`, `logo-horizontal.svg`, `logo-vertical.svg`, `simbolo.svg`, `logo-branco.svg`, `logo-preto.svg`, PNG 2048 px transparente de cada, `favicon-512.png`.

## Mini manual (`manual-de-marca.html` → PDF)
1. Conceito (1 parágrafo) · 2. Logo e versões · 3. Área de proteção e tamanho mínimo · 4. Usos incorretos (esticar, recolorir, sombra, fundo poluído) · 5. Cores (HEX, RGB, CMYK aproximado) · 6. Tipografia (família, pesos, escala) · 7. Aplicações (post, cartão, fachada/camiseta em mockup simples).

Renderize o manual com `artes-redes-sociais/scripts/render.js --pdf`.
