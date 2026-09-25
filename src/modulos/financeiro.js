'use strict';

const { erro } = require('../http');
const v = require('../validar');

// Gera lançamentos parcelados (mensais) vinculados a uma venda ou compra.
function gerarParcelas(db, { tipo, total, parcelas, dataBase, descricao, categoria, pagoEm = null, vinculos = {}, usuarioId = null }) {
  const valores = v.dividirParcelas(total, parcelas);
  const ins = db.prepare(`
    INSERT INTO lancamentos (tipo, descricao, categoria, valor, vencimento, status, pago_em, valor_pago,
      cliente_id, fornecedor_id, venda_id, compra_id, usuario_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  valores.forEach((valor, i) => {
    const vencimento = pagoEm ? dataBase : v.somarMeses(dataBase, i + 1);
    const desc = parcelas > 1 ? `${descricao} - parcela ${i + 1}/${parcelas}` : descricao;
    ins.run(tipo, desc, categoria, valor, vencimento, pagoEm ? 'pago' : 'aberto', pagoEm, pagoEm ? valor : null,
      vinculos.cliente_id ?? null, vinculos.fornecedor_id ?? null, vinculos.venda_id ?? null, vinculos.compra_id ?? null, usuarioId);
  });
}

// Cancela os lançamentos em aberto de uma venda/compra; recusa se algum já foi pago.
function cancelarParcelas(db, coluna, id) {
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM lancamentos WHERE ${coluna} = ? AND status = 'pago'`).get(id);
  if (n > 0) throw erro(409, 'Existem parcelas já pagas. Estorne os pagamentos antes de cancelar.');
  db.prepare(`UPDATE lancamentos SET status = 'cancelado' WHERE ${coluna} = ? AND status = 'aberto'`).run(id);
}

