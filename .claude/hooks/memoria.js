#!/usr/bin/env node
// Hook SessionStart: "memória" simples do projeto, na linha do plugin claude-mem (thedotmack/claude-mem),
// mas sem serviço nem banco extra: tudo o que sair aqui em stdout entra no contexto da nova sessão.
// Junta as anotações de .claude/memoria.md, os últimos commits e o que está pendente no git.
'use strict';

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const raiz = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const git = (cmd) => { try { return execSync(`git ${cmd}`, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

const partes = ['# Memória do projeto (carregada automaticamente)'];

const arquivoMemoria = path.join(raiz, '.claude', 'memoria.md');
if (fs.existsSync(arquivoMemoria)) {
  const linhas = fs.readFileSync(arquivoMemoria, 'utf8').trim().split('\n');
  partes.push('## Anotações (.claude/memoria.md)', linhas.slice(-80).join('\n'));
}

const commits = git('log --oneline -10');
if (commits) partes.push('## Últimos commits', commits);

const ramo = git('branch --show-current');
const pendente = git('status --short');
partes.push(`## Estado do git\nRamo atual: ${ramo || '(desconhecido)'}`, pendente ? `Alterações não commitadas:\n${pendente}` : 'Sem alterações pendentes.');

process.stdout.write(`${partes.join('\n\n')}\n`);
