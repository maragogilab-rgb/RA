'use strict';

const crypto = require('node:crypto');
const { erro } = require('../http');
const v = require('../validar');
const { lerEmpresa } = require('./sistema');
const focus = require('../nfse/focusnfe');

const EDITAVEIS = ['rascunho', 'erro'];

// Lista o que falta para a nota poder ser emitida (empresa, cliente e nota).
function pendencias(empresa, cliente, nota) {
  const p = [];
  const falta = (cond, msg) => { if (!cond) p.push(msg); };
  falta(empresa.cnpj && v.documentoValido(empresa.cnpj), 'Empresa: CNPJ válido (Configurações)');
  falta(empresa.razao_social, 'Empresa: razão social (Configurações)');
  const mei = empresa.regime_tributario === 'mei';
  // O MEI emite pelo Emissor Nacional (gov.br): não informa inscrição municipal nem alíquota (ISS vai no DAS).
  if (!mei) falta(empresa.inscricao_municipal, 'Empresa: inscrição municipal (Configurações)');
  falta(empresa.codigo_municipio, 'Empresa: código IBGE do município (Configurações)');
  falta(empresa.regime_tributario, 'Empresa: regime tributário (Configurações)');
  if (cliente) {
    falta(cliente.documento && v.documentoValido(cliente.documento), `Cliente: ${cliente.tipo_pessoa === 'PF' ? 'CPF' : 'CNPJ'} válido`);
    falta(cliente.logradouro, 'Cliente: logradouro do endereço');
    falta(cliente.bairro, 'Cliente: bairro');
    falta(cliente.cep, 'Cliente: CEP');
    falta(cliente.uf, 'Cliente: UF');
    falta(cliente.codigo_municipio, 'Cliente: código IBGE do município');
  }
  falta(nota.discriminacao, 'Nota: discriminação do serviço');
  falta(nota.valor_servicos > 0, 'Nota: valor maior que zero');
  falta(nota.item_lista_servico, mei ? 'Nota: código do serviço (tributação nacional)' : 'Nota: item da lista de serviços (LC 116)');
  if (!mei) falta(nota.aliquota !== null && nota.aliquota !== undefined && nota.aliquota !== '', 'Nota: alíquota do ISS');
  return p;
}

