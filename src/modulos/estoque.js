'use strict';

const { erro } = require('../http');
const { transacao } = require('../db');
const v = require('../validar');

const arred = (n) => Math.round(n * 1000) / 1000;

// Registra uma movimentação e atualiza o saldo do produto.
// "ajuste" define o saldo final; "entrada"/"saida" somam/subtraem a quantidade.
function movimentar(db, produtoId, tipo, quantidade, { motivo = null, referencia = null, usuarioId = null, permitirNegativo = false } = {}) {
  const p = db.prepare('SELECT id, nome, estoque_atual FROM produtos WHERE id = ?').get(produtoId);
  if (!p) throw erro(404, `Produto ${produtoId} não encontrado`);
  let saldo;
  if (tipo === 'entrada') saldo = p.estoque_atual + quantidade;
  else if (tipo === 'saida') saldo = p.estoque_atual - quantidade;
  else saldo = quantidade;
  saldo = arred(saldo);
  if (saldo < 0 && !permitirNegativo) {
    throw erro(409, `Estoque insuficiente para "${p.nome}" (disponível: ${p.estoque_atual}, necessário: ${quantidade})`);
  }
  db.prepare('UPDATE produtos SET estoque_atual = ? WHERE id = ?').run(saldo, produtoId);
  db.prepare(`INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, saldo_apos, motivo, referencia, usuario_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(produtoId, tipo, quantidade, saldo, motivo, referencia, usuarioId);
  return saldo;
}

function registrar(router, db) {
  router.get('/api/estoque/movimentacoes', ({ query }) => {
    const where = [];
    const params = [];
    if (query.produto_id) { where.push('m.produto_id = ?'); params.push(Number(query.produto_id)); }
    if (query.de) { where.push('date(m.criado_em) >= ?'); params.push(v.data(query.de, 'de')); }
    if (query.ate) { where.push('date(m.criado_em) <= ?'); params.push(v.data(query.ate, 'ate')); }
    return db.prepare(`
      SELECT m.*, p.nome AS produto_nome, p.unidade, u.nome AS usuario_nome
      FROM movimentacoes_estoque m
      JOIN produtos p ON p.id = m.produto_id
      LEFT JOIN usuarios u ON u.id = m.usuario_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY m.id DESC LIMIT 1000
    `).all(...params);
  });

  router.post('/api/estoque/movimentacoes', (ctx) => {
    const b = ctx.body;
    const produtoId = v.inteiro(b.produto_id, 'produto_id', { obrigatorio: true });
    const tipo = v.opcao(b.tipo, 'tipo', ['entrada', 'saida', 'ajuste'], { obrigatorio: true });
    const quantidade = v.numero(b.quantidade, 'quantidade', { obrigatorio: true, min: 0 });
    if (tipo !== 'ajuste' && quantidade <= 0) throw erro(400, 'A quantidade deve ser maior que zero');
    const motivo = v.texto(b.motivo, 'motivo', { max: 300 }) || 'Movimentação manual';
    const saldo = transacao(db, () => movimentar(db, produtoId, tipo, quantidade, { motivo, usuarioId: ctx.usuario.id }));
    ctx.status = 201;
    return { produto_id: produtoId, estoque_atual: saldo };
  });
}

module.exports = { registrar, movimentar };
