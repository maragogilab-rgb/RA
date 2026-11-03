# Ligar o Instagram ao ERP

Com o perfil conectado, o ERP:

- **puxa sozinho** seguidores, alcance, visualizações, interações e cliques no link (a cada 6 horas);
- **importa os posts** já publicados com o resultado de cada um (alcance, curtidas, comentários, compartilhamentos, salvos);
- **publica sozinho** os posts em "Agendado" que estiverem com **"Publicar sozinho no Instagram"** marcado, na data e no horário escolhidos.

Leva uns 10 minutos, uma vez só por perfil.

## 1. Conta profissional

No app do Instagram: **Configurações → Tipo de conta e ferramentas → Mudar para conta profissional**
(Criador de conteúdo ou Empresa). Não precisa de página do Facebook.

## 2. Criar o app na Meta (uma vez só, serve para todos os perfis)

1. Entre em **https://developers.facebook.com** com seu Facebook e clique em **Meus apps → Criar app**.
2. Dê um nome (ex.: `ERP Maragogi Lab`) e, no caso de uso, escolha o de **Instagram**
   (gerenciar mensagens e conteúdo no Instagram). Conclua a criação.
3. Não precisa enviar o app para análise da Meta: para as suas próprias contas ele funciona em modo de desenvolvimento.

## 3. Gerar o token do perfil

1. No painel do app: **Instagram → Configuração da API com login do Instagram**.
2. Em **Gerar tokens de acesso**, clique em **Adicionar conta** e entre com o Instagram do perfil.
   - Se pedir convite de testador: no app do Instagram, **Configurações → Apps e sites → Convites de testador → Aceitar**.
3. Clique em **Gerar token**, autorize e **copie** o texto (começa com `IG…`).

## 4. Colar no ERP

**Conteúdo → Resultados** → escolha o perfil do Instagram (ou **Novo perfil**, rede Instagram, e escolha o cliente)
→ **Conectar Instagram** → cole o token → **Conectar**. Os últimos 30 dias e os posts recentes já aparecem.

Para perfis de clientes, repita o passo 3 com a conta do cliente (ele precisa entrar com o Instagram dele) e crie o perfil
ligado ao cliente. O ERP publica cada post no perfil do cliente do post.

## Publicação automática: o que precisa

- O ERP **na internet** (Railway, ver [COLOCAR-NO-AR.md](COLOCAR-NO-AR.md)). O Instagram baixa a imagem do post pelo link do ERP;
  no computador local isso não funciona (os números continuam sendo puxados normalmente).
  Conecte o perfil **abrindo o ERP pelo endereço da internet**: o ERP guarda esse endereço. Se precisar, defina a variável
  `ERP_URL_PUBLICA` (ex.: `https://maragogi-lab.up.railway.app`).
- Post com **imagem** (formato Post ou Carrossel; o ERP envia a imagem de capa). Reels, vídeos e stories: publique pelo app.
- Etapa **Agendado**, com data e horário, e a opção **Publicar sozinho no Instagram** marcada.

Se algo falhar, o motivo aparece no próprio post e o ERP tenta de novo até 3 vezes. Ao salvar o post, as tentativas recomeçam.
Também dá para clicar em **Publicar agora no Instagram** dentro do post.

## Token

O token vale 60 dias e o ERP **renova sozinho** toda semana enquanto estiver ligado.
Se ficar mais de 60 dias desligado (ou você trocar a senha do Instagram), aparece um aviso: é só gerar um token novo e conectar de novo.
