---
name: novo-modulo-erp
description: Passo a passo para criar ou ampliar um módulo do ERP Maragogi Lab (tabela no SQLite, rotas da API, tela no frontend, menu e testes). Usar quando o pedido for uma nova área, cadastro, tela ou rota da API no ERP.
---

# Novo módulo do ERP

O ERP não usa framework nem pacotes npm. Siga o padrão dos módulos existentes (o mais simples de copiar é `agenda`).

## 1. Banco (`src/db.js`)
- Acrescente `CREATE TABLE IF NOT EXISTS <tabela> (...)` junto das outras.
- Coluna nova em tabela existente: faça migração idempotente (confira se a coluna existe antes do `ALTER TABLE`), como as já presentes no arquivo.
- Dinheiro sempre em **centavos** (`INTEGER`). Datas em texto ISO (`AAAA-MM-DD`).

## 2. API (`src/modulos/<nome>.js`)
- Exporte `registrar(router, db, opcoes)` e registre as rotas `router.get/post/put/delete('/api/...')`.
- Valide toda entrada com `src/validar.js` (`v.texto`, `v.data`, `v.inteiro`…) e lance `erro(status, 'mensagem em português')` de `src/http.js`.
- Inclua o nome do módulo na lista de `criarRouter` em `src/app.js`.

## 3. Tela (`public/js/<nome>.js`)
- ES module que importa de `./nucleo.js` (`h`, `trocar`, `GET`/`POST`/`PUT`/`DEL`, `tabela`, `formulario`, `modal`, `cabecalho`, `filtros`, `aviso`).
- Em `public/js/main.js`: importe o módulo, adicione a rota na lista de rotas e o item no menu.
- Sem CDN nem script externo: a CSP (`src/app.js`) só aceita `'self'`.

## 4. Testes (`test/`)
- Use `node:test` e o helper `api()` de `test/api.test.js` como modelo (servidor em porta aleatória com banco temporário).
- Cubra criação, validação (erro 400 com mensagem) e listagem.
- Rode `npm test` antes de terminar.

## 5. Documentação
- Atualize a tabela de módulos em `README.md`.
