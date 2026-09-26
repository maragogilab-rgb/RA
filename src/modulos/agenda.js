'use strict';

const crypto = require('node:crypto');
const { erro } = require('../http');
const v = require('../validar');

const PRIORIDADES = ['alta', 'media', 'baixa'];

function hora(valor) {
  const s = v.texto(valor, 'hora', { max: 5 });
  if (s && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw erro(400, 'Hora deve estar no formato HH:MM');
  return s;
}

// Texto escapado para o formato iCalendar (.ics).
const ics = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);

function registrar(router, db) {
  // ---------- Eventos ----------
  const buscarEvento = (id) => {
    const e = db.prepare(`SELECT e.*, COALESCE(c.nome, e.cliente_texto) AS cliente_nome, p.titulo AS projeto_titulo
      FROM eventos e LEFT JOIN clientes c ON c.id = e.cliente_id LEFT JOIN projetos p ON p.id = e.projeto_id WHERE e.id = ?`).get(id);
    if (!e) throw erro(404, 'Evento não encontrado');
    return e;
  };
  const lerEvento = (b) => ({
    titulo: v.texto(b.titulo, 'titulo', { obrigatorio: true, max: 200 }),
    tipo: v.texto(b.tipo, 'tipo', { max: 60 }),
    data: v.data(b.data, 'data', { obrigatorio: true }),
    hora: hora(b.hora),
    local: v.texto(b.local, 'local', { max: 200 }),
    cliente_id: v.inteiro(b.cliente_id, 'cliente_id'),
    cliente_texto: v.texto(b.cliente_texto, 'cliente_texto', { max: 200 }),
    projeto_id: v.inteiro(b.projeto_id, 'projeto_id'),
    notas: v.texto(b.notas, 'notas', { max: 2000 }),
  });
  const CAMPOS_EV = ['titulo', 'tipo', 'data', 'hora', 'local', 'cliente_id', 'cliente_texto', 'projeto_id', 'notas'];

  router.get('/api/eventos', ({ query }) => {
    const where = [];
    const params = [];
    if (query.de) { where.push('e.data >= ?'); params.push(v.data(query.de, 'de')); }
    if (query.ate) { where.push('e.data <= ?'); params.push(v.data(query.ate, 'ate')); }
    if (query.projeto_id) { where.push('e.projeto_id = ?'); params.push(Number(query.projeto_id)); }
    if (query.busca) { where.push('(e.titulo LIKE ? OR e.local LIKE ? OR c.nome LIKE ? OR e.cliente_texto LIKE ?)'); params.push(...Array(4).fill(`%${query.busca}%`)); }
    return db.prepare(`SELECT e.*, COALESCE(c.nome, e.cliente_texto) AS cliente_nome, p.titulo AS projeto_titulo
      FROM eventos e LEFT JOIN clientes c ON c.id = e.cliente_id LEFT JOIN projetos p ON p.id = e.projeto_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.data, COALESCE(e.hora, '99:99') LIMIT 1000`).all(...params);
  });
  router.get('/api/eventos/:id', ({ params }) => buscarEvento(params.id));
  router.post('/api/eventos', (ctx) => {
    const d = lerEvento(ctx.body);
    const r = db.prepare(`INSERT INTO eventos (${CAMPOS_EV.join(', ')}) VALUES (${CAMPOS_EV.map(() => '?').join(', ')})`).run(...CAMPOS_EV.map((c) => d[c]));
    ctx.status = 201;
    return buscarEvento(r.lastInsertRowid);
  });
  router.put('/api/eventos/:id', ({ params, body }) => {
    buscarEvento(params.id);
    const d = lerEvento(body);
    db.prepare(`UPDATE eventos SET ${CAMPOS_EV.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...CAMPOS_EV.map((c) => d[c]), params.id);
    return buscarEvento(params.id);
  });
  router.delete('/api/eventos/:id', ({ params }) => {
    buscarEvento(params.id);
    db.prepare('DELETE FROM eventos WHERE id = ?').run(params.id);
  });

  // ---------- Assinatura da agenda (Google Agenda, Apple, Outlook) ----------
  const tokenAgenda = (renovar = false) => {
    let t = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'agenda.token'").get()?.valor;
    if (!t || renovar) {
      t = crypto.randomBytes(24).toString('hex');
      db.prepare("INSERT INTO configuracoes (chave, valor) VALUES ('agenda.token', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run(t);
    }
    return t;
  };
  router.get('/api/agenda/assinatura', () => ({ caminho: `/api/publico/agenda/${tokenAgenda()}.ics` }));
  router.post('/api/agenda/assinatura', (ctx) => {
    if (ctx.usuario.papel !== 'admin') throw erro(403, 'Acesso restrito a administradores');
    return { caminho: `/api/publico/agenda/${tokenAgenda(true)}.ics` };
  });
  router.get('/api/publico/agenda/:arquivo', (ctx) => {
    const token = String(ctx.params.arquivo).replace(/\.ics$/, '');
    const certo = tokenAgenda();
    if (token.length !== certo.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(certo))) throw erro(404, 'Agenda não encontrada');
    const eventos = db.prepare(`SELECT e.*, COALESCE(c.nome, e.cliente_texto) AS cliente_nome FROM eventos e
      LEFT JOIN clientes c ON c.id = e.cliente_id WHERE e.data >= date('now', '-180 days') ORDER BY e.data`).all();
    const agora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ERP Maragogi Lab//Agenda//PT', 'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:Maragogi Lab', 'X-WR-TIMEZONE:America/Maceio'];
    for (const e of eventos) {
      const dia = e.data.replace(/-/g, '');
      linhas.push('BEGIN:VEVENT', `UID:evento-${e.id}@erp-maragogi-lab`, `DTSTAMP:${agora}`);
      if (e.hora) {
        const [hh, mm] = e.hora.split(':');
        const fim = `${String((Number(hh) + 2) % 24).padStart(2, '0')}${mm}`;
        linhas.push(`DTSTART;TZID=America/Maceio:${dia}T${hh}${mm}00`, `DTEND;TZID=America/Maceio:${dia}T${Number(hh) >= 22 ? `${hh}59` : fim}00`);
      } else {
        const prox = new Date(`${e.data}T12:00:00Z`);
        prox.setUTCDate(prox.getUTCDate() + 1);
        linhas.push(`DTSTART;VALUE=DATE:${dia}`, `DTEND;VALUE=DATE:${prox.toISOString().slice(0, 10).replace(/-/g, '')}`);
      }
      linhas.push(`SUMMARY:${ics(e.titulo)}`);
      if (e.local) linhas.push(`LOCATION:${ics(e.local)}`);
      const desc = [e.tipo, e.cliente_nome && `Cliente: ${e.cliente_nome}`, e.notas].filter(Boolean).join('\n');
      if (desc) linhas.push(`DESCRIPTION:${ics(desc)}`);
      linhas.push('END:VEVENT');
    }
    linhas.push('END:VCALENDAR');
    ctx.bruto = { tipo: 'text/calendar; charset=utf-8', corpo: `${linhas.join('\r\n')}\r\n` };
  }, { publica: true });

  // ---------- Tarefas ----------
  const buscarTarefa = (id) => {
    const t = db.prepare(`SELECT t.*, u.nome AS responsavel_nome, p.titulo AS projeto_titulo, c.nome AS cliente_nome
      FROM tarefas t LEFT JOIN usuarios u ON u.id = t.responsavel_id LEFT JOIN projetos p ON p.id = t.projeto_id
      LEFT JOIN clientes c ON c.id = t.cliente_id WHERE t.id = ?`).get(id);
    if (!t) throw erro(404, 'Tarefa não encontrada');
    return t;
  };
  const lerTarefa = (b) => ({
    titulo: v.texto(b.titulo, 'titulo', { obrigatorio: true, max: 300 }),
    prazo: v.data(b.prazo, 'prazo'),
    prioridade: v.opcao(b.prioridade, 'prioridade', PRIORIDADES, { padrao: 'media' }),
    responsavel_id: v.inteiro(b.responsavel_id, 'responsavel_id'),
    projeto_id: v.inteiro(b.projeto_id, 'projeto_id'),
    cliente_id: v.inteiro(b.cliente_id, 'cliente_id'),
  });
  const CAMPOS_T = ['titulo', 'prazo', 'prioridade', 'responsavel_id', 'projeto_id', 'cliente_id'];

  router.get('/api/tarefas', ({ query, usuario }) => {
    const where = [];
    const params = [];
    if (query.feito === '0' || query.feito === '1') { where.push('t.feito = ?'); params.push(Number(query.feito)); }
    if (query.responsavel === 'eu') { where.push('t.responsavel_id = ?'); params.push(usuario.id); }
    if (query.projeto_id) { where.push('t.projeto_id = ?'); params.push(Number(query.projeto_id)); }
    return db.prepare(`SELECT t.*, u.nome AS responsavel_nome, p.titulo AS projeto_titulo, c.nome AS cliente_nome
      FROM tarefas t LEFT JOIN usuarios u ON u.id = t.responsavel_id LEFT JOIN projetos p ON p.id = t.projeto_id
      LEFT JOIN clientes c ON c.id = t.cliente_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY t.feito, t.prazo IS NULL, t.prazo, CASE t.prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, t.id DESC
      LIMIT 1000`).all(...params);
  });
  router.post('/api/tarefas', (ctx) => {
    const d = lerTarefa(ctx.body);
    const r = db.prepare(`INSERT INTO tarefas (${CAMPOS_T.join(', ')}) VALUES (${CAMPOS_T.map(() => '?').join(', ')})`).run(...CAMPOS_T.map((c) => d[c]));
    ctx.status = 201;
    return buscarTarefa(r.lastInsertRowid);
  });
  router.put('/api/tarefas/:id', ({ params, body }) => {
    buscarTarefa(params.id);
    const d = lerTarefa(body);
    db.prepare(`UPDATE tarefas SET ${CAMPOS_T.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...CAMPOS_T.map((c) => d[c]), params.id);
    return buscarTarefa(params.id);
  });
  router.post('/api/tarefas/:id/feito', ({ params, body }) => {
    buscarTarefa(params.id);
    const feito = v.booleano(body.feito);
    db.prepare('UPDATE tarefas SET feito = ?, feito_em = ? WHERE id = ?').run(feito, feito ? v.hoje() : null, params.id);
    return buscarTarefa(params.id);
  });
  router.delete('/api/tarefas/:id', ({ params }) => {
    buscarTarefa(params.id);
    db.prepare('DELETE FROM tarefas WHERE id = ?').run(params.id);
  });
}

module.exports = { registrar };
