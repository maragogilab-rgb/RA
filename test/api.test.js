'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { abrir } = require('../src/db');
const { garantirAdmin } = require('../src/auth');
const { criarApp } = require('../src/app');
const { somarMeses, dividirParcelas, hoje } = require('../src/validar');

let servidor;
let base;
let cookie = '';

async function api(metodo, caminho, corpo, { semCookie = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie && !semCookie) headers.Cookie = cookie;
  const r = await fetch(base + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const texto = await r.text();
  return { status: r.status, dados: texto ? JSON.parse(texto) : null };
}

before(async () => {
  const db = abrir(':memory:');
  garantirAdmin(db, { email: 'admin@teste.com', senha: 'senha-forte-1' });
  servidor = http.createServer(criarApp(db, { log: false }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor.close());

test('utilitários de data e parcelas', () => {
  assert.equal(somarMeses('2026-01-31', 1), '2026-02-28');
  assert.equal(somarMeses('2026-11-15', 2), '2027-01-15');
  assert.equal(somarMeses('2026-03-10', -3), '2025-12-10');
  assert.deepEqual(dividirParcelas(1000, 3), [334, 333, 333]);
});

test('exige autenticação e rejeita senha errada', async () => {
  assert.equal((await api('GET', '/api/clientes')).status, 401);
  assert.equal((await api('POST', '/api/login', { email: 'admin@teste.com', senha: 'errada' })).status, 401);
  const ok = await api('POST', '/api/login', { email: 'admin@teste.com', senha: 'senha-forte-1' });
  assert.equal(ok.status, 200);
  assert.equal(ok.dados.papel, 'admin');
  assert.equal((await api('GET', '/api/me')).dados.email, 'admin@teste.com');
});

test('bloqueia mutações sem JSON (CSRF)', async () => {
  const r = await fetch(`${base}/api/clientes`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'nome=x',
  });
  assert.equal(r.status, 415);
});

let clienteId;
let fornecedorId;
let produtoId;

test('cadastros de clientes, fornecedores e produtos', async () => {
  assert.equal((await api('POST', '/api/clientes', {})).status, 400);
  const c = await api('POST', '/api/clientes', { nome: 'Maria Silva', documento: '123.456.789-00', uf: 'sp' });
  assert.equal(c.status, 201);
  assert.equal(c.dados.uf, 'SP');
  clienteId = c.dados.id;

  const f = await api('POST', '/api/fornecedores', { nome: 'Distribuidora ABC' });
  fornecedorId = f.dados.id;

  const p = await api('POST', '/api/produtos', {
    sku: 'CAN-001', nome: 'Caneta azul', preco_custo: 100, preco_venda: 250, estoque_minimo: 5, estoque_inicial: 10,
  });
  assert.equal(p.status, 201);
  assert.equal(p.dados.estoque_atual, 10);
  produtoId = p.dados.id;

  assert.equal((await api('POST', '/api/produtos', { sku: 'CAN-001', nome: 'Duplicado' })).status, 409);
  const busca = await api('GET', '/api/clientes?busca=maria');
  assert.equal(busca.dados.length, 1);
});

test('compra recebida dá entrada no estoque e gera contas a pagar', async () => {
  const r = await api('POST', '/api/compras', {
    fornecedor_id: fornecedorId, data: '2026-01-10', parcelas: 2, receber: true,
    itens: [{ produto_id: produtoId, quantidade: 20, custo_unitario: 120 }],
  });
  assert.equal(r.status, 201);
  assert.equal(r.dados.status, 'recebida');
  assert.equal(r.dados.total, 2400);
  assert.equal(r.dados.lancamentos.length, 2);
  assert.deepEqual(r.dados.lancamentos.map((l) => l.vencimento), ['2026-02-10', '2026-03-10']);
  const p = await api('GET', `/api/produtos/${produtoId}`);
  assert.equal(p.dados.estoque_atual, 30);
  assert.equal(p.dados.preco_custo, 120);
});

test('venda: orçamento, confirmação, estoque e contas a receber', async () => {
  const orc = await api('POST', '/api/vendas', {
    cliente_id: clienteId, data: hoje(), desconto: 100, forma_pagamento: 'boleto', parcelas: 3,
    itens: [{ produto_id: produtoId, quantidade: 4 }],
  });
  assert.equal(orc.status, 201);
  assert.equal(orc.dados.status, 'orcamento');
  assert.equal(orc.dados.subtotal, 1000);
  assert.equal(orc.dados.total, 900);

  const conf = await api('POST', `/api/vendas/${orc.dados.id}/confirmar`);
  assert.equal(conf.status, 200);
  assert.equal(conf.dados.status, 'confirmada');
  assert.equal(conf.dados.lancamentos.length, 3);
  assert.equal(conf.dados.lancamentos.reduce((s, l) => s + l.valor, 0), 900);
  assert.equal((await api('GET', `/api/produtos/${produtoId}`)).dados.estoque_atual, 26);

  // Não é possível confirmar duas vezes
  assert.equal((await api('POST', `/api/vendas/${orc.dados.id}/confirmar`)).status, 409);

  // Pagar uma parcela bloqueia o cancelamento
  const parcela = conf.dados.lancamentos[0];
  assert.equal((await api('POST', `/api/lancamentos/${parcela.id}/pagar`, {})).dados.status, 'pago');
  assert.equal((await api('POST', `/api/vendas/${orc.dados.id}/cancelar`)).status, 409);

  // Estornando, o cancelamento devolve o estoque
  await api('POST', `/api/lancamentos/${parcela.id}/estornar`);
  const canc = await api('POST', `/api/vendas/${orc.dados.id}/cancelar`);
  assert.equal(canc.dados.status, 'cancelada');
  assert.ok(canc.dados.lancamentos.every((l) => l.status === 'cancelado'));
  assert.equal((await api('GET', `/api/produtos/${produtoId}`)).dados.estoque_atual, 30);
});

test('venda sem estoque suficiente é recusada sem efeitos colaterais', async () => {
  const antes = (await api('GET', '/api/vendas')).dados.length;
  const r = await api('POST', '/api/vendas', {
    cliente_id: clienteId, confirmar: true, itens: [{ produto_id: produtoId, quantidade: 999 }],
  });
  assert.equal(r.status, 409);
  assert.match(r.dados.erro, /Estoque insuficiente/);
  assert.equal((await api('GET', '/api/vendas')).dados.length, antes);
  assert.equal((await api('GET', `/api/produtos/${produtoId}`)).dados.estoque_atual, 30);
});

test('venda à vista gera recebimento já baixado', async () => {
  const r = await api('POST', '/api/vendas', {
    cliente_id: clienteId, confirmar: true, forma_pagamento: 'pix', itens: [{ produto_id: produtoId, quantidade: 1 }],
  });
  assert.equal(r.dados.lancamentos.length, 1);
  assert.equal(r.dados.lancamentos[0].status, 'pago');
  assert.equal(r.dados.lancamentos[0].valor_pago, 250);
});

test('movimentação manual de estoque e ajuste', async () => {
  assert.equal((await api('POST', '/api/estoque/movimentacoes', { produto_id: produtoId, tipo: 'saida', quantidade: 1000 })).status, 409);
  const aj = await api('POST', '/api/estoque/movimentacoes', { produto_id: produtoId, tipo: 'ajuste', quantidade: 50, motivo: 'Inventário' });
  assert.equal(aj.dados.estoque_atual, 50);
  const movs = await api('GET', `/api/estoque/movimentacoes?produto_id=${produtoId}`);
  assert.equal(movs.dados[0].motivo, 'Inventário');
});

test('lançamentos manuais, fluxo de caixa e painel', async () => {
  const l = await api('POST', '/api/lancamentos', { tipo: 'pagar', descricao: 'Aluguel', categoria: 'Aluguel', valor: 150000, vencimento: hoje() });
  assert.equal(l.status, 201);
  await api('POST', `/api/lancamentos/${l.dados.id}/pagar`, { data: hoje() });
  const fluxo = await api('GET', '/api/financeiro/fluxo');
  const mes = fluxo.dados.find((m) => m.mes === hoje().slice(0, 7));
  assert.equal(mes.saidas, 150000);
  assert.equal(mes.entradas, 250);

  const d = await api('GET', '/api/dashboard');
  assert.equal(d.status, 200);
  assert.equal(d.dados.vendas_mes, 250);
  assert.equal(d.dados.saldo_mes, 250 - 150000);

  const rel = await api('GET', '/api/relatorios/vendas-por-produto');
  assert.equal(rel.dados[0].quantidade, 1);
});

test('usuários: somente admin gerencia, usuário comum é bloqueado', async () => {
  const u = await api('POST', '/api/usuarios', { nome: 'Vendedor', email: 'vend@teste.com', senha: 'curta' });
  assert.equal(u.status, 400);
  const ok = await api('POST', '/api/usuarios', { nome: 'Vendedor', email: 'vend@teste.com', senha: 'senha-vendedor' });
  assert.equal(ok.status, 201);

  const adminCookie = cookie;
  await api('POST', '/api/login', { email: 'vend@teste.com', senha: 'senha-vendedor' }, { semCookie: true });
  assert.equal((await api('GET', '/api/usuarios')).status, 403);
  assert.equal((await api('GET', '/api/clientes')).status, 200);
  await api('POST', '/api/logout');
  assert.equal((await api('GET', '/api/clientes')).status, 401);
  cookie = adminCookie;
});

test('servidor de arquivos não permite sair da pasta pública', async () => {
  const r = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.notEqual((await r.text()).includes('"name": "erp-empresa"'), true);
});
