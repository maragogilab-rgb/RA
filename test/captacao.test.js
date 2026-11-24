'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { abrir } = require('../src/db');
const { garantirAdmin } = require('../src/auth');
const { criarApp } = require('../src/app');

let servidor;
let base;
let cookie = '';

async function api(metodo, caminho, corpo) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(base + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const c = r.headers.get('set-cookie');
  if (c) cookie = c.split(';')[0];
  const t = await r.text();
  return { status: r.status, dados: t ? JSON.parse(t) : null };
}

before(async () => {
  const db = abrir(':memory:');
  garantirAdmin(db, { email: 'admin@teste.com', senha: 'senha-forte-1' });
  servidor = http.createServer(criarApp(db, { log: false }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor.close());

test('página pública de orçamento é servida sem login', async () => {
  const r = await fetch(`${base}/pedir-orcamento?origem=instagram`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Peça seu orçamento/);
  const e = await api('GET', '/api/publico/empresa');
  assert.equal(e.status, 200);
  assert.ok(Array.isArray(e.dados.servicos));
  assert.equal(e.dados.nfse_token, undefined);
});

test('pedido vira lead, aparece no painel e não duplica pelo telefone', async () => {
  assert.equal((await api('POST', '/api/publico/pedido', { nome: 'Ana', telefone: '123' })).status, 400);
  const r = await api('POST', '/api/publico/pedido', { nome: 'Ana Souza', telefone: '(82) 99876-5432', origem: 'instagram', quando: 'dezembro', mensagem: 'Vídeo do casamento' });
  assert.equal(r.status, 201);
  // Robô (campo escondido) é ignorado sem erro.
  assert.equal((await api('POST', '/api/publico/pedido', { nome: 'Bot', telefone: '82999990000', site: 'x' })).status, 200);

  await api('POST', '/api/login', { email: 'admin@teste.com', senha: 'senha-forte-1' });
  let leads = (await api('GET', '/api/clientes?relacao=lead')).dados;
  assert.equal(leads.length, 1);
  assert.equal(leads[0].estagio, 'Novo lead');
  assert.equal(leads[0].origem, 'Instagram');
  assert.match(leads[0].observacoes, /casamento/);

  const painel = (await api('GET', '/api/dashboard')).dados;
  const aviso = painel.lembretes.find((l) => l.tipo === 'lead');
  assert.ok(aviso, 'lembrete de novo pedido no painel');
  assert.equal(aviso.link, 'https://wa.me/5582998765432');

  cookie = '';
  await api('POST', '/api/publico/pedido', { nome: 'Ana', telefone: '82 998765432', mensagem: 'Também quero fotos' });
  await api('POST', '/api/login', { email: 'admin@teste.com', senha: 'senha-forte-1' });
  leads = (await api('GET', '/api/clientes?relacao=lead')).dados;
  assert.equal(leads.length, 1);
  assert.match(leads[0].observacoes, /fotos[\s\S]*casamento/);
});

test('limita pedidos seguidos do mesmo IP', async () => {
  cookie = '';
  let ultimo;
  for (let i = 0; i < 6; i++) ultimo = await api('POST', '/api/publico/pedido', { nome: `P${i}`, telefone: `8298000000${i}` });
  assert.equal(ultimo.status, 429);
});
