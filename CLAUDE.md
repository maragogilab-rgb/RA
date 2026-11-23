# ERP Maragogi Lab

ERP web para a Maragogi Lab (agência de marketing e audiovisual): propostas, jobs, contratos de fee, NFS-e, agenda, conteúdo/redes e financeiro.

- Fale com o usuário, escreva interface, mensagens de erro e commits em **português do Brasil**.
- A memória do projeto fica em `.claude/memoria.md` e entra sozinha no início de cada sessão. Use `/lembrar` para acrescentar.

## Comandos

- `npm start`: sobe em http://localhost:3000 (`admin@empresa.com` / `admin123` fora de produção)
- `npm test`: testes com `node:test`
- `npm run demo`: carrega dados de exemplo

## Regras

- **Zero dependências npm.** Só Node 22+ (`node:sqlite`, `node:http`, `node:test`, `node:crypto`).
- Backend em CommonJS (`'use strict'`, `require`); frontend em `public/js/` é ES module sem bundler.
- Dinheiro em centavos (inteiros). Datas ISO `AAAA-MM-DD`.
- Validação de entrada sempre por `src/validar.js`; erros com `erro(status, msg)` de `src/http.js`.
- Nunca leia nem apague `data/*.db` nem `.env` (bloqueado em `.claude/settings.json`).
- Para criar um módulo novo, siga a skill `novo-modulo-erp`.

## Estrutura

- `server.js`: entrada; `src/app.js`: rotas, CSP e estáticos; `src/db.js`: esquema e migrações
- `src/modulos/*.js`: API por área; `src/nfse/`: Focus NFe, NFS-e Nacional, certificado A1
- `public/js/*.js`: telas; `public/js/nucleo.js`: utilitários de interface
- `mac/`: instalador para Mac; `Dockerfile` e `railway.json`: hospedagem

## Configuração do Claude Code (`.claude/`)

- `settings.json`: permissões e hooks
- `hooks/memoria.js` (início da sessão), `hooks/proteger-comandos.js` (antes do Bash), `hooks/checar-sintaxe.js` (depois de editar .js)
- Comandos: `/testar`, `/commit-push-pr`, `/lembrar`
