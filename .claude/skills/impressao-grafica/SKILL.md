---
name: impressao-grafica
description: Prepara peças para gráfica (cartão de visita, flyer, folder, cartaz, banner, adesivo, etiqueta, embalagem simples) com sangria, margem de segurança, resolução e PDF corretos. Usar para qualquer material impresso.
---

# Impressão gráfica

## Tamanhos comuns (mm, sem sangria)
| Peça | Tamanho |
|---|---|
| Cartão de visita | 90×50 (ou 88×50) |
| Flyer A5 / A6 | 148×210 / 105×148 |
| Cartaz A3 / A2 | 297×420 / 420×594 |
| Folder A4 dobra em 3 | 297×210 aberto (painéis 99, 100, 98 mm — o que dobra para dentro é menor) |
| Banner lona | 800×1200, 900×1200 |
| Adesivo redondo | 50, 70, 100 Ø |

## Regras de arquivo
- **Sangria**: 3 mm de cada lado (lona/banner: 5–10 mm, confirme com a gráfica). Fundo e imagens vazam até a sangria.
- **Margem de segurança**: 4–5 mm para dentro do corte. Texto e logo nunca fora dela.
- **Resolução**: imagens a 300 dpi no tamanho final (banner visto de longe: 100–150 dpi).
- **Texto**: mínimo 6 pt (cartão) / 8 pt (flyer). Preto de texto 100% K, nunca preto "rico" em texto pequeno.
- **Preto rico** em grandes áreas: C40 M30 Y30 K100.
- **Cor**: telas são RGB; gráfica imprime CMYK. Cores muito saturadas (neon, azul elétrico, verde-limão) perdem força — avise o cliente e escolha alternativas próximas. Documente o CMYK aproximado.
- Linhas finas ≥ 0.25 pt. Evite texto vazado fino em fundo de 4 cores.

## Produzindo em HTML → PDF
Trabalhe em mm com sangria incluída:

```html
<style>
  @page { size: 96mm 56mm; margin: 0 }           /* 90×50 + 3 mm de sangria em cada lado */
  .arte { width: 96mm; height: 56mm; position: relative; overflow: hidden; break-after: page }
  .seguro { position: absolute; inset: 8mm; }     /* 3 sangria + 5 segurança */
</style>
```

Renderize com `node .claude/skills/artes-redes-sociais/scripts/render.js cartao.html saida/ --pdf` (frente e verso = dois `.arte`).
Para fluxo profissional (PDF/X-1a, perfil FOGRA39/Coated), converta depois com Ghostscript se disponível:
`gs -dPDFX -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -sColorConversionStrategy=CMYK -sOutputFile=final-cmyk.pdf saida/cartao.pdf`

## Checklist antes de enviar
- [ ] Tamanho final + sangria corretos · [ ] nada importante fora da área segura
- [ ] Fontes incorporadas (PDF do Chromium já incorpora) · [ ] imagens ≥ 300 dpi
- [ ] Ortografia, telefone, @, endereço e QR testados · [ ] prova impressa em casa em 100%
- [ ] Nome do arquivo: `cliente_peca_tamanho_v1.pdf`