function registrar(router, db, opcoes = {}) {
  const fetchNfse = opcoes.fetchNfse || globalThis.fetch;

  const buscarCliente = (id) => db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
  const buscar = (id) => {
    const n = db.prepare(`
      SELECT n.*, c.nome AS cliente_nome, c.documento AS cliente_documento, p.titulo AS projeto_titulo, s.nome AS servico_nome
      FROM notas_fiscais n JOIN clientes c ON c.id = n.cliente_id
      LEFT JOIN projetos p ON p.id = n.projeto_id LEFT JOIN servicos s ON s.id = n.servico_id
      WHERE n.id = ?`).get(id);
    if (!n) throw erro(404, 'Nota fiscal não encontrada');
    n.pendencias = EDITAVEIS.includes(n.status) ? pendencias(lerEmpresa(db), buscarCliente(n.cliente_id), n) : [];
    return n;
  };

  // Monta uma sugestão de nota a partir de um projeto, parcela ou cliente.
  const sugerir = ({ projeto_id: projetoId, lancamento_id: lancamentoId, cliente_id: clienteId }) => {
    const empresa = lerEmpresa(db);
    const s = { cliente_id: clienteId ? Number(clienteId) : null, projeto_id: null, lancamento_id: null, servico_id: null, discriminacao: '', valor_servicos: 0 };
    let itens = [];
    if (lancamentoId) {
      const l = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(lancamentoId);
      if (!l || l.tipo !== 'receber') throw erro(400, 'Lançamento a receber não encontrado');
      Object.assign(s, { lancamento_id: l.id, cliente_id: l.cliente_id, projeto_id: l.projeto_id, valor_servicos: l.valor, discriminacao: l.descricao });
      if (l.contrato_id && l.competencia) {
        s.discriminacao = `${l.descricao.replace(/ - \d{2}\/\d{4}$/, '')}. Serviço prestado no mês de referência ${l.competencia.split('-').reverse().join('/')}.`;
      }
    }
    const pid = s.projeto_id || (projetoId ? Number(projetoId) : null);
    if (pid) {
      const p = db.prepare('SELECT * FROM projetos WHERE id = ?').get(pid);
      if (!p) throw erro(400, 'Projeto não encontrado');
      itens = db.prepare('SELECT * FROM projeto_itens WHERE projeto_id = ? ORDER BY id').all(pid);
      s.projeto_id = pid;
      s.cliente_id = s.cliente_id || p.cliente_id;
      if (!s.lancamento_id) s.valor_servicos = p.total;
      const lista = itens.map((i) => `- ${i.descricao}${i.quantidade !== 1 ? ` (${String(i.quantidade).replace('.', ',')}x)` : ''}`).join('\n');
      const parcela = s.lancamento_id ? `\nReferente a: ${s.discriminacao}` : '';
      s.discriminacao = `${p.titulo}\n${lista}${parcela}`;
      s.servico_id = itens.find((i) => i.servico_id)?.servico_id ?? null;
    }
    const cliente = s.cliente_id ? buscarCliente(s.cliente_id) : null;
    if (!s.servico_id && cliente?.servico_padrao_id) s.servico_id = cliente.servico_padrao_id;
    const servico = s.servico_id ? db.prepare('SELECT * FROM servicos WHERE id = ?').get(s.servico_id) : null;
    if (!s.discriminacao && servico) s.discriminacao = servico.descricao || servico.nome;
    Object.assign(s, {
      item_lista_servico: servico?.item_lista_servico || empresa.item_lista_servico || '',
      codigo_tributario_municipio: servico?.codigo_tributario_municipio || empresa.codigo_tributario_municipio || '',
      codigo_nbs: servico?.codigo_nbs || '',
      cnae: servico?.cnae || empresa.cnae || '',
      aliquota: servico?.aliquota_iss ?? (empresa.aliquota_iss !== '' ? Number(empresa.aliquota_iss) : null),
      iss_retido: false,
    });
    return s;
  };

  const ler = (b) => {
    const clienteId = v.inteiro(b.cliente_id, 'cliente_id', { obrigatorio: true });
    if (!buscarCliente(clienteId)) throw erro(400, 'Cliente não encontrado');
    const valor = v.centavos(b.valor_servicos, 'valor_servicos', { obrigatorio: true });
    const aliquota = v.numero(b.aliquota, 'aliquota', { min: 0, padrao: 0 });
    if (aliquota > 5) throw erro(400, 'A alíquota do ISS vai de 0% a 5%');
    return {
      cliente_id: clienteId,
      servico_id: v.inteiro(b.servico_id, 'servico_id'),
      projeto_id: v.inteiro(b.projeto_id, 'projeto_id'),
      lancamento_id: v.inteiro(b.lancamento_id, 'lancamento_id'),
      discriminacao: v.texto(b.discriminacao, 'discriminacao', { obrigatorio: true, max: 2000 }),
      valor_servicos: valor,
      aliquota,
      valor_iss: Math.round((valor * aliquota) / 100),
      iss_retido: v.booleano(b.iss_retido, false),
      item_lista_servico: v.texto(b.item_lista_servico, 'item_lista_servico', { max: 10 }),
      codigo_tributario_municipio: v.texto(b.codigo_tributario_municipio, 'codigo_tributario_municipio', { max: 30 }),
      codigo_nbs: v.texto(b.codigo_nbs, 'codigo_nbs', { max: 20 }),
      cnae: v.soDigitos(v.texto(b.cnae, 'cnae', { max: 12 })),
    };
  };
  const CAMPOS = ['cliente_id', 'servico_id', 'projeto_id', 'lancamento_id', 'discriminacao', 'valor_servicos', 'aliquota', 'valor_iss',
    'iss_retido', 'item_lista_servico', 'codigo_tributario_municipio', 'codigo_nbs', 'cnae'];

  const atualizar = (id, campos) => {
    const chaves = Object.keys(campos);
    db.prepare(`UPDATE notas_fiscais SET ${chaves.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...chaves.map((c) => campos[c]), id);
  };

  router.get('/api/notas', ({ query }) => {
    const where = [];
    const params = [];
    if (query.status) { where.push('n.status = ?'); params.push(v.opcao(query.status, 'status', ['rascunho', 'processando', 'emitida', 'erro', 'cancelada'])); }
    if (query.de) { where.push('date(COALESCE(n.data_emissao, n.criado_em)) >= ?'); params.push(v.data(query.de, 'de')); }
    if (query.ate) { where.push('date(COALESCE(n.data_emissao, n.criado_em)) <= ?'); params.push(v.data(query.ate, 'ate')); }
    if (query.busca) { where.push('(c.nome LIKE ? OR n.numero = ? OR n.discriminacao LIKE ?)'); params.push(`%${query.busca}%`, query.busca, `%${query.busca}%`); }
    return db.prepare(`
      SELECT n.*, c.nome AS cliente_nome FROM notas_fiscais n JOIN clientes c ON c.id = n.cliente_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY n.id DESC LIMIT 1000`).all(...params);
  });

  router.get('/api/notas/sugestao', ({ query }) => {
    const s = sugerir(query);
    const cliente = s.cliente_id ? buscarCliente(s.cliente_id) : null;
    return { ...s, pendencias: pendencias(lerEmpresa(db), cliente, s) };
  });

  router.get('/api/notas/:id', ({ params }) => buscar(params.id));

  router.post('/api/notas', (ctx) => {
    const d = ler(ctx.body);
    const r = db.prepare(`INSERT INTO notas_fiscais (referencia, ${CAMPOS.join(', ')}, usuario_id) VALUES (?, ${CAMPOS.map(() => '?').join(', ')}, ?)`)
      .run(`nf-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, ...CAMPOS.map((c) => d[c]), ctx.usuario.id);
    ctx.status = 201;
    return buscar(r.lastInsertRowid);
  });

  router.put('/api/notas/:id', ({ params, body }) => {
    const n = buscar(params.id);
    if (!EDITAVEIS.includes(n.status)) throw erro(409, 'Somente rascunhos ou notas com erro podem ser editados');
    atualizar(params.id, { ...ler(body), status: 'rascunho', mensagem: null });
    return buscar(params.id);
  });

  router.delete('/api/notas/:id', ({ params }) => {
    const n = buscar(params.id);
    if (!EDITAVEIS.includes(n.status)) throw erro(409, 'Somente rascunhos podem ser excluídos');
    db.prepare('DELETE FROM notas_fiscais WHERE id = ?').run(params.id);
  });

  // Emissão automática pela Focus NFe.
  router.post('/api/notas/:id/emitir', async ({ params }) => {
    const n = buscar(params.id);
    if (!EDITAVEIS.includes(n.status)) throw erro(409, 'Esta nota já foi enviada');
    if (n.pendencias.length) throw erro(400, `Complete os dados antes de emitir: ${n.pendencias.join('; ')}`);
    const empresa = lerEmpresa(db);
    if (empresa.nfse_provedor !== 'focusnfe' || !empresa.nfse_token) {
      throw erro(400, 'Emissão automática não configurada. Configure a Focus NFe em Configurações ou use "Registrar nota emitida" após emitir no portal da prefeitura.');
    }
    // Cada envio usa uma referência nova para não colidir com uma tentativa anterior que deu erro.
    const referencia = `nf-${n.id}-${Date.now()}`;
    atualizar(n.id, { referencia, provedor: 'focusnfe', status: 'processando', mensagem: 'Enviando…' });
    let resultado;
    try {
      const api = focus.cliente(empresa, fetchNfse);
      resultado = await api.emitir(referencia, focus.montarPayload({ nota: n, empresa, cliente: buscarCliente(n.cliente_id) }));
    } catch (e) {
      resultado = { status: 'erro', mensagem: e.message };
    }
    atualizar(n.id, resultado);
    return buscar(n.id);
  });

  router.post('/api/notas/:id/consultar', async ({ params }) => {
    const n = buscar(params.id);
    if (n.provedor !== 'focusnfe') throw erro(409, 'Nota registrada manualmente; não há o que consultar');
    const empresa = lerEmpresa(db);
    const resultado = await focus.cliente(empresa, fetchNfse).consultar(n.referencia).catch((e) => { throw erro(502, e.message); });
    atualizar(n.id, resultado);
    return buscar(n.id);
  });

  // Emissão manual: a nota foi emitida no portal da prefeitura e aqui só registramos os dados.
  router.post('/api/notas/:id/registrar', ({ params, body }) => {
    const n = buscar(params.id);
    if (!EDITAVEIS.includes(n.status)) throw erro(409, 'Esta nota já foi registrada');
    atualizar(n.id, {
      provedor: 'manual',
      status: 'emitida',
      numero: v.texto(body.numero, 'numero', { obrigatorio: true, max: 30 }),
      codigo_verificacao: v.texto(body.codigo_verificacao, 'codigo_verificacao', { max: 60 }),
      data_emissao: v.data(body.data_emissao, 'data_emissao') || v.hoje(),
      url_pdf: v.texto(body.url_pdf, 'url_pdf', { max: 500 }),
      mensagem: null,
    });
    return buscar(n.id);
  });

  router.post('/api/notas/:id/cancelar', async ({ params, body }) => {
    const n = buscar(params.id);
    if (n.status !== 'emitida') throw erro(409, 'Somente notas emitidas podem ser canceladas');
    const justificativa = v.texto(body.justificativa, 'justificativa', { obrigatorio: true, max: 255 });
    if (justificativa.length < 15) throw erro(400, 'A justificativa deve ter pelo menos 15 caracteres');
    if (n.provedor === 'focusnfe') {
      const resultado = await focus.cliente(lerEmpresa(db), fetchNfse).cancelar(n.referencia, justificativa).catch((e) => { throw erro(502, e.message); });
      if (resultado.status !== 'cancelada') throw erro(409, resultado.mensagem || 'A prefeitura não confirmou o cancelamento');
    }
    atualizar(n.id, { status: 'cancelada', mensagem: `Cancelada: ${justificativa}` });
    return buscar(n.id);
  });
}

module.exports = { registrar, pendencias };
