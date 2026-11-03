'use strict';

// Conteúdo para redes sociais: quadro de demandas, agendamento e resultados.

const { erro } = require('../http');
const v = require('../validar');

const STATUS = ['ideia', 'producao', 'aprovacao', 'agendado', 'publicado'];
const FORMATOS = ['post', 'carrossel', 'reels', 'story', 'video', 'texto'];
const REDES = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'];
const METRICAS_POST = ['alcance', 'visualizacoes', 'curtidas', 'comentarios', 'compartilhamentos', 'salvos'];
const NUMEROS_PERFIL = ['seguidores', 'alcance', 'visualizacoes', 'interacoes', 'visitas', 'cliques'];
const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function hora(valor) {
  const s = v.texto(valor, 'hora', { max: 5 });
  if (s && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw erro(400, 'Hora deve estar no formato HH:MM');
  return s;
}

function lerRedes(valor) {
  if (valor === undefined || valor === null || valor === '') return [];
  if (!Array.isArray(valor)) throw erro(400, 'O campo "redes" deve ser uma lista');
  const redes = [...new Set(valor)];
  for (const r of redes) if (!REDES.includes(r)) throw erro(400, `Rede desconhecida: ${r}`);
  return redes;
}

function lerLegendasRede(valor) {
  if (!valor) return {};
  if (typeof valor !== 'object' || Array.isArray(valor)) throw erro(400, 'O campo "legendas_rede" é inválido');
  const out = {};
  for (const [rede, texto] of Object.entries(valor)) {
    if (!REDES.includes(rede)) throw erro(400, `Rede desconhecida: ${rede}`);
    const t = v.texto(texto, `legenda (${rede})`, { max: 5000 });
    if (t) out[rede] = t;
  }
  return out;
}

const interacoes = (m) => (m.curtidas || 0) + (m.comentarios || 0) + (m.compartilhamentos || 0) + (m.salvos || 0);

function registrar(router, db) {
  const SELECT_POST = `SELECT p.id, p.titulo, p.cliente_id, p.formato, p.status, p.redes, p.legenda, p.legendas_rede, p.data, p.hora,
      p.responsavel_id, p.arquivo_id, p.link, p.notas, p.ordem, p.criado_em,
      c.nome AS cliente_nome, u.nome AS responsavel_nome
    FROM posts p LEFT JOIN clientes c ON c.id = p.cliente_id LEFT JOIN usuarios u ON u.id = p.responsavel_id`;

  const montar = (p) => ({ ...p, redes: JSON.parse(p.redes || '[]'), legendas_rede: JSON.parse(p.legendas_rede || '{}'), tem_imagem: Boolean(p.arquivo_id) });

  const buscarPost = (id) => {
    const p = db.prepare(`${SELECT_POST} WHERE p.id = ?`).get(id);
    if (!p) throw erro(404, 'Post não encontrado');
    const post = montar(p);
    post.metricas = db.prepare('SELECT * FROM post_metricas WHERE post_id = ? ORDER BY rede').all(id);
    return post;
  };

  const lerPost = (b) => {
    const d = {
      titulo: v.texto(b.titulo, 'titulo', { obrigatorio: true, max: 200 }),
      cliente_id: v.inteiro(b.cliente_id, 'cliente_id'),
      formato: v.opcao(b.formato, 'formato', FORMATOS, { padrao: 'post' }),
      status: v.opcao(b.status, 'status', STATUS, { padrao: 'ideia' }),
      redes: JSON.stringify(lerRedes(b.redes)),
      legenda: v.texto(b.legenda, 'legenda', { max: 5000 }),
      legendas_rede: JSON.stringify(lerLegendasRede(b.legendas_rede)),
      data: v.data(b.data, 'data'),
      hora: hora(b.hora),
      responsavel_id: v.inteiro(b.responsavel_id, 'responsavel_id'),
      link: v.texto(b.link, 'link', { max: 500 }),
      notas: v.texto(b.notas, 'notas', { max: 2000 }),
    };
    if (d.status === 'agendado' && !d.data) throw erro(400, 'Para agendar, informe a data de publicação');
    return d;
  };
  const CAMPOS = ['titulo', 'cliente_id', 'formato', 'status', 'redes', 'legenda', 'legendas_rede', 'data', 'hora', 'responsavel_id', 'link', 'notas'];

  // Novo card vai para o fim da coluna.
  const proximaOrdem = (status) => (db.prepare('SELECT MAX(ordem) AS m FROM posts WHERE status = ?').get(status).m ?? 0) + 1;

  router.get('/api/posts', ({ query }) => {
    const where = [];
    const params = [];
    if (query.cliente_id) { where.push('p.cliente_id = ?'); params.push(Number(query.cliente_id)); }
    if (query.status) { where.push('p.status = ?'); params.push(v.opcao(query.status, 'status', STATUS)); }
    if (query.de) { where.push('p.data >= ?'); params.push(v.data(query.de, 'de')); }
    if (query.ate) { where.push('p.data <= ?'); params.push(v.data(query.ate, 'ate')); }
    if (query.busca) { where.push('(p.titulo LIKE ? OR p.legenda LIKE ? OR c.nome LIKE ?)'); params.push(...Array(3).fill(`%${query.busca}%`)); }
    // Publicados há muito tempo saem do quadro, mas continuam nos resultados.
    if (query.quadro === '1') where.push("(p.status <> 'publicado' OR COALESCE(p.data, date(p.criado_em)) >= date('now', '-30 days'))");
    return db.prepare(`${SELECT_POST} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.ordem, p.data IS NULL, p.data, p.hora, p.id LIMIT 2000`).all(...params).map(montar);
  });

  router.get('/api/posts/:id', ({ params }) => buscarPost(params.id));

  router.post('/api/posts', (ctx) => {
    const d = lerPost(ctx.body);
    const r = db.prepare(`INSERT INTO posts (${CAMPOS.join(', ')}, ordem) VALUES (${CAMPOS.map(() => '?').join(', ')}, ?)`)
      .run(...CAMPOS.map((c) => d[c]), proximaOrdem(d.status));
    ctx.status = 201;
    return buscarPost(r.lastInsertRowid);
  });

  router.put('/api/posts/:id', ({ params, body }) => {
    const atual = buscarPost(params.id);
    const d = lerPost(body);
    const ordem = d.status === atual.status ? atual.ordem : proximaOrdem(d.status);
    db.prepare(`UPDATE posts SET ${CAMPOS.map((c) => `${c} = ?`).join(', ')}, ordem = ? WHERE id = ?`).run(...CAMPOS.map((c) => d[c]), ordem, params.id);
    return buscarPost(params.id);
  });

  // Mover o card no quadro (arrastar entre colunas ou reordenar).
  router.post('/api/posts/:id/mover', ({ params, body }) => {
    const atual = buscarPost(params.id);
    const status = v.opcao(body.status, 'status', STATUS, { obrigatorio: true });
    if (status === 'agendado' && !atual.data) throw erro(400, 'Defina a data de publicação antes de agendar');
    const ordem = v.numero(body.ordem, 'ordem') ?? proximaOrdem(status);
    db.prepare('UPDATE posts SET status = ?, ordem = ? WHERE id = ?').run(status, ordem, params.id);
    return buscarPost(params.id);
  });

  router.post('/api/posts/:id/duplicar', (ctx) => {
    const p = buscarPost(ctx.params.id);
    const r = db.prepare(`INSERT INTO posts (titulo, cliente_id, formato, status, redes, legenda, legendas_rede, responsavel_id, notas, ordem)
      VALUES (?, ?, ?, 'ideia', ?, ?, ?, ?, ?, ?)`).run(`${p.titulo} (cópia)`.slice(0, 200), p.cliente_id, p.formato,
      JSON.stringify(p.redes), p.legenda, JSON.stringify(p.legendas_rede), p.responsavel_id, p.notas, proximaOrdem('ideia'));
    ctx.status = 201;
    return buscarPost(r.lastInsertRowid);
  });

  router.delete('/api/posts/:id', ({ params }) => {
    const p = buscarPost(params.id);
    db.prepare('DELETE FROM posts WHERE id = ?').run(params.id);
    if (p.arquivo_id) db.prepare('DELETE FROM arquivos WHERE id = ?').run(p.arquivo_id);
  });

  // ---------- Imagem do post (capa) ----------
  router.put('/api/posts/:id/imagem', ({ params, body }) => {
    const p = buscarPost(params.id);
    const m = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.arquivo || ''));
    if (!m || !TIPOS_IMAGEM.includes(m[1])) throw erro(400, 'Envie uma imagem JPG, PNG, WEBP ou GIF');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > 6 * 1024 * 1024) throw erro(413, 'Imagem muito grande (máx. 6 MB)');
    const nome = v.texto(body.nome, 'nome', { max: 200 }) || 'imagem';
    const r = db.prepare('INSERT INTO arquivos (nome, tipo, tamanho, conteudo) VALUES (?, ?, ?, ?)').run(nome, m[1], bytes.length, bytes);
    db.prepare('UPDATE posts SET arquivo_id = ? WHERE id = ?').run(r.lastInsertRowid, params.id);
    if (p.arquivo_id) db.prepare('DELETE FROM arquivos WHERE id = ?').run(p.arquivo_id);
    return buscarPost(params.id);
  }, { limiteCorpo: 9 * 1024 * 1024 });

  router.delete('/api/posts/:id/imagem', ({ params }) => {
    const p = buscarPost(params.id);
    db.prepare('UPDATE posts SET arquivo_id = NULL WHERE id = ?').run(params.id);
    if (p.arquivo_id) db.prepare('DELETE FROM arquivos WHERE id = ?').run(p.arquivo_id);
    return buscarPost(params.id);
  });

  router.get('/api/posts/:id/imagem', (ctx) => {
    const p = buscarPost(ctx.params.id);
    const a = p.arquivo_id && db.prepare('SELECT * FROM arquivos WHERE id = ?').get(p.arquivo_id);
    if (!a) throw erro(404, 'Post sem imagem');
    ctx.bruto = { tipo: a.tipo, corpo: Buffer.from(a.conteudo) };
  });

  // ---------- Resultado do post por rede ----------
  router.put('/api/posts/:id/metricas', ({ params, body }) => {
    buscarPost(params.id);
    const lista = Array.isArray(body.metricas) ? body.metricas : [];
    const salvar = db.prepare(`INSERT INTO post_metricas (post_id, rede, ${METRICAS_POST.join(', ')}) VALUES (?, ?, ${METRICAS_POST.map(() => '?').join(', ')})
      ON CONFLICT(post_id, rede) DO UPDATE SET ${METRICAS_POST.map((c) => `${c} = excluded.${c}`).join(', ')}`);
    for (const m of lista) {
      const rede = v.opcao(m.rede, 'rede', REDES, { obrigatorio: true });
      salvar.run(params.id, rede, ...METRICAS_POST.map((c) => v.inteiro(m[c], c, { min: 0, padrao: 0 })));
    }
    return buscarPost(params.id);
  });

  // ---------- Perfis nas redes ----------
  const buscarPerfil = (id) => {
    const p = db.prepare(`SELECT p.*, c.nome AS cliente_nome,
        (SELECT seguidores FROM perfil_numeros n WHERE n.perfil_id = p.id AND n.seguidores IS NOT NULL ORDER BY n.data DESC LIMIT 1) AS seguidores,
        (SELECT MAX(data) FROM perfil_numeros n WHERE n.perfil_id = p.id) AS atualizado_em
      FROM perfis_sociais p LEFT JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?`).get(id);
    if (!p) throw erro(404, 'Perfil não encontrado');
    return p;
  };
  const lerPerfil = (b) => ({
    cliente_id: v.inteiro(b.cliente_id, 'cliente_id'),
    rede: v.opcao(b.rede, 'rede', REDES, { obrigatorio: true }),
    usuario: v.texto(b.usuario, 'usuario', { obrigatorio: true, max: 100 }),
  });

  router.get('/api/perfis', () => db.prepare('SELECT id FROM perfis_sociais ORDER BY cliente_id IS NOT NULL, cliente_id, rede, id').all().map((p) => buscarPerfil(p.id)));
  router.post('/api/perfis', (ctx) => {
    const d = lerPerfil(ctx.body);
    const r = db.prepare('INSERT INTO perfis_sociais (cliente_id, rede, usuario) VALUES (?, ?, ?)').run(d.cliente_id, d.rede, d.usuario);
    ctx.status = 201;
    return buscarPerfil(r.lastInsertRowid);
  });
  router.put('/api/perfis/:id', ({ params, body }) => {
    buscarPerfil(params.id);
    const d = lerPerfil(body);
    db.prepare('UPDATE perfis_sociais SET cliente_id = ?, rede = ?, usuario = ? WHERE id = ?').run(d.cliente_id, d.rede, d.usuario, params.id);
    return buscarPerfil(params.id);
  });
  router.delete('/api/perfis/:id', ({ params }) => {
    buscarPerfil(params.id);
    db.prepare('DELETE FROM perfis_sociais WHERE id = ?').run(params.id);
  });

  // Números do perfil numa data (um lançamento por dia; lançar de novo substitui).
  router.post('/api/perfis/:id/numeros', (ctx) => {
    buscarPerfil(ctx.params.id);
    const b = ctx.body;
    const data = v.data(b.data, 'data', { obrigatorio: true });
    const valores = NUMEROS_PERFIL.map((c) => v.inteiro(b[c], c, { min: 0 }));
    if (valores.every((x) => x === null)) throw erro(400, 'Informe pelo menos um número');
    db.prepare(`INSERT INTO perfil_numeros (perfil_id, data, ${NUMEROS_PERFIL.join(', ')}) VALUES (?, ?, ${NUMEROS_PERFIL.map(() => '?').join(', ')})
      ON CONFLICT(perfil_id, data) DO UPDATE SET ${NUMEROS_PERFIL.map((c) => `${c} = excluded.${c}`).join(', ')}`)
      .run(ctx.params.id, data, ...valores);
    ctx.status = 201;
    return buscarPerfil(ctx.params.id);
  });
  router.delete('/api/perfis/:id/numeros/:data', ({ params }) => {
    db.prepare('DELETE FROM perfil_numeros WHERE perfil_id = ? AND data = ?').run(params.id, v.data(params.data, 'data'));
  });

  // Painel de resultados: totais do período comparados com o período anterior, evolução e melhores posts.
  router.get('/api/perfis/:id/painel', ({ params, query }) => {
    const perfil = buscarPerfil(params.id);
    const dias = Math.min(730, Math.max(7, Number(query.dias) || 30));
    const hoje = v.hoje();
    const inicio = v.somarDias(hoje, -(dias - 1));
    const inicioAnterior = v.somarDias(inicio, -dias);
    const somar = (de, ate) => db.prepare(`SELECT ${NUMEROS_PERFIL.filter((c) => c !== 'seguidores').map((c) => `SUM(${c}) AS ${c}`).join(', ')}, COUNT(*) AS qtd
      FROM perfil_numeros WHERE perfil_id = ? AND data BETWEEN ? AND ?`).get(params.id, de, ate);
    const seguidoresAte = (data) => db.prepare(`SELECT seguidores FROM perfil_numeros WHERE perfil_id = ? AND data <= ? AND seguidores IS NOT NULL
      ORDER BY data DESC LIMIT 1`).get(params.id, data)?.seguidores ?? null;

    const atual = { ...somar(inicio, hoje), seguidores: seguidoresAte(hoje) };
    const anterior = { ...somar(inicioAnterior, v.somarDias(inicio, -1)), seguidores: seguidoresAte(v.somarDias(inicio, -1)) };
    const serie = db.prepare(`SELECT data, ${NUMEROS_PERFIL.join(', ')} FROM perfil_numeros WHERE perfil_id = ? AND data BETWEEN ? AND ? ORDER BY data`)
      .all(params.id, inicio, hoje);

    const posts = db.prepare(`SELECT p.id, p.titulo, p.formato, p.data, p.arquivo_id, m.*
      FROM posts p JOIN post_metricas m ON m.post_id = p.id AND m.rede = ?
      WHERE p.cliente_id IS ? AND (p.data IS NULL OR p.data BETWEEN ? AND ?)`).all(perfil.rede, perfil.cliente_id, inicio, hoje)
      .map((p) => ({ ...p, tem_imagem: Boolean(p.arquivo_id), interacoes: interacoes(p) }));

    return { perfil, dias, inicio, fim: hoje, atual, anterior, serie, posts };
  });
}

module.exports = { registrar, interacoes };
