'use strict';

const { erro } = require('../http');
const v = require('../validar');

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

function lerPessoa(b, tabela) {
  const tipo = v.opcao(b.tipo_pessoa, 'tipo_pessoa', ['PF', 'PJ'], { padrao: 'PJ' });
  const documento = v.texto(b.documento, 'documento', { max: 30 });
  if (documento && !v.documentoValido(documento)) throw erro(400, `${tipo === 'PF' ? 'CPF' : 'CNPJ'} inválido: ${documento}`);
  const cep = v.soDigitos(v.texto(b.cep, 'cep', { max: 10 }));
  if (cep && cep.length !== 8) throw erro(400, 'CEP deve ter 8 dígitos');
  const codMun = v.soDigitos(v.texto(b.codigo_municipio, 'codigo_municipio', { max: 7 }));
  if (codMun && codMun.length !== 7) throw erro(400, 'Código IBGE do município deve ter 7 dígitos');
  const d = {
    nome: v.texto(b.nome, 'nome', { obrigatorio: true, max: 200 }),
    tipo_pessoa: tipo,
    documento,
    email: v.texto(b.email, 'email', { max: 200 }),
    telefone: v.texto(b.telefone, 'telefone', { max: 30 }),
    cep,
    logradouro: v.texto(b.logradouro, 'logradouro', { max: 200 }),
    numero: v.texto(b.numero, 'numero', { max: 20 }),
    complemento: v.texto(b.complemento, 'complemento', { max: 100 }),
    bairro: v.texto(b.bairro, 'bairro', { max: 100 }),
    cidade: v.texto(b.cidade, 'cidade', { max: 100 }),
    uf: v.texto(b.uf, 'uf', { max: 2 })?.toUpperCase() ?? null,
    codigo_municipio: codMun,
    observacoes: v.texto(b.observacoes, 'observacoes', { max: 2000 }),
    ativo: v.booleano(b.ativo),
  };
  if (tabela === 'clientes') {
    Object.assign(d, {
      nome_fantasia: v.texto(b.nome_fantasia, 'nome_fantasia', { max: 200 }),
      inscricao_municipal: v.texto(b.inscricao_municipal, 'inscricao_municipal', { max: 30 }),
      inscricao_estadual: v.texto(b.inscricao_estadual, 'inscricao_estadual', { max: 30 }),
      email_nf: v.texto(b.email_nf, 'email_nf', { max: 200 }),
      servico_padrao_id: v.inteiro(b.servico_padrao_id, 'servico_padrao_id'),
    });
  } else {
    d.chave_pix = v.texto(b.chave_pix, 'chave_pix', { max: 100 });
  }
  return d;
}

