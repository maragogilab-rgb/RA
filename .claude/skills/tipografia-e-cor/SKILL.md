---
name: tipografia-e-cor
description: Escolhe pares tipográficos, escala de tamanhos e paletas de cor com contraste verificado. Usar ao definir o visual de qualquer peça, marca ou template.
---

# Tipografia e cor

## Tipografia
- **Máximo 2 famílias.** Contraste de função: uma para título (personalidade), uma para texto (legibilidade).
- **Escala** (razão 1.25 a 1.5). Para arte 1080 px de largura: título 72–120 px, subtítulo 40–56, texto 28–34, rodapé ≥ 22. Nada abaixo de 22 px em post.
- Títulos: entrelinha 1.0–1.15, tracking levemente negativo (-0.01 a -0.03em) em tamanhos grandes. Texto: entrelinha 1.3–1.5.
- CAIXA ALTA só em palavras curtas, com tracking +0.05 a +0.1em.
- Linha de texto: 35–60 caracteres em peças; evite viúvas (palavra sozinha na última linha) — use `text-wrap: balance` em títulos.

### Pares confiáveis (Google Fonts)
| Clima | Título | Texto |
|---|---|---|
| Contemporâneo limpo | Inter Tight / Manrope | Inter |
| Editorial elegante | Fraunces / Playfair Display | Source Sans 3 |
| Impacto, varejo | Anton / Bebas Neue | Roboto |
| Geométrico amigável | Poppins / Outfit | DM Sans |
| Técnico | Space Grotesk | IBM Plex Sans |
| Artesanal, praia | Caprasimo / DM Serif Display | Nunito Sans |

Carregue via `<link href="https://fonts.googleapis.com/css2?family=...&display=swap">` e espere `document.fonts.ready` antes de renderizar (o script `render.js` já faz isso).

## Cor
- Estrutura **60-30-10**: fundo dominante, cor de apoio, destaque só no que importa (CTA, palavra-chave).
- Monte a paleta em **OKLCH** para rampas uniformes; exporte em HEX.
- Sempre defina: `--fundo`, `--texto`, `--texto-suave`, `--destaque`, `--destaque-texto`.
- Verifique contraste (WCAG AA: 4.5:1 texto comum, 3:1 texto ≥ 24 px bold / ≥ 32 px). Fórmula rápida em Node:

```js
const L=h=>{const c=h.match(/\w\w/g).map(x=>{x=parseInt(x,16)/255;return x<=.03928?x/12.92:((x+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const contraste=(a,b)=>{const[x,y]=[L(a.slice(1)),L(b.slice(1))].sort((p,q)=>q-p);return ((x+.05)/(y+.05)).toFixed(2)};
console.log(contraste('#0B3D5C','#F5EFE6'));
```

- Texto sobre foto: use faixa sólida, degradê escuro na área do texto (de 0 a 60–70% de opacidade) ou desfoque — nunca texto cru sobre imagem movimentada.
- Daltonismo: não dependa só de vermelho × verde para diferenciar informação.

## Harmonias rápidas
Monocromática (sóbria) · Análoga (calma) · Complementar (vibrante, use uma como destaque 10%) · Tríade (lúdica, reduza saturação de duas).