function registrar(router, db) {
  const buscar = (id) => {
    const r = db.prepare(`
      SELECT l.*, c.nome AS cliente_nome, f.nome AS fornecedor_nome
      FROM lancamentos l
      LEFT JOIN clientes c ON c.id = l.cliente_id
      LEFT JOIN fornecedores f ON f.id = l.fornecedor_id
      WHERE l.id = ?`).get(id);
    if (!r) throw erro(404, 'Lançamento não encontrado');
    return r;
  };

  const ler = (b) => {
    const d = {
      tipo: v.opcao(b.tipo, 'tipo', ['receber', 'pagar'], { obrigatorio: true }),
      descricao: v.texto(b.descricao, 'descricao', { obrigatorio: true, max: 300 }),
      categoria: v.texto(b.categoria, 'categoria', { max: 100 }),
      valor: v.centavos(b.valor, 'valor', { obrigatorio: true }),
      vencimento: v.data(b.vencimento, 'vencimento', { obrigatorio: true }),
      cliente_id: v.inteiro(b.cliente_id, 'cliente_id'),
      fornecedor_id: v.inteiro(b.fornecedor_id, 'fornecedor_id'),
    };
    if (d.valor <= 0) throw erro(400, 'O valor deve ser maior que zero');
    return d;
  };

  router.get('/api/lancamentos', ({ query }) => {
    const where = [];
    const params = [];
    if (query.tipo) { where.push('l.tipo = ?'); params.push(v.opcao(query.tipo, 'tipo', ['receber', 'pagar'])); }
    if (query.status) { where.push('l.status = ?'); params.push(v.opcao(query.status, 'status', ['aberto', 'pago', 'cancelado'])); }
    if (query.de) { where.push('l.vencimento >= ?'); params.push(v.data(query.de, 'de')); }
    if (query.ate) { where.push('l.vencimento <= ?'); params.push(v.data(query.ate, 'ate')); }
    if (query.vencidos === '1') { where.push("l.status = 'aberto' AND l.vencimento < ?"); params.push(v.hoje()); }
    if (query.busca) { where.push('(l.descricao LIKE ? OR l.categoria LIKE ?)'); params.push(`%${query.busca}%`, `%${query.busca}%`); }
    return db.prepare(`
      SELECT l.*, c.nome AS cliente_nome, f.nome AS fornecedor_nome
      FROM lancamentos l
      LEFT JOIN clientes c ON c.id = l.cliente_id
      LEFT JOIN fornecedores f ON f.id = l.fornecedor_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY l.vencimento, l.id LIMIT 2000
    `).all(...params);
  });

  router.get('/api/lancamentos/:id', ({ params }) => buscar(params.id));

  router.post('/api/lancamentos', (ctx) => {
    const d = ler(ctx.body);
    const r = db.prepare(`INSERT INTO lancamentos (tipo, descricao, categoria, valor, vencimento, cliente_id, fornecedor_id, usuario_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(d.tipo, d.descricao, d.categoria, d.valor, d.vencimento, d.cliente_id, d.fornecedor_id, ctx.usuario.id);
    ctx.status = 201;
    return buscar(r.lastInsertRowid);
  });

  router.put('/api/lancamentos/:id', ({ params, body }) => {
    const atual = buscar(params.id);
    if (atual.status !== 'aberto') throw erro(409, 'Somente lançamentos em aberto podem ser editados');
    const d = ler({ ...body, tipo: atual.tipo });
    db.prepare(`UPDATE lancamentos SET descricao = ?, categoria = ?, valor = ?, vencimento = ?, cliente_id = ?, fornecedor_id = ? WHERE id = ?`)
      .run(d.descricao, d.categoria, d.valor, d.vencimento, d.cliente_id ?? atual.cliente_id, d.fornecedor_id ?? atual.fornecedor_id, params.id);
    return buscar(params.id);
  });

  router.post('/api/lancamentos/:id/pagar', ({ params, body }) => {
    const atual = buscar(params.id);
    if (atual.status !== 'aberto') throw erro(409, 'Somente lançamentos em aberto podem ser baixados');
    const pagoEm = v.data(body.data, 'data') || v.hoje();
    const valorPago = v.centavos(body.valor_pago, 'valor_pago', { padrao: atual.valor });
    db.prepare("UPDATE lancamentos SET status = 'pago', pago_em = ?, valor_pago = ? WHERE id = ?").run(pagoEm, valorPago, params.id);
    return buscar(params.id);
  });

  router.post('/api/lancamentos/:id/estornar', ({ params }) => {
    const atual = buscar(params.id);
    if (atual.status !== 'pago') throw erro(409, 'Somente lançamentos pagos podem ser estornados');
    db.prepare("UPDATE lancamentos SET status = 'aberto', pago_em = NULL, valor_pago = NULL WHERE id = ?").run(params.id);
    return buscar(params.id);
  });

  router.post('/api/lancamentos/:id/cancelar', ({ params }) => {
    const atual = buscar(params.id);
    if (atual.status !== 'aberto') throw erro(409, 'Somente lançamentos em aberto podem ser cancelados');
    if (atual.venda_id || atual.compra_id) throw erro(409, 'Este lançamento pertence a uma venda/compra. Cancele o documento de origem.');
    db.prepare("UPDATE lancamentos SET status = 'cancelado' WHERE id = ?").run(params.id);
    return buscar(params.id);
  });

  // Fluxo de caixa mensal: realizado (pago) e previsto (em aberto).
  router.get('/api/financeiro/fluxo', ({ query }) => {
    const de = v.data(query.de, 'de') || `${v.hoje().slice(0, 4)}-01-01`;
    const ate = v.data(query.ate, 'ate') || `${v.hoje().slice(0, 4)}-12-31`;
    return db.prepare(`
      SELECT mes,
        SUM(CASE WHEN tipo = 'receber' AND status = 'pago' THEN valor_pago ELSE 0 END) AS entradas,
        SUM(CASE WHEN tipo = 'pagar' AND status = 'pago' THEN valor_pago ELSE 0 END) AS saidas,
        SUM(CASE WHEN tipo = 'receber' AND status = 'aberto' THEN valor ELSE 0 END) AS a_receber,
        SUM(CASE WHEN tipo = 'pagar' AND status = 'aberto' THEN valor ELSE 0 END) AS a_pagar
      FROM (
        SELECT tipo, status, valor, valor_pago,
          substr(CASE WHEN status = 'pago' THEN pago_em ELSE vencimento END, 1, 7) AS mes,
          CASE WHEN status = 'pago' THEN pago_em ELSE vencimento END AS ref
        FROM lancamentos WHERE status != 'cancelado'
      )
      WHERE ref BETWEEN ? AND ?
      GROUP BY mes ORDER BY mes
    `).all(de, ate).map((r) => ({ ...r, saldo: r.entradas - r.saidas }));
  });
}

module.exports = { registrar, gerarParcelas, cancelarParcelas };