// Clientes e fornecedores compartilham a mesma estrutura.
function registrarPessoas(router, db, tabela, rotulo) {
  const buscar = (id) => {
    const r = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id);
    if (!r) throw erro(404, `${rotulo} não encontrado`);
    return r;
  };

  router.get(`/api/${tabela}`, ({ query }) => {
    const { where, params } = montarBusca(query, ['nome', 'documento', 'email', 'cidade']);
    const extra = tabela === 'clientes' ? ', s.nome AS servico_padrao_nome FROM clientes LEFT JOIN servicos s ON s.id = clientes.servico_padrao_id' : ` FROM ${tabela}`;
    return db.prepare(`SELECT ${tabela}.*${extra} ${where.replace(/\b(nome|ativo|documento|email|cidade)\b/g, `${tabela}.$1`)} ORDER BY ${tabela}.nome LIMIT 1000`).all(...params);
  });

  router.get(`/api/${tabela}/:id`, ({ params }) => buscar(params.id));

  router.post(`/api/${tabela}`, (ctx) => {
    const d = lerPessoa(ctx.body, tabela);
    const campos = Object.keys(d);
    const r = db.prepare(`INSERT INTO ${tabela} (${campos.join(', ')}) VALUES (${campos.map(() => '?').join(', ')})`)
      .run(...campos.map((c) => d[c]));
    ctx.status = 201;
    return buscar(r.lastInsertRowid);
  });

  router.put(`/api/${tabela}/:id`, ({ params, body }) => {
    buscar(params.id);
    const d = lerPessoa(body, tabela);
    const campos = Object.keys(d);
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

const UNIDADES = ['projeto', 'hora', 'diaria', 'mes', 'unidade', 'video', 'post'];

function registrarServicos(router, db) {
  const buscar = (id) => {
    const r = db.prepare('SELECT * FROM servicos WHERE id = ?').get(id);
    if (!r) throw erro(404, 'Serviço não encontrado');
    return r;
  };
  const campos = ['nome', 'descricao', 'categoria', 'unidade', 'preco', 'ativo',
    'item_lista_servico', 'codigo_tributario_municipio', 'codigo_nbs', 'cnae', 'aliquota_iss'];
  const ler = (b) => ({
    item_lista_servico: v.texto(b.item_lista_servico, 'item_lista_servico', { max: 10 }),
    codigo_tributario_municipio: v.texto(b.codigo_tributario_municipio, 'codigo_tributario_municipio', { max: 30 }),
    codigo_nbs: v.texto(b.codigo_nbs, 'codigo_nbs', { max: 20 }),
    cnae: v.soDigitos(v.texto(b.cnae, 'cnae', { max: 12 })),
    aliquota_iss: v.numero(b.aliquota_iss, 'aliquota_iss', { min: 0 }),
    nome: v.texto(b.nome, 'nome', { obrigatorio: true, max: 200 }),
    descricao: v.texto(b.descricao, 'descricao', { max: 2000 }),
    categoria: v.texto(b.categoria, 'categoria', { max: 100 }),
    unidade: v.opcao(b.unidade, 'unidade', UNIDADES, { padrao: 'projeto' }),
    preco: v.centavos(b.preco, 'preco', { padrao: 0 }),
    ativo: v.booleano(b.ativo),
  });

  router.get('/api/servicos', ({ query }) => {
    const { where, params } = montarBusca(query, ['nome', 'descricao', 'categoria']);
    return db.prepare(`SELECT * FROM servicos ${where} ORDER BY categoria, nome LIMIT 1000`).all(...params);
  });

  router.get('/api/servicos/:id', ({ params }) => buscar(params.id));

  router.post('/api/servicos', (ctx) => {
    const d = ler(ctx.body);
    const r = db.prepare(`INSERT INTO servicos (${campos.join(', ')}) VALUES (${campos.map(() => '?').join(', ')})`)
      .run(...campos.map((c) => d[c]));
    ctx.status = 201;
    return buscar(r.lastInsertRowid);
  });

  router.put('/api/servicos/:id', ({ params, body }) => {
    buscar(params.id);
    const d = ler(body);
    db.prepare(`UPDATE servicos SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...campos.map((c) => d[c]), params.id);
    return buscar(params.id);
  });

  router.delete('/api/servicos/:id', ({ params }) => {
    buscar(params.id);
    db.prepare('UPDATE servicos SET ativo = 0 WHERE id = ?').run(params.id);
  });
}

// Consulta de CEP (ViaCEP) para preencher endereço e código IBGE do município.
const cacheCep = new Map();
function registrarCep(router) {
  router.get('/api/cep/:cep', async ({ params }) => {
    const cep = String(params.cep).replace(/\D/g, '');
    if (cep.length !== 8) throw erro(400, 'CEP deve ter 8 dígitos');
    if (cacheCep.has(cep)) return cacheCep.get(cep);
    let r;
    try {
      r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw erro(502, 'Serviço de CEP indisponível. Preencha o endereço manualmente.');
    }
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.erro) throw erro(404, 'CEP não encontrado');
    const out = { cep, logradouro: d.logradouro || '', bairro: d.bairro || '', cidade: d.localidade || '', uf: d.uf || '', codigo_municipio: d.ibge || '' };
    cacheCep.set(cep, out);
    return out;
  });
}

function registrar(router, db) {
  registrarCep(router);
  registrarPessoas(router, db, 'clientes', 'Cliente');
  registrarPessoas(router, db, 'fornecedores', 'Fornecedor');
  registrarServicos(router, db);
}

module.exports = { registrar };
