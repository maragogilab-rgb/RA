#!/usr/bin/env node
// Hook PreToolUse (Bash): bloqueia comandos que podem apagar dados do ERP ou reescrever o histórico.
// Inspirado em examples/hooks/bash_command_validator_example.py do repositório anthropics/claude-code.
// Saída com código 2 bloqueia o comando e devolve a mensagem (stderr) para o Claude.
'use strict';

const REGRAS = [
  [/\brm\b[^|;&]*\bdata\/[^\s]*\.db/, 'Não apague o banco do ERP (data/*.db). Para testar, use um banco temporário via ERP_DB.'],
  [/\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\.)(\s|$)/, 'rm -rf na raiz, na pasta pessoal ou no projeto inteiro está bloqueado.'],
  [/\bgit\s+push\b.*(--force\b|\s-f\b)(?!-with-lease)/, 'Use git push --force-with-lease, nunca --force.'],
  [/\bgit\s+reset\s+--hard\b/, 'git reset --hard descarta trabalho. Peça confirmação ao usuário antes.'],
  [/\bsqlite3\b.*\b(DROP|DELETE)\b/i, 'Comandos DROP/DELETE direto no banco estão bloqueados. Faça pela API ou por migração em src/db.js.'],
];

let entrada = '';
process.stdin.on('data', (c) => { entrada += c; });
process.stdin.on('end', () => {
  let comando = '';
  try { comando = JSON.parse(entrada).tool_input?.command || ''; } catch { process.exit(0); }
  const problemas = REGRAS.filter(([re]) => re.test(comando)).map(([, msg]) => `• ${msg}`);
  if (problemas.length) {
    process.stderr.write(`Comando bloqueado pelo hook do projeto:\n${problemas.join('\n')}\n`);
    process.exit(2);
  }
  process.exit(0);
});
