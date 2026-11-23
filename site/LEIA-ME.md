# Site maragogilab.com

Página única e estática (só `index.html`, sem instalar nada). Abra o arquivo no navegador para ver.

## Antes de publicar
No fim do `index.html`, troque:
- `WHATSAPP` → seu número com DDI e DDD, só dígitos (ex.: `5582988887777`)
- `EMAIL` → seu e-mail de contato

## Fotos do portfólio
Coloque as imagens em `site/img/` e, dentro de cada bloco `class="peca"`, adicione
`<img src="img/nome-da-foto.jpg" alt="descrição">`.

## Colocar no ar com o domínio
O jeito mais simples e gratuito: **Netlify** (app.netlify.com/drop) — arraste a pasta `site`.
Depois, em *Domain settings*, adicione `maragogilab.com` e siga as instruções de DNS no seu registrador.
