'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { abrir } = require('../src/db');
const { garantirAdmin } = require('../src/auth');
const { criarApp } = require('../src/app');
const { chaveTelefone } = require('../src/modulos/integracoes');

const TOKEN = 'token-de-teste-123';
const servidores = [];

async function subir(opcoes) {
  const db = abrir(':memory:');
  garantirAdmin(db, { email: 'admin@teste.com', senha: 'senha-forte-1' });
  const s = http.createServer(criarApp(db, { log: false, ...opcoes }));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  servidores.push(s);
  return { db, base: `http://127.0.0.1:${s.address().port}` };
}

async function lead(base, corpo, token = TOKEN) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-erp-token'] = token;
  const r = await fetch(`${base}/api/integracoes/lead`, { method: 'POST', headers, body: JSON.stringify(corpo) });
  return { status: r.status, dados: await r.json() };
}

let base;
let db;
before(async () => ({ db, base } = await subir({ tokenIntegracao: TOKEN })));
after(() => servidores.forEach((s) => s.close()));

test('reconhece o mesmo telefone escrito de jeitos diferentes', () => {
  const k = chaveTelefone('+55 (82) 9 9999-1234');
  assert.equal(k, '8299991234');
  assert.equal(chaveTelefone('82999991234'), k);
  assert.equal(chaveTelefone('558299991234'), k); // formato do WhatsApp, sem o 9 extra
  assert.equal(chaveTelefone('5582999991234'), k);
  assert.equal(chaveTelefone('123'), null);
});

test('fica desligada sem ERP_INTEGRACAO_TOKEN', async () => {
  const outro = await subir({});
  assert.equal((await lead(outro.base, { telefone: '82999991234' })).status, 404);
});

test('rejeita token ausente ou errado', async () => {
  assert.equal((await lead(base, { telefone: '82999991234' }, null)).status, 401);
  assert.equal((await lead(base, { telefone: '82999991234' }, 'errado')).status, 401);
});

test('primeiro contato vira lead com tarefa; os seguintes não duplicam', async () => {
  const r1 = await lead(base, { telefone: '558288887777', nome: 'Ana', mensagem: 'Quero um orçamento de vídeo' });
  assert.equal(r1.status, 201);
  assert.equal(r1.dados.novo, true);
  assert.equal(r1.dados.cliente.relacao, 'lead');
  assert.equal(r1.dados.cliente.estagio, 'Novo lead');
  assert.equal(r1.dados.cliente.origem, 'WhatsApp');
  assert.match(r1.dados.cliente.observacoes, /orçamento de vídeo/);
  const tarefa = db.prepare('SELECT * FROM tarefas WHERE id = ?').get(r1.dados.tarefa_id);
  assert.equal(tarefa.cliente_id, r1.dados.cliente.id);
  assert.equal(tarefa.prioridade, 'alta');

  const r2 = await lead(base, { telefone: '(82) 98888-7777', nome: 'Ana' });
  assert.equal(r2.status, 200);
  assert.equal(r2.dados.novo, false);
  assert.equal(r2.dados.cliente.id, r1.dados.cliente.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tarefas').get().n, 1);
});

test('reconhece cliente já cadastrado à mão', async () => {
  db.prepare("INSERT INTO clientes (nome, telefone) VALUES ('G2 Gráfica', '(82) 3333-4444')").run();
  const r = await lead(base, { telefone: '558233334444' });
  assert.equal(r.dados.novo, false);
  assert.equal(r.dados.cliente.nome, 'G2 Gráfica');
});

test('valida telefone', async () => {
  assert.equal((await lead(base, {})).status, 400);
  assert.equal((await lead(base, { telefone: 'abc' })).status, 400);
});
