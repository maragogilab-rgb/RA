---
allowed-tools: Bash(git checkout:*), Bash(git add:*), Bash(git status:*), Bash(git diff:*), Bash(git push:*), Bash(git commit:*), Bash(npm test)
description: Testa, faz commit, envia e abre um PR
---

## Contexto

- Status: !`git status`
- Diferenças: !`git diff HEAD`
- Ramo atual: !`git branch --show-current`
- Últimos commits (para seguir o estilo): !`git log --oneline -5`

## Tarefa

1. Rode `npm test`. Se falhar, pare e mostre a falha.
2. Se estiver em `main`, crie um ramo novo com nome curto do que mudou.
3. Faça um único commit com mensagem em português, no estilo dos commits acima (frase curta descrevendo o que o usuário ganha).
4. Envie o ramo com `git push -u origin <ramo>`.
5. Abra um pull request em rascunho com título e descrição em português.
