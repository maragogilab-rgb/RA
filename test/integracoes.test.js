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

// ---------- Robô de atendimento do WhatsApp ----------
async function zap(base, corpo, token = TOKEN) {
  const r = await fetch(`${base}/api/integracoes/whatsapp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-erp-token': token }, body: JSON.stringify(corpo),
  });
  return { status: r.status, ...(await r.json()) };
}

test('robô: menu, pedido de orçamento completo e passagem para a equipe', async () => {
  const tel = '558277776666';
  const r1 = await zap(base, { telefone: tel, nome: 'Bruna Lima', mensagem: 'Oi, boa tarde' });
  assert.equal(r1.novo, true);
  assert.match(r1.resposta, /Oi, Bruna!/);
  assert.match(r1.resposta, /\*1\* - Pedir um orçamento/);
  assert.doesNotMatch(r1.resposta, /Ver nossos trabalhos/); // sem link de portfólio, a opção não aparece

  const r2 = await zap(base, { telefone: tel, nome: 'Bruna Lima', mensagem: 'banana' });
  assert.match(r2.resposta, /Não entendi/);

  const r3 = await zap(base, { telefone: tel, nome: 'Bruna Lima', mensagem: '1️⃣' });
  assert.match(r3.resposta, /Qual serviço/);
  assert.match(r3.resposta, /\*2\* - Fotografia/);

  const r4 = await zap(base, { telefone: tel, mensagem: '2' });
  assert.match(r4.resposta, /Qual a data/);
  const r5 = await zap(base, { telefone: tel, mensagem: '12/12' });
  assert.match(r5.resposta, /cidade/);
  const r6 = await zap(base, { telefone: tel, mensagem: 'Maceió' });
  assert.match(r6.resposta, /o que você imagina/);
  const r7 = await zap(base, { telefone: tel, mensagem: 'Ensaio de gestante, umas 30 fotos' });
  assert.match(r7.resposta, /Já anotei tudo/);

  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(r1.cliente_id);
  assert.match(cliente.observacoes, /Serviço: Fotografia/);
  assert.match(cliente.observacoes, /12\/12/);
  assert.match(cliente.observacoes, /Maceió/);
  assert.match(cliente.observacoes, /30 fotos/);
  // A tarefa do novo lead vira "Enviar orçamento" (sem duplicar).
  const tarefas = db.prepare('SELECT * FROM tarefas WHERE cliente_id = ?').all(r1.cliente_id);
  assert.equal(tarefas.length, 1);
  assert.match(tarefas[0].titulo, /Enviar orçamento .*Bruna Lima — Fotografia/);

  // Com a equipe, o robô fica quieto até o contato pedir o menu.
  assert.equal((await zap(base, { telefone: tel, mensagem: 'obrigada!' })).resposta, null);
  assert.match((await zap(base, { telefone: tel, mensagem: 'Menu' })).resposta, /Como posso te ajudar/);
});

test('robô: sai da conversa quando a equipe responde pelo celular, mas ignora o próprio eco', async () => {
  const tel = '558266665555';
  const r1 = await zap(base, { telefone: tel, nome: 'Caio', mensagem: 'olá' });
  // O WhatsApp devolve a resposta do robô como "enviada por mim": não pode desligar o robô.
  assert.equal((await zap(base, { telefone: tel, mensagem: r1.resposta, de_mim: true })).resposta, null);
  assert.match((await zap(base, { telefone: tel, mensagem: '1' })).resposta, /Qual serviço/);
  // Alguém da agência escreveu pelo celular: o robô para.
  await zap(base, { telefone: tel, mensagem: 'Oi Caio, aqui é o Rafael!', de_mim: true });
  assert.equal((await zap(base, { telefone: tel, mensagem: '3' })).resposta, null);
});

test('robô: "falar com a equipe", "já sou cliente" e desistência após 3 respostas inválidas', async () => {
  let r = await zap(base, { telefone: '558255554444', nome: 'Duda', mensagem: 'oi' });
  r = await zap(base, { telefone: '558255554444', mensagem: '3' });
  assert.match(r.resposta, /Já avisei a equipe/);
  assert.match(r.resposta, /mandar \*menu\*/);
  const t = db.prepare('SELECT titulo FROM tarefas WHERE cliente_id = ?').get(r.cliente_id);
  assert.match(t.titulo, /Duda quer falar com a equipe/);

  await zap(base, { telefone: '558244443333', nome: 'Edu', mensagem: 'oi' });
  r = await zap(base, { telefone: '558244443333', mensagem: '2' });
  assert.match(r.resposta, /Me conta/);
  r = await zap(base, { telefone: '558244443333', mensagem: 'Preciso da segunda via do boleto' });
  assert.match(r.resposta, /Já avisei a equipe/);
  assert.match(db.prepare('SELECT titulo FROM tarefas WHERE cliente_id = ?').get(r.cliente_id).titulo, /segunda via do boleto/);

  await zap(base, { telefone: '558233332222', nome: 'Fê', mensagem: 'oi' });
  await zap(base, { telefone: '558233332222', mensagem: 'hã?' });
  await zap(base, { telefone: '558233332222', mensagem: 'como?' });
  r = await zap(base, { telefone: '558233332222', mensagem: 'não sei' });
  assert.match(r.resposta, /Já avisei a equipe/);
});

test('robô: não responde contato já cadastrado e respeita a configuração', async () => {
  db.prepare("INSERT INTO clientes (nome, telefone) VALUES ('Cliente Antigo', '(82) 91111-2222')").run();
  const r = await zap(base, { telefone: '558211112222', mensagem: 'oi' });
  assert.equal(r.novo, false);
  assert.equal(r.resposta, null);

  const up = db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');
  up.run('empresa.bot_portfolio', 'Veja: https://exemplo.com/portfolio');
  let n = await zap(base, { telefone: '558222221111', nome: 'Gabi', mensagem: 'oi' });
  assert.match(n.resposta, /\*2\* - Ver nossos trabalhos/);
  assert.match((await zap(base, { telefone: '558222221111', mensagem: '2' })).resposta, /exemplo\.com\/portfolio/);

  up.run('empresa.bot_modo', 'boas_vindas');
  n = await zap(base, { telefone: '558211110000', nome: 'Hugo', mensagem: 'oi' });
  assert.match(n.resposta, /Oi, Hugo!/);
  assert.doesNotMatch(n.resposta, /Como posso te ajudar/);
  assert.equal((await zap(base, { telefone: '558211110000', mensagem: '1' })).resposta, null);

  up.run('empresa.bot_modo', 'desligado');
  n = await zap(base, { telefone: '558200009999', nome: 'Iris', mensagem: 'oi' });
  assert.equal(n.novo, true);
  assert.equal(n.resposta, null);
  up.run('empresa.bot_modo', 'menu');
  up.run('empresa.bot_portfolio', '');
});

test('robô: conversa parada há mais de 30 dias recomeça pelo menu', async () => {
  const tel = '558299990000';
  await zap(base, { telefone: tel, nome: 'João', mensagem: 'oi' });
  await zap(base, { telefone: tel, mensagem: '3' }); // passa para a equipe
  assert.equal((await zap(base, { telefone: tel, mensagem: 'ok' })).resposta, null);
  db.prepare("UPDATE whatsapp_conversas SET atualizado_em = '2020-01-01T00:00:00.000Z' WHERE chave = '8299990000'").run();
  assert.match((await zap(base, { telefone: tel, mensagem: 'oi, tudo bem?' })).resposta, /Oi de novo, João!/);
});

test('robô: exige o token de integração', async () => {
  assert.equal((await zap(base, { telefone: '558212345678', mensagem: 'oi' }, 'errado')).status, 401);
});
