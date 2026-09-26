# Colocar o ERP na internet (Railway)

Depois disso, você e seu sócio acessam por um link (ex.: `https://maragogi-lab.up.railway.app`),
no computador ou celular, sem usar o Terminal. Custo: plano Hobby do Railway, cerca de **US$ 5/mês**.

## 1. Criar o projeto (uma vez só)

1. Acesse **https://railway.com** e clique em **Login** → **Continue with GitHub** (use a conta `maragogilab-rgb`).
2. Clique em **New Project** → **Deploy from GitHub repo**.
   Se pedir, autorize o Railway a acessar o repositório **RA**.
3. Escolha **maragogilab-rgb/RA**. O Railway começa a montar o sistema.
   A primeira tentativa **vai falhar**, porque ainda falta a senha. Isso é esperado.

## 2. Definir seu usuário e senha

Clique no serviço criado → aba **Variables** → **New Variable** e adicione:

| Nome | Valor |
|---|---|
| `ERP_ADMIN_EMAIL` | seu e-mail de acesso (ex.: `maragogilab@gmail.com`) |
| `ERP_ADMIN_SENHA` | uma senha forte, com no mínimo 8 caracteres |
| `ERP_ADMIN_NOME` | `Rafael` |

## 3. Guardar os dados (muito importante)

Sem este passo, **os dados se perdem** a cada atualização.

1. No serviço, clique com o botão direito (ou use **Ctrl/Cmd + K**) → **Add Volume**.
2. Em **Mount path**, digite exatamente: `/app/data`.

## 4. Gerar o link

Aba **Settings** → **Networking** → **Generate Domain**. Copie o endereço que aparece.

Se o serviço não reiniciou sozinho após os passos 2 e 3, clique em **Deploy** (ou **Redeploy**).
Quando ficar verde (**Active**), o sistema está no ar.

## 5. Primeiro acesso

1. Abra o link e entre com o e-mail e a senha do passo 2.
2. No **Painel** aparece **"Bem-vindo! Vamos trazer seus dados"**. Clique em **Escolher arquivo**,
   selecione `backup-maragogi-lab-2026-09-26.json` e clique em **Importar**.
3. **Configurações → Orçamento (PDF)**: envie a logo e clique em **Salvar**.
4. **Configurações → Usuários → Novo usuário**: crie o acesso do seu sócio com o e-mail e uma senha para ele.
   Envie o link e os dados de acesso para ele.

> Dica: no celular, abra o link e use **Compartilhar → Adicionar à Tela de Início** para ter um ícone como um app.

## Atualizações

Sempre que houver uma nova versão no GitHub, o Railway atualiza sozinho em cerca de 1 minuto. Os dados continuam no volume.

## Backup

Os dados ficam no volume do Railway. De vez em quando, exporte as listas em CSV (botão **Exportar CSV**).
Para ter a cópia completa do banco, use no Railway a opção de backup do volume (**Backups** no volume).

## Segurança

- **Repositório público:** o repositório `maragogilab-rgb/RA` está **público** no GitHub. O código fica visível para
  qualquer pessoa, mas **os dados não**, porque ficam só no servidor. Se preferir, deixe-o privado em
  GitHub → RA → **Settings** → **Change visibility** → **Private**. O Railway continua funcionando.
- **Senha padrão:** online, o sistema não aceita `admin123`. O primeiro acesso usa as variáveis do passo 2.
