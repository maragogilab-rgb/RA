#!/usr/bin/env node
// Hook PostToolUse (Edit/Write): confere a sintaxe de todo .js editado com `node --check`.
// O backend (src/, scripts/, test/, server.js) é CommonJS; o frontend (public/js/) é ES module.
// Se houver erro de sintaxe, sai com código 2 e o Claude recebe a mensagem para corrigir na hora.
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

let entrada = '';
process.stdin.on('data', (c) => { entrada += c; });
process.stdin.on('end', () => {
  let arquivo = '';
  try { arquivo = JSON.parse(entrada).tool_input?.file_path || ''; } catch { process.exit(0); }
  if (!/\.(c|m)?js$/.test(arquivo) || !fs.existsSync(arquivo)) process.exit(0);

  const raiz = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const relativo = path.relative(raiz, arquivo).split(path.sep).join('/');
  const ehModulo = relativo.startsWith('public/') || arquivo.endsWith('.mjs');

  const r = ehModulo
    ? spawnSync(process.execPath, ['--check', '--input-type=module'], { input: fs.readFileSync(arquivo) })
    : spawnSync(process.execPath, ['--check', arquivo]);

  if (r.status !== 0) {
    process.stderr.write(`Erro de sintaxe em ${relativo}:\n${String(r.stderr).trim()}\n`);
    process.exit(2);
  }
  process.exit(0);
});
