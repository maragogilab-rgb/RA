'use strict';

const { erro } = require('../http');
const { transacao } = require('../db');
const v = require('../validar');

function registrar(router, db) {
  const buscar = (id) => {
    const r = db.prepare('SELECT ct.*, c.nome AS cliente_nome FROM contratos ct JOIN clientes c ON c.id = ct.cliente_id WHERE ct.id = ?').get(id);
    if (!r) throw erro(404, 'Contrato não encontrado');
    return r;
  };
  const CAMPOS = ['cliente_id', 'descricao', 'valor', 'dia_vencimento', 'inicio', 'fim', 'ativo', 'observacoes', 'area'];
  const ler = (b) => {
    const d = {
      cliente_id: v.inteiro(b.cliente_id, 'cliente_id', { obrigatorio: true }),
      descricao: v.texto(b.descricao, 'descricao', { obrigatorio: true, max: 300 }),
      valor: v.centavos(b.valor, 'valor', { obrigatorio: true }),
      dia_vencimento: v.inteiro(b.dia_vencimento, 'dia_vencimento', { min: 1, padrao: 10 }),
      inicio: v.data(b.inicio, 'inicio') || v.hoje(),
      fim: v.data(b.fim, 'fim'),
      ativo: v.booleano(b.ativo),
      observacoes: v.texto(b.observacoes, 'observacoes', { max: 2000 }),
      area: v.texto(b.area, 'area', { max: 100 }),
    };
    if (d.dia_vencimento > 28) throw erro(400, 'O dia de vencimento deve ser entre 1 e 28');
    if (d.valor <= 0) throw erro(400, 'O valor deve ser maior que zero');
    if (d.fim && d.fim < d.inicio) throw erro(400, 'O fim deve ser posterior ao início');
    if (!db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(d.cliente_id)) throw erro(400, 'Cliente não encontrado');
    return d;
  };

  router.get('/api/contratos', ({ query }) => {
    const competencia = v.hoje().slice(0, 7);
    const where = [];
    const params = [competencia];
    if (query.ativo === '0' || query.ativo === '1') { where.push('ct.ativo = ?'); params.push(Number(query.ativo)); }
    return db.prepare(`
      SELECT ct.*, c.nome AS cliente_nome,
        (SELECT MAX(competencia) FROM lancamentos l WHERE l.contrato_id = ct.id) AS ultima_competencia,
        EXISTS (SELECT 1 FROM lancamentos l WHERE l.contrato_id = ct.id AND l.competencia = ?) AS cobrado_mes_atual
      FROM contratos ct JOIN clientes c ON c.id = ct.cliente_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ct.ativo DESC, c.nome`).all(...params);
  });

  router.get('/api/contratos/:id', ({ params }) => buscar(params.id));

  router.post('/api/contratos', (ctx) => {
    const d = ler(ctx.body);
    const r = db.prepare(`INSERT INTO contratos (${CAMPOS.join(', ')}) VALUES (${CAMPOS.map(() => '?').join(', ')})`).run(...CAMPOS.map((c) => d[c]));
    ctx.status = 201;
    return buscar(r.lastInsertRowid);
  });

  router.put('/api/contratos/:id', ({ params, body }) => {
    buscar(params.id);
    const d = ler(body);
    db.prepare(`UPDATE contratos SET ${CAMPOS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...CAMPOS.map((c) => d[c]), params.id);
    return buscar(params.id);
  });

  // Gera as cobranças de uma competência (AAAA-MM) para todos os contratos vigentes.
  // Idempotente: contratos já cobrados naquele mês são ignorados.
  router.post('/api/contratos/gerar-cobrancas', (ctx) => {
    const competencia = String(ctx.body.competencia || v.hoje().slice(0, 7));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) throw erro(400, 'Competência deve estar no formato AAAA-MM');
    const inicioMes = `${competencia}-01`;
    const proximoMes = v.somarMeses(inicioMes, 1);
    const vigentes = db.prepare(`
      SELECT * FROM contratos WHERE ativo = 1 AND inicio < ? AND (fim IS NULL OR fim >= ?)
        AND NOT EXISTS (SELECT 1 FROM lancamentos l WHERE l.contrato_id = contratos.id AND l.competencia = ?)`)
      .all(proximoMes, inicioMes, competencia);
    const [a, m] = competencia.split('-');
    const ins = db.prepare(`INSERT INTO lancamentos (tipo, descricao, categoria, valor, vencimento, origem, cliente_id, contrato_id, competencia, usuario_id, area)
      VALUES ('receber', ?, 'Fee mensal', ?, ?, 'contrato', ?, ?, ?, ?, ?)`);
    transacao(db, () => {
      for (const c of vigentes) {
        ins.run(`${c.descricao} - ${m}/${a}`, c.valor, `${competencia}-${String(c.dia_vencimento).padStart(2, '0')}`, c.cliente_id, c.id, competencia, ctx.usuario.id, c.area);
      }
    });
    return { competencia, geradas: vigentes.length, total: vigentes.reduce((s, c) => s + c.valor, 0) };
  });
}

module.exports = { registrar };
