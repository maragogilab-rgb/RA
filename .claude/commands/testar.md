---
allowed-tools: Bash(npm test:*), Bash(node --check:*), Read, Grep
description: Roda os testes do ERP e explica as falhas
---

## Contexto

- Alterações pendentes: !`git status --short`

## Tarefa

1. Rode `npm test`.
2. Se tudo passar, responda em uma linha quantos testes passaram.
3. Se algo falhar, para cada falha: diga o teste, o arquivo e a linha, a causa provável (leia o código envolvido) e proponha a correção. Não altere arquivos sem o usuário pedir.
