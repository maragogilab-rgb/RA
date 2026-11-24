---
name: artes-redes-sociais
description: Produz artes para redes sociais (Instagram feed/story/carrossel/reels capa, LinkedIn, Facebook, TikTok, YouTube thumbnail, WhatsApp) em HTML/CSS e renderiza para PNG/JPG/PDF no tamanho exato com Playwright. Usar para qualquer post, carrossel, story, banner ou thumbnail.
---

# Artes para redes sociais

## Tamanhos (px)
| Peça | Tamanho | Observação |
|---|---|---|
| Instagram feed retrato | 1080×1350 | formato preferido, ocupa mais tela |
| Instagram quadrado | 1080×1080 | grade do perfil corta para 1080×1350 → centro |
| Story / Reels capa / TikTok | 1080×1920 | áreas livres: 250 topo, 340 base |
| Carrossel | 1080×1350 cada | até 20 slides |
| LinkedIn post | 1200×1200 ou 1080×1350 | carrossel = PDF |
| LinkedIn capa perfil | 1584×396 | logo/foto cobre canto inferior esquerdo |
| Facebook capa | 1640×624 | |
| YouTube thumbnail | 1280×720 | texto ≤ 4 palavras, rosto + contraste |
| YouTube banner | 2560×1440 | área segura 1546×423 central |
| WhatsApp status | 1080×1920 | |

## Fluxo
1. Escreva `arte.html` com um `<div class="arte">` por peça, cada um no tamanho exato (`width/height` em px, `overflow:hidden`). Carrossel = vários `.arte` no mesmo arquivo.
2. Use variáveis CSS para a marca (`--fundo`, `--texto`, `--destaque`, fontes).
3. Imagens locais com caminho relativo; fotos grandes otimizadas (≤ 2 MB).
4. Renderize:

```bash
node .claude/skills/artes-redes-sociais/scripts/render.js arte.html saida/ --formato png   # um PNG por .arte
node .claude/skills/artes-redes-sociais/scripts/render.js arte.html saida/ --formato jpg   # JPG qualidade 92
node .claude/skills/artes-redes-sociais/scripts/render.js arte.html saida/ --pdf           # um PDF com todas (carrossel LinkedIn / impressão)
```

5. Abra o resultado com `Read` para conferir visualmente. Corrija e renderize de novo.

## Esqueleto
```html
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;800&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root{--fundo:#F5EFE6;--texto:#10222E;--destaque:#E4572E;--m:80px}
  *{margin:0;box-sizing:border-box}
  body{background:#777}
  .arte{width:1080px;height:1350px;position:relative;overflow:hidden;background:var(--fundo);color:var(--texto);font-family:Inter,sans-serif;padding:var(--m);display:flex;flex-direction:column}
  h1{font:800 104px/1.02 'Inter Tight',sans-serif;letter-spacing:-.02em;text-wrap:balance}
  .cta{margin-top:auto;align-self:flex-start;background:var(--destaque);color:#fff;font:600 32px Inter;padding:20px 36px;border-radius:999px}
</style></head><body>
<div class="arte"><h1>Título curto e forte</h1><p class="cta">Chame no direct</p></div>
</body></html>
```

## Boas práticas
- Legível em miniatura: teste reduzindo a 25% (o script gera `*-preview.png` com `--preview`).
- Logo pequeno e sempre no mesmo canto; @ do perfil no rodapé.
- Sempre entregue a legenda sugerida junto (gancho na 1ª linha, CTA, 3–8 hashtags relevantes).
- Para o ERP (módulo Conteúdo e redes), salve o PNG final e informe o caminho para anexar ao post.
