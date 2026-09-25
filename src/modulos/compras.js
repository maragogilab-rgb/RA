'use strict';

const { erro } = require('../http');
const { transacao } = require('../db');
const v = require('../validar');
const { movimentar } = require('./estoque');
const { gerarParcelas, cancelarParcelas } = require('./financeiro');

function registrar(router, db) {
  const buscar = (id) => {
    const compra = db.prepare(`
      SELECT co.*, f.nome AS fornecedor_nome, f.documento AS fornecedor_documento, u.nome AS usuario_nome
      FROM compras co JOIN fornecedores f ON f.id = co.fornecedor_id
      LEFT JOIN usuarios u ON u.id = co.usuario_id
      WHERE co.id = ?`).get(id);
    if (!compra) throw erro(404, 'Compra não encontrada');
    compra.itens = db.prepare(`
      SELECT i.*, p.nome AS produto_nome, p.sku, p.unidade
      FROM compra_itens i JOIN produtos p ON p.id = i.produto_id
      WHERE i.compra_id = ? ORDER BY i.id`).all(id);
    compra.lancamentos = db.prepare('SELECT * FROM lancamentos WHERE compra_id = ? ORDER BY vencimento, id').all(id);
    return compra;
  };

  const ler = (b) => {
    const fornecedorId = v.inteiro(b.fornecedor_id, 'fornecedor_id', { obrigatorio: true });
    const f = db.prepare('SELECT id, ativo FROM fornecedores WHERE id = ?').get(fornecedorId);
    if (!f) throw erro(400, 'Fornecedor não encontrado');
    if (!f.ativo) throw erro(400, 'Fornecedor inativo');
    if (!Array.isArray(b.itens) || b.itens.length === 0) throw erro(400, 'Informe ao menos um item');
    if (b.itens.length > 500) throw erro(400, 'Máximo de 500 itens por compra');
    const itens = b.itens.map((it, i) => {
      const produtoId = v.inteiro(it.produto_id, `itens[${i}].produto_id`, { obrigatorio: true });
      const p = db.prepare('SELECT id, preco_custo FROM produtos WHERE id = ?').get(produtoId);
      if (!p) throw erro(400, `Produto ${produtoId} não encontrado`);
      const quantidade = v.numero(it.quantidade, `itens[${i}].quantidade`, { obrigatorio: true, min: 0 });
      if (quantidade <= 0) throw erro(400, 'A quantidade dos itens deve ser maior que zero');
      const custo = v.centavos(it.custo_unitario, `itens[${i}].custo_unitario`, { padrao: p.preco_custo });
      return { produto_id: produtoId, quantidade, custo_unitario: custo, subtotal: Math.round(quantidade * custo) };
    });
    const parcelas = v.inteiro(b.parcelas, 'parcelas', { min: 1, padrao: 1 });
    if (parcelas > 48) throw erro(400, 'Máximo de 48 parcelas');
    return {
      fornecedor_id: fornecedorId,
      data: v.data(b.data, 'data') || v.hoje(),
      itens,
      total: itens.reduce((s, it) => s + it.subtotal, 0),
      parcelas,
      observacoes: v.texto(b.observacoes, 'observacoes', { max: 2000 }),
    };
  };

  const salvarItens = (compraId, itens) => {
    db.prepare('DELETE FROM compra_itens WHERE compra_id = ?').run(compraId);
    const ins = db.prepare('INSERT INTO compra_itens (compra_id, produto_id, quantidade, custo_unitario, subtotal) VALUES (?, ?, ?, ?, ?)');
    for (const it of itens) ins.run(compraId, it.produto_id, it.quantidade, it.custo_unitario, it.subtotal);
  };

  // Recebimento: dá entrada no estoque, atualiza o custo e gera as contas a pagar.
  const receber = (id, usuarioId) => {
    const compra = buscar(id);
    if (compra.status !== 'pendente') throw erro(409, 'Somente compras pendentes podem ser recebidas');
    const atualizarCusto = db.prepare('UPDATE produtos SET preco_custo = ? WHERE id = ?');
    for (const it of compra.itens) {
      movimentar(db, it.produto_id, 'entrada', it.quantidade, { motivo: `Compra #${id}`, referencia: `compra:${id}`, usuarioId });
      atualizarCusto.run(it.custo_unitario, it.produto_id);
    }
    if (compra.total > 0) {
      gerarParcelas(db, {
        tipo: 'pagar',
        total: compra.total,
        parcelas: compra.parcelas,
        dataBase: compra.data,
        descricao: `Compra #${id}`,
        categoria: 'Compras',
        vinculos: { fornecedor_id: compra.fornecedor_id, compra_id: id },
        usuarioId,
      });
    }
    db.prepare("UPDATE compras SET status = 'recebida' WHERE id = ?").run(id);
  };

  router.get('/api/compras', ({ query }) => {
    const where = [];
    const params = [];
    if (query.status) { where.push('co.status = ?'); params.push(v.opcao(query.status, 'status', ['pendente', 'recebida', 'cancelada'])); }
    if (query.fornecedor_id) { where.push('co.fornecedor_id = ?'); params.push(Number(query.fornecedor_id)); }
    if (query.de) { where.push('co.data >= ?'); params.push(v.data(query.de, 'de')); }
    if (query.ate) { where.push('co.data <= ?'); params.push(v.data(query.ate, 'ate')); }
    if (query.busca) { where.push('(f.nome LIKE ? OR CAST(co.id AS TEXT) = ?)'); params.push(`%${query.busca}%`, String(query.busca).replace('#', '')); }
    return db.prepare(`
      SELECT co.*, f.nome AS fornecedor_nome,
        (SELECT COUNT(*) FROM compra_itens i WHERE i.compra_id = co.id) AS qtd_itens
      FROM compras co JOIN fornecedores f ON f.id = co.fornecedor_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY co.data DESC, co.id DESC LIMIT 1000
    `).all(...params);
  });

  router.get('/api/compras/:id', ({ params }) => buscar(params.id));

  router.post('/api/compras', (ctx) => {
    const d = ler(ctx.body);
    const id = transacao(db, () => {
      const r = db.prepare(`INSERT INTO compras (fornecedor_id, data, total, parcelas, observacoes, usuario_id) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(d.fornecedor_id, d.data, d.total, d.parcelas, d.observacoes, ctx.usuario.id);
      const novoId = Number(r.lastInsertRowid);
      salvarItens(novoId, d.itens);
      if (ctx.body.receber) receber(novoId, ctx.usuario.id);
      return novoId;
    });
    ctx.status = 201;
    return buscar(id);
  });

  router.put('/api/compras/:id', ({ params, body }) => {
    const atual = buscar(params.id);
    if (atual.status !== 'pendente') throw erro(409, 'Somente compras pendentes podem ser editadas');
    const d = ler(body);
    transacao(db, () => {
      db.prepare('UPDATE compras SET fornecedor_id = ?, data = ?, total = ?, parcelas = ?, observacoes = ? WHERE id = ?')
        .run(d.fornecedor_id, d.data, d.total, d.parcelas, d.observacoes, params.id);
      salvarItens(Number(params.id), d.itens);
    });
    return buscar(params.id);
  });

  router.post('/api/compras/:id/receber', (ctx) => {
    transacao(db, () => receber(Number(ctx.params.id), ctx.usuario.id));
    return buscar(ctx.params.id);
  });

  router.post('/api/compras/:id/cancelar', (ctx) => {
    const id = Number(ctx.params.id);
    const compra = buscar(id);
    if (compra.status === 'cancelada') throw erro(409, 'Compra já está cancelada');
    transacao(db, () => {
      if (compra.status === 'recebida') {
        cancelarParcelas(db, 'compra_id', id);
        for (const it of compra.itens) {
          movimentar(db, it.produto_id, 'saida', it.quantidade, { motivo: `Cancelamento da compra #${id}`, referencia: `compra:${id}`, usuarioId: ctx.usuario.id });
        }
      }
      db.prepare("UPDATE compras SET status = 'cancelada' WHERE id = ?").run(id);
    });
    return buscar(id);
  });
}

module.exports = { registrar };
