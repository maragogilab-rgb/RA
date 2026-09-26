'use strict';

const { erro } = require('../http');
const { transacao } = require('../db');
const v = require('../validar');
const crypto = require('node:crypto');
const { gerarParcelas, cancelarParcelas } = require('./financeiro');
const { lerEmpresa } = require('./sistema');

const FORMAS = ['pix', 'transferencia', 'boleto', 'cartao', 'dinheiro'];
// Etapas de um job aprovado, na ordem em que acontecem.
const ETAPAS = ['aprovado', 'producao', 'revisao', 'entregue'];
const STATUS = ['proposta', ...ETAPAS, 'recusado', 'cancelado'];

function registrar(router, db) {
  const buscar = (id) => {
    const p = db.prepare(`
      SELECT p.*, c.nome AS cliente_nome, c.nome_fantasia AS cliente_fantasia, pc.nome AS parceiro_nome, c.documento AS cliente_documento,
        c.email AS cliente_email, c.telefone AS cliente_telefone, c.contato AS cliente_contato
      FROM projetos p JOIN clientes c ON c.id = p.cliente_id LEFT JOIN clientes pc ON pc.id = p.parceiro_id
      WHERE p.id = ?`).get(id);
    if (!p) throw erro(404, 'Projeto não encontrado');
    p.itens = db.prepare('SELECT * FROM projeto_itens WHERE projeto_id = ? ORDER BY id').all(id);
    const lanc = db.prepare(`
      SELECT l.*, f.nome AS fornecedor_nome FROM lancamentos l LEFT JOIN fornecedores f ON f.id = l.fornecedor_id
      WHERE l.projeto_id = ? ORDER BY l.vencimento, l.id`).all(id);
    p.receitas = lanc.filter((l) => l.tipo === 'receber');
    p.custos = lanc.filter((l) => l.tipo === 'pagar');
    const soma = (ls, campo = 'valor') => ls.filter((l) => l.status !== 'cancelado').reduce((s, l) => s + (l[campo] || 0), 0);
    const receita = p.status === 'proposta' || p.status === 'recusado' ? p.total : soma(p.receitas);
    const custos = soma(p.custos);
    p.resumo = {
      receita,
      recebido: soma(p.receitas.filter((l) => l.status === 'pago'), 'valor_pago'),
      custos,
      lucro: receita - custos,
      margem: receita ? Math.round(((receita - custos) / receita) * 1000) / 10 : 0,
    };
    return p;
  };

  const ler = (b) => {
    const clienteId = v.inteiro(b.cliente_id, 'cliente_id', { obrigatorio: true });
    const cliente = db.prepare('SELECT id, ativo FROM clientes WHERE id = ?').get(clienteId);
    if (!cliente) throw erro(400, 'Cliente não encontrado');
    if (!cliente.ativo) throw erro(400, 'Cliente inativo');
    if (!Array.isArray(b.itens) || b.itens.length === 0) throw erro(400, 'Informe ao menos um serviço');
    if (b.itens.length > 200) throw erro(400, 'Máximo de 200 itens por projeto');
    const itens = b.itens.map((it, i) => {
      const servicoId = v.inteiro(it.servico_id, `itens[${i}].servico_id`);
      let servico = null;
      if (servicoId) {
        servico = db.prepare('SELECT id, nome, preco FROM servicos WHERE id = ?').get(servicoId);
        if (!servico) throw erro(400, `Serviço ${servicoId} não encontrado`);
      }
      const descricao = v.texto(it.descricao, `itens[${i}].descricao`, { max: 500 }) || servico?.nome;
      if (!descricao) throw erro(400, 'Cada item precisa de um serviço ou descrição');
      const quantidade = v.numero(it.quantidade, `itens[${i}].quantidade`, { min: 0, padrao: 1 });
      if (quantidade <= 0) throw erro(400, 'A quantidade dos itens deve ser maior que zero');
      const preco = v.centavos(it.preco_unitario, `itens[${i}].preco_unitario`, { padrao: servico?.preco ?? 0 });
      return {
        servico_id: servicoId, descricao, quantidade, preco_unitario: preco, subtotal: Math.round(quantidade * preco),
        detalhe: v.texto(it.detalhe, `itens[${i}].detalhe`, { max: 500 }),
        medida: v.texto(it.medida, `itens[${i}].medida`, { max: 50 }),
      };
    });
    const subtotal = itens.reduce((s, it) => s + it.subtotal, 0);
    const desconto = v.centavos(b.desconto, 'desconto', { padrao: 0 });
    if (desconto > subtotal) throw erro(400, 'O desconto não pode ser maior que o subtotal');
    if (b.comissao_pct > 100) throw erro(400, 'Comissão deve ser até 100%');
    if (b.parceiro_id && !db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(b.parceiro_id)) throw erro(400, 'Parceiro não encontrado');
    const parcelas = v.inteiro(b.parcelas, 'parcelas', { min: 1, padrao: 1 });
    if (parcelas > 36) throw erro(400, 'Máximo de 36 parcelas');
    return {
      cliente_id: clienteId,
      titulo: v.texto(b.titulo, 'titulo', { obrigatorio: true, max: 200 }),
      descricao: v.texto(b.descricao, 'descricao', { max: 5000 }),
      data: v.data(b.data, 'data') || v.hoje(),
      validade: v.data(b.validade, 'validade'),
      prazo_entrega: v.data(b.prazo_entrega, 'prazo_entrega'),
      itens,
      subtotal,
      desconto,
      total: subtotal - desconto,
      forma_pagamento: v.opcao(b.forma_pagamento, 'forma_pagamento', FORMAS, { padrao: 'pix' }),
      parcelas,
      primeiro_vencimento: v.data(b.primeiro_vencimento, 'primeiro_vencimento'),
      condicoes: v.texto(b.condicoes, 'condicoes', { max: 2000 }),
      condicoes_titulo: v.texto(b.condicoes_titulo, 'condicoes_titulo', { max: 60 }),
      categoria: v.texto(b.categoria, 'categoria', { max: 100 }),
      prazo_texto: v.texto(b.prazo_texto, 'prazo_texto', { max: 200 }),
      pagamento_texto: v.texto(b.pagamento_texto, 'pagamento_texto', { max: 200 }),
      area: v.texto(b.area, 'area', { max: 100 }),
      parceiro_id: v.inteiro(b.parceiro_id, 'parceiro_id'),
      comissao_pct: v.numero(b.comissao_pct, 'comissao_pct', { min: 0 }),
      termos: v.texto(b.termos, 'termos', { max: 4000 }),
      observacoes: v.texto(b.observacoes, 'observacoes', { max: 2000 }),
    };
  };

  const CAMPOS = ['cliente_id', 'titulo', 'descricao', 'data', 'validade', 'prazo_entrega', 'subtotal', 'desconto', 'total',
    'forma_pagamento', 'parcelas', 'primeiro_vencimento', 'condicoes', 'observacoes', 'condicoes_titulo', 'categoria', 'prazo_texto',
    'pagamento_texto', 'termos', 'area', 'parceiro_id', 'comissao_pct'];

  const salvarItens = (projetoId, itens) => {
    db.prepare('DELETE FROM projeto_itens WHERE projeto_id = ?').run(projetoId);
    const ins = db.prepare(`INSERT INTO projeto_itens (projeto_id, servico_id, descricao, detalhe, medida, quantidade, preco_unitario, subtotal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const it of itens) ins.run(projetoId, it.servico_id, it.descricao, it.detalhe, it.medida, it.quantidade, it.preco_unitario, it.subtotal);
  };

  const inserir = (d, usuarioId) => {
    const r = db.prepare(`INSERT INTO projetos (${CAMPOS.join(', ')}, usuario_id) VALUES (${CAMPOS.map(() => '?').join(', ')}, ?)`)
      .run(...CAMPOS.map((c) => d[c]), usuarioId);
    const id = Number(r.lastInsertRowid);
    salvarItens(id, d.itens);
    return id;
  };

  // Aprovação: vira job e gera as parcelas a receber a partir do primeiro vencimento.
  const aprovar = (id, { primeiroVencimento, usuarioId }) => {
    const p = buscar(id);
    if (p.status !== 'proposta') throw erro(409, 'Somente propostas podem ser aprovadas');
    const hoje = v.hoje();
    const primeiro = primeiroVencimento || p.primeiro_vencimento || hoje;
    if (p.total > 0) {
      gerarParcelas(db, {
        tipo: 'receber',
        total: p.total,
        parcelas: p.parcelas,
        primeiroVencimento: primeiro,
        descricao: `${p.titulo} (#${id})`,
        categoria: 'Projetos',
        origem: 'projeto',
        area: p.area,
        vinculos: { cliente_id: p.cliente_id, projeto_id: id },
        usuarioId,
      });
    }
    // Comissão do parceiro que indicou o cliente: vira conta a pagar.
    if (p.parceiro_id && p.comissao_pct > 0 && p.total > 0) {
      db.prepare(`INSERT INTO lancamentos (tipo, descricao, categoria, valor, vencimento, origem, cliente_id, projeto_id, area, usuario_id)
        VALUES ('pagar', ?, 'Comissão de parceiro', ?, ?, 'comissao', ?, ?, ?, ?)`)
        .run(`Comissão ${String(p.comissao_pct).replace('.', ',')}% — ${p.titulo} (#${id})`, Math.round((p.total * p.comissao_pct) / 100),
          primeiro, p.parceiro_id, id, p.area, usuarioId);
    }
    db.prepare("UPDATE projetos SET status = 'aprovado', data_aprovacao = ?, primeiro_vencimento = ? WHERE id = ?").run(hoje, primeiro, id);
  };

  router.get('/api/projetos', ({ query }) => {
    const where = [];
    const params = [];
    if (query.status === 'andamento') where.push("p.status IN ('aprovado', 'producao', 'revisao')");
    else if (query.status) { where.push('p.status = ?'); params.push(v.opcao(query.status, 'status', STATUS)); }
    if (query.cliente_id) { where.push('p.cliente_id = ?'); params.push(Number(query.cliente_id)); }
    if (query.de) { where.push('p.data >= ?'); params.push(v.data(query.de, 'de')); }
    if (query.ate) { where.push('p.data <= ?'); params.push(v.data(query.ate, 'ate')); }
    if (query.busca) {
      where.push('(p.titulo LIKE ? OR c.nome LIKE ? OR CAST(p.id AS TEXT) = ?)');
      params.push(`%${query.busca}%`, `%${query.busca}%`, String(query.busca).replace('#', ''));
    }
    return db.prepare(`
      SELECT p.*, c.nome AS cliente_nome,
        (SELECT COALESCE(SUM(valor), 0) FROM lancamentos l WHERE l.projeto_id = p.id AND l.tipo = 'pagar' AND l.status != 'cancelado') AS custos
      FROM projetos p JOIN clientes c ON c.id = p.cliente_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY CASE WHEN p.status IN ('aprovado', 'producao', 'revisao') THEN 0 WHEN p.status = 'proposta' THEN 1 ELSE 2 END,
        COALESCE(p.prazo_entrega, p.data) ${query.status === 'entregue' ? 'DESC' : 'ASC'}, p.id DESC
      LIMIT 1000
    `).all(...params);
  });

  router.get('/api/projetos/:id', ({ params }) => buscar(params.id));

  router.post('/api/projetos', (ctx) => {
    const d = ler(ctx.body);
    const id = transacao(db, () => inserir(d, ctx.usuario.id));
    ctx.status = 201;
    return buscar(id);
  });

  router.put('/api/projetos/:id', ({ params, body }) => {
    const atual = buscar(params.id);
    if (atual.status !== 'proposta') throw erro(409, 'Somente propostas podem ser editadas. Para mudar valores de um job aprovado, ajuste as parcelas no financeiro.');
    const d = ler(body);
    transacao(db, () => {
      db.prepare(`UPDATE projetos SET ${CAMPOS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...CAMPOS.map((c) => d[c]), params.id);
      salvarItens(Number(params.id), d.itens);
    });
    return buscar(params.id);
  });

  router.post('/api/projetos/:id/aprovar', (ctx) => {
    const id = Number(ctx.params.id);
    const primeiroVencimento = v.data(ctx.body.primeiro_vencimento, 'primeiro_vencimento');
    transacao(db, () => aprovar(id, { primeiroVencimento, usuarioId: ctx.usuario.id }));
    return buscar(id);
  });

  router.post('/api/projetos/:id/recusar', ({ params }) => {
    const p = buscar(params.id);
    if (p.status !== 'proposta') throw erro(409, 'Somente propostas podem ser recusadas');
    db.prepare("UPDATE projetos SET status = 'recusado' WHERE id = ?").run(params.id);
    return buscar(params.id);
  });

  // Avança/retorna o job entre as etapas de produção.
  router.post('/api/projetos/:id/etapa', ({ params, body }) => {
    const p = buscar(params.id);
    if (!ETAPAS.includes(p.status)) throw erro(409, 'Somente projetos aprovados mudam de etapa');
    const etapa = v.opcao(body.status, 'status', ETAPAS, { obrigatorio: true });
    const dataEntrega = etapa === 'entregue' ? (v.data(body.data_entrega, 'data_entrega') || v.hoje()) : null;
    db.prepare('UPDATE projetos SET status = ?, data_entrega = ? WHERE id = ?').run(etapa, dataEntrega, params.id);
    return buscar(params.id);
  });

  router.post('/api/projetos/:id/cancelar', (ctx) => {
    const id = Number(ctx.params.id);
    const p = buscar(id);
    if (['cancelado', 'recusado'].includes(p.status)) throw erro(409, 'Projeto já encerrado');
    transacao(db, () => {
      if (p.status !== 'proposta') {
        cancelarParcelas(db, { projetoId: id, origem: 'projeto' });
        db.prepare("UPDATE lancamentos SET status = 'cancelado' WHERE projeto_id = ? AND origem = 'comissao' AND status = 'aberto'").run(id);
      }
      db.prepare("UPDATE projetos SET status = 'cancelado' WHERE id = ?").run(id);
    });
    return buscar(id);
  });

  // Link público do orçamento (para enviar ao cliente por WhatsApp/e-mail).
  router.post('/api/projetos/:id/link', ({ params }) => {
    const p = buscar(params.id);
    let token = p.token_publico;
    if (!token) {
      token = crypto.randomBytes(18).toString('base64url');
      db.prepare('UPDATE projetos SET token_publico = ? WHERE id = ?').run(token, p.id);
    }
    return { token, caminho: `/orcamento.html?t=${token}` };
  });

  router.get('/api/publico/orcamento/:token', ({ params }) => {
    const token = String(params.token);
    if (token.length < 20) throw erro(404, 'Orçamento não encontrado');
    const linha = db.prepare('SELECT id FROM projetos WHERE token_publico = ?').get(token);
    if (!linha) throw erro(404, 'Orçamento não encontrado');
    const p = buscar(linha.id);
    // Somente o que aparece no documento; nada de custos, lucro ou anotações internas.
    const orcamento = {};
    for (const k of ['id', 'titulo', 'descricao', 'data', 'validade', 'prazo_entrega', 'subtotal', 'desconto', 'total', 'forma_pagamento',
      'parcelas', 'condicoes', 'condicoes_titulo', 'categoria', 'prazo_texto', 'pagamento_texto', 'termos', 'cliente_nome',
      'cliente_fantasia', 'cliente_contato', 'cliente_telefone']) orcamento[k] = p[k];
    orcamento.itens = p.itens.map(({ descricao, detalhe, medida, quantidade, preco_unitario, subtotal }) => ({ descricao, detalhe, medida, quantidade, preco_unitario, subtotal }));
    const empresa = lerEmpresa(db);
    const publico = {};
    for (const k of ['nome', 'razao_social', 'cnpj', 'telefone', 'email', 'cidade', 'uf', 'logo', 'pix_chave', 'pix_titular', 'dados_bancarios', 'termos_orcamento']) publico[k] = empresa[k];
    return { orcamento, empresa: publico };
  }, { publica: true });

  // Cria uma nova proposta a partir de um projeto existente (útil para jobs parecidos).
  router.post('/api/projetos/:id/duplicar', (ctx) => {
    const p = buscar(ctx.params.id);
    const d = ler({ ...p, token_publico: null, titulo: `${p.titulo} (cópia)`, data: v.hoje(), validade: null, prazo_entrega: null, primeiro_vencimento: null });
    const id = transacao(db, () => inserir(d, ctx.usuario.id));
    ctx.status = 201;
    return buscar(id);
  });
}

module.exports = { registrar, ETAPAS };
