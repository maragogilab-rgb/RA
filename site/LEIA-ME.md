# Site maragogilab.com

É uma página só, estática, sem nada para instalar. Abra o `index.html` no navegador para ver.

## 1. Recuperar o acesso ao domínio (Squarespace)
O maragogilab.com está registrado no **Squarespace**. Hoje ele mostra a página "Em breve" do Squarespace.
Em 30/09 a conta foi acessada com **"Continuar com o Google"** usando **maragogilab@gmail.com**.

1. Acesse **https://account.squarespace.com**.
2. Clique em **Continuar com o Google** e escolha **maragogilab@gmail.com**. Não digite senha.
3. No painel, abra **Domínios** e depois **maragogilab.com**.

Se não entrar: use "Esqueceu a senha?" com o mesmo e-mail, ou peça ajuda ao suporte do Squarespace (support.squarespace.com).

## 2. Colocar o site no ar (Netlify, grátis)
1. Entre em **https://app.netlify.com/drop** (pode criar a conta com o GitHub ou com o Google).
2. Arraste a pasta **site** inteira para a página. Em segundos sai um link do tipo `algo.netlify.app`.
3. No Netlify: **Domain management** → **Add a domain** → digite `maragogilab.com` e confirme.

## 3. Ligar o domínio ao site (no Squarespace)
Em **Domínios → maragogilab.com → Configurações de DNS**:

1. Apague os registros padrão do Squarespace (os do tipo A e o CNAME `www` que apontam para o Squarespace).
2. Adicione:

| Tipo | Host | Valor |
|---|---|---|
| A | @ | `75.2.60.5` |
| CNAME | www | `SEU-SITE.netlify.app` (o link do passo 2) |

3. Em até algumas horas, o maragogilab.com abre o site. O Netlify ativa o cadeado (HTTPS) sozinho.

Não mexa nos registros **MX**, se existirem: eles cuidam de e-mail.

## 4. Antes de publicar: seus dados
No fim do `index.html`, troque:
- `WHATSAPP` → número com DDI e DDD, só dígitos (ex.: `5582988887777`)
- `EMAIL` → seu e-mail de contato

## 5. Fotos e vídeo (é só salvar na pasta `site/img` com estes nomes)
| Arquivo | Onde aparece |
|---|---|
| `reel.mp4` | fundo da abertura e botão "Assistir reel" (vídeo curto, sem som, até ~10 MB) |
| `equipe.jpg` | foto ao lado do primeiro texto |
| `bastidor.jpg` | faixa com a frase escrita à mão |
| `set.jpg` | bloco "Somos um laboratório criativo" (fica em preto e branco) |
| `producao.jpg` | imagem larga da parte de audiovisual |
| `case1.jpg` … `case6.jpg` | cards de Cases (troque também o título e o cliente no `index.html`) |

Enquanto a foto não existir, aparece o fundo com as cores da marca.
Depois de trocar fotos ou textos, arraste a pasta `site` de novo no Netlify (aba **Deploys**).
