'use strict';

const { erro } = require('../http');
const { transacao } = require('../db');
const v = require('../validar');
const { movimentar } = require('./estoque');
const { gerarParcelas, cancelarParcelas } = require('./financeiro');

const FORMAS = ['dinheiro', 'pix', 'debito', 'credito', 'boleto', 'prazo'];
const A_VISTA = ['dinheiro', 'pix', 'debito'];

function registrar(router, db) {
  const buscar = (id) => {
    const venda = db.prepare(`
      SELECT ve.*, c.nome AS cliente_nome, c.documento AS cliente_documento, u.nome AS usuario_nome
      FROM vendas ve JOIN clientes c ON c.id = ve.cliente_id
      LEFT JOIN usuarios u ON u.id = ve.usuario_id
      WHERE ve.id = ?`).get(id);
    if (!venda) throw erro(404, 'Venda não encontrada');
    venda.itens = db.prepare(`
      SELECT i.*, p.nome AS produto_nome, p.sku, p.unidade
      FROM venda_itens i JOIN produtos p ON p.id = i.produto_id
      WHERE i.venda_id = ? ORDER BY i.id`).all(id);
    venda.lancamentos = db.prepare('SELECT * FROM lancamentos WHERE venda_id = ? ORDER BY vencimento, id').all(id);
    return venda;
  };

  const ler = (b) => {
    const clienteId = v.inteiro(b.cliente_id, 'cliente_id', { obrigatorio: true });
    const cliente = db.prepare('SELECT id, ativo FROM clientes WHERE id = ?').get(clienteId);
    if (!cliente) throw erro(400, 'Cliente não encontrado');
    if (!cliente.ativo) throw erro(400, 'Cliente inativo');
    if (!Array.isArray(b.itens) || b.itens.length === 0) throw erro(400, 'Informe ao menos um item');
    if (b.itens.length > 500) throw erro(400, 'Máximo de 500 itens por venda');
    const itens = b.itens.map((it, i) => {
      const produtoId = v.inteiro(it.produto_id, `itens[${i}].produto_id`, { obrigatorio: true });
      const p = db.prepare('SELECT id, preco_venda, ativo FROM produtos WHERE id = ?').get(produtoId);
      if (!p) throw erro(400, `Produto ${produtoId} não encontrado`);
      if (!p.ativo) throw erro(400, `Produto ${produtoId} está inativo`);
      const quantidade = v.numero(it.quantidade, `itens[${i}].quantidade`, { obrigatorio: true, min: 0 });
      if (quantidade <= 0) throw erro(400, 'A quantidade dos itens deve ser maior que zero');
      const preco = v.centavos(it.preco_unitario, `itens[${i}].preco_unitario`, { padrao: p.preco_venda });
      return { produto_id: produtoId, quantidade, preco_unitario: preco, subtotal: Math.round(quantidade * preco) };
    });
    const subtotal = itens.reduce((s, it) => s + it.subtotal, 0);
    const desconto = v.centavos(b.desconto, 'desconto', { padrao: 0 });
    if (desconto > subtotal) throw erro(400, 'O desconto não pode ser maior que o subtotal');
    const parcelas = v.inteiro(b.parcelas, 'parcelas', { min: 1, padrao: 1 });
    if (parcelas > 48) throw erro(400, 'Máximo de 48 parcelas');
    return {
      cliente_id: clienteId,
      data: v.data(b.data, 'data') || v.hoje(),
      itens,
      subtotal,
      desconto,
      total: subtotal - desconto,
      forma_pagamento: v.opcao(b.forma_pagamento, 'forma_pagamento', FORMAS, { padrao: 'dinheiro' }),
      parcelas,
      observacoes: v.texto(b.observacoes, 'observacoes', { max: 2000 }),
    };
  };

  const salvarItens = (vendaId, itens) => {
    db.prepare('DELETE FROM venda_itens WHERE venda_id = ?').run(vendaId);
    const ins = db.prepare('INSERT INTO venda_itens (venda_id, produto_id, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?)');
    for (const it of itens) ins.run(vendaId, it.produto_id, it.quantidade, it.preco_unitario, it.subtotal);
  };

  const confirmar = (id, usuarioId) => {
    const venda = buscar(id);
    if (venda.status !== 'orcamento') throw erro(409, 'Somente orçamentos podem ser confirmados');
    for (const it of venda.itens) {
      movimentar(db, it.produto_id, 'saida', it.quantidade, { motivo: `Venda #${id}`, referencia: `venda:${id}`, usuarioId });
    }
    if (venda.total > 0) {
      const aVista = A_VISTA.includes(venda.forma_pagamento) && venda.parcelas === 1;
      gerarParcelas(db, {
        tipo: 'receber',
        total: venda.total,
        parcelas: venda.parcelas,
        dataBase: venda.data,
        descricao: `Venda #${id}`,
        categoria: 'Vendas',
        pagoEm: aVista ? venda.data : null,
        vinculos: { cliente_id: venda.cliente_id, venda_id: id },
        usuarioId,
      });
    }
    db.prepare("UPDATE vendas SET status = 'confirmada' WHERE id = ?").run(id);
  };

  router.get('/api/vendas', ({ query }) => {
    const where = [];
    const params = [];
    if (query.status) { where.push('ve.status = ?'); params.push(v.opcao(query.status, 'status', ['orcamento', 'confirmada', 'cancelada'])); }
    if (query.cliente_id) { where.push('ve.cliente_id = ?'); params.push(Number(query.cliente_id)); }
    if (query.de) { where.push('ve.data >= ?'); params.push(v.data(query.de, 'de')); }
    if (query.ate) { where.push('ve.data <= ?'); params.push(v.data(query.ate, 'ate')); }
    if (query.busca) { where.push('(c.nome LIKE ? OR CAST(ve.id AS TEXT) = ?)'); params.push(`%${query.busca}%`, String(query.busca).replace('#', '')); }
    return db.prepare(`
      SELECT ve.*, c.nome AS cliente_nome,
        (SELECT COUNT(*) FROM venda_itens i WHERE i.venda_id = ve.id) AS qtd_itens
      FROM vendas ve JOIN clientes c ON c.id = ve.cliente_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ve.data DESC, ve.id DESC LIMIT 1000
    `).all(...params);
  });

  router.get('/api/vendas/:id', ({ params }) => buscar(params.id));

  router.post('/api/vendas', (ctx) => {
    const d = ler(ctx.body);
    const id = transacao(db, () => {
      const r = db.prepare(`INSERT INTO vendas (cliente_id, data, subtotal, desconto, total, forma_pagamento, parcelas, observacoes, usuario_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(d.cliente_id, d.data, d.subtotal, d.desconto, d.total, d.forma_pagamento, d.parcelas, d.observacoes, ctx.usuario.id);
      const novoId = Number(r.lastInsertRowid);
      salvarItens(novoId, d.itens);
      if (ctx.body.confirmar) confirmar(novoId, ctx.usuario.id);
      return novoId;
    });
    ctx.status = 201;
    return buscar(id);
  });

  router.put('/api/vendas/:id', ({ params, body }) => {
    const atual = buscar(params.id);
    if (atual.status !== 'orcamento') throw erro(409, 'Somente orçamentos podem ser editados');
    const d = ler(body);
    transacao(db, () => {
      db.prepare(`UPDATE vendas SET cliente_id = ?, data = ?, subtotal = ?, desconto = ?, total = ?, forma_pagamento = ?, parcelas = ?, observacoes = ? WHERE id = ?`)
        .run(d.cliente_id, d.data, d.subtotal, d.desconto, d.total, d.forma_pagamento, d.parcelas, d.observacoes, params.id);
      salvarItens(Number(params.id), d.itens);
    });
    return buscar(params.id);
  });

  router.post('/api/vendas/:id/confirmar', (ctx) => {
    transacao(db, () => confirmar(Number(ctx.params.id), ctx.usuario.id));
    return buscar(ctx.params.id);
  });

  router.post('/api/vendas/:id/cancelar', (ctx) => {
    const id = Number(ctx.params.id);
    const venda = buscar(id);
    if (venda.status === 'cancelada') throw erro(409, 'Venda já está cancelada');
    transacao(db, () => {
      if (venda.status === 'confirmada') {
        cancelarParcelas(db, 'venda_id', id);
        for (const it of venda.itens) {
          movimentar(db, it.produto_id, 'entrada', it.quantidade, { motivo: `Cancelamento da venda #${id}`, referencia: `venda:${id}`, usuarioId: ctx.usuario.id });
        }
      }
      db.prepare("UPDATE vendas SET status = 'cancelada' WHERE id = ?").run(id);
    });
    return buscar(id);
  });
}

module.exports = { registrar };
