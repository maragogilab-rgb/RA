'use strict';

const { erro } = require('../http');
const v = require('../validar');
const { transacao } = require('../db');
const { movimentar } = require('./estoque');

function montarBusca(query, camposBusca) {
  const where = [];
  const params = [];
  if (query.busca) {
    const termo = `%${String(query.busca).trim()}%`;
    where.push(`(${camposBusca.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    camposBusca.forEach(() => params.push(termo));
  }
  if (query.ativo === '0' || query.ativo === '1') {
    where.push('ativo = ?');
    params.push(Number(query.ativo));
  }
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

function lerPessoa(b) {
  return {
    nome: v.texto(b.nome, 'nome', { obrigatorio: true, max: 200 }),
    documento: v.texto(b.documento, 'documento', { max: 30 }),
    email: v.texto(b.email, 'email', { max: 200 }),
    telefone: v.texto(b.telefone, 'telefone', { max: 30 }),
    endereco: v.texto(b.endereco, 'endereco', { max: 300 }),
    cidade: v.texto(b.cidade, 'cidade', { max: 100 }),
    uf: v.texto(b.uf, 'uf', { max: 2 })?.toUpperCase() ?? null,
    observacoes: v.texto(b.observacoes, 'observacoes', { max: 2000 }),
    ativo: v.booleano(b.ativo),
  };
}

// Clientes e fornecedores compartilham a mesma estrutura.
function registrarPessoas(router, db, tabela, rotulo) {
  const campos = ['nome', 'documento', 'email', 'telefone', 'endereco', 'cidade', 'uf', 'observacoes', 'ativo'];
  const buscar = (id) => {
    const r = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id);
    if (!r) throw erro(404, `${rotulo} não encontrado`);
    return r;
  };

  router.get(`/api/${tabela}`, ({ query }) => {
    const { where, params } = montarBusca(query, ['nome', 'documento', 'email', 'cidade']);
    return db.prepare(`SELECT * FROM ${tabela} ${where} ORDER BY nome LIMIT 1000`).all(...params);
  });

  router.get(`/api/${tabela}/:id`, ({ params }) => buscar(params.id));

  router.post(`/api/${tabela}`, (ctx) => {
    const d = lerPessoa(ctx.body);
    const r = db.prepare(`INSERT INTO ${tabela} (${campos.join(', ')}) VALUES (${campos.map(() => '?').join(', ')})`)
      .run(...campos.map((c) => d[c]));
    ctx.status = 201;
    return buscar(r.lastInsertRowid);
  });

  router.put(`/api/${tabela}/:id`, ({ params, body }) => {
    buscar(params.id);
    const d = lerPessoa(body);
    db.prepare(`UPDATE ${tabela} SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...campos.map((c) => d[c]), params.id);
    return buscar(params.id);
  });

  // Exclusão lógica: registros ficam inativos para preservar o histórico.
  router.delete(`/api/${tabela}/:id`, ({ params }) => {
    buscar(params.id);
    db.prepare(`UPDATE ${tabela} SET ativo = 0 WHERE id = ?`).run(params.id);
  });
}

function registrarProdutos(router, db) {
  const buscar = (id) => {
    const r = db.prepare('SELECT * FROM produtos WHERE id = ?').get(id);
    if (!r) throw erro(404, 'Produto não encontrado');
    return r;
  };
  const ler = (b) => ({
    sku: v.texto(b.sku, 'sku', { max: 60 }),
    nome: v.texto(b.nome, 'nome', { obrigatorio: true, max: 200 }),
    descricao: v.texto(b.descricao, 'descricao', { max: 2000 }),
    unidade: v.texto(b.unidade, 'unidade', { max: 10 }) || 'UN',
    preco_custo: v.centavos(b.preco_custo, 'preco_custo', { padrao: 0 }),
    preco_venda: v.centavos(b.preco_venda, 'preco_venda', { padrao: 0 }),
    estoque_minimo: v.numero(b.estoque_minimo, 'estoque_minimo', { min: 0, padrao: 0 }),
    ativo: v.booleano(b.ativo),
  });
  const campos = ['sku', 'nome', 'descricao', 'unidade', 'preco_custo', 'preco_venda', 'estoque_minimo', 'ativo'];
  const traduzirUnico = (fn) => {
    try {
      return fn();
    } catch (e) {
      if (/UNIQUE constraint failed: produtos.sku/.test(e.message)) throw erro(409, 'Já existe um produto com este SKU');
      throw e;
    }
  };

  router.get('/api/produtos', ({ query }) => {
    const { where, params } = montarBusca(query, ['nome', 'sku', 'descricao']);
    let sql = `SELECT * FROM produtos ${where}`;
    if (query.estoque_baixo === '1') sql += `${where ? ' AND' : ' WHERE'} estoque_atual <= estoque_minimo AND ativo = 1`;
    return db.prepare(`${sql} ORDER BY nome LIMIT 1000`).all(...params);
  });

  router.get('/api/produtos/:id', ({ params }) => buscar(params.id));

  router.post('/api/produtos', (ctx) => {
    const d = ler(ctx.body);
    const inicial = v.numero(ctx.body.estoque_inicial, 'estoque_inicial', { min: 0, padrao: 0 });
    const id = transacao(db, () => {
      const novoId = traduzirUnico(() => db.prepare(
        `INSERT INTO produtos (${campos.join(', ')}) VALUES (${campos.map(() => '?').join(', ')})`,
      ).run(...campos.map((c) => d[c])).lastInsertRowid);
      if (inicial > 0) {
        movimentar(db, novoId, 'entrada', inicial, { motivo: 'Estoque inicial', usuarioId: ctx.usuario.id });
      }
      return novoId;
    });
    ctx.status = 201;
    return buscar(id);
  });

  router.put('/api/produtos/:id', ({ params, body }) => {
    buscar(params.id);
    const d = ler(body);
    traduzirUnico(() => db.prepare(`UPDATE produtos SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...campos.map((c) => d[c]), params.id));
    return buscar(params.id);
  });

  router.delete('/api/produtos/:id', ({ params }) => {
    buscar(params.id);
    db.prepare('UPDATE produtos SET ativo = 0 WHERE id = ?').run(params.id);
  });
}

function registrar(router, db) {
  registrarPessoas(router, db, 'clientes', 'Cliente');
  registrarPessoas(router, db, 'fornecedores', 'Fornecedor');
  registrarProdutos(router, db);
}

module.exports = { registrar };
