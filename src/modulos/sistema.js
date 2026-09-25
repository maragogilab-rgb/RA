'use strict';

const { erro } = require('../http');
const auth = require('../auth');
const v = require('../validar');

const exigirAdmin = (ctx) => {
  if (ctx.usuario.papel !== 'admin') throw erro(403, 'Acesso restrito a administradores');
};

// Limita tentativas de login por IP para dificultar ataques de força bruta.
const tentativas = new Map();
const MAX_TENTATIVAS = 10;
const JANELA_MS = 15 * 60 * 1000;

function verificarLimite(ip) {
  const agora = Date.now();
  const t = tentativas.get(ip);
  if (t && agora - t.inicio > JANELA_MS) tentativas.delete(ip);
  const atual = tentativas.get(ip);
  if (atual && atual.n >= MAX_TENTATIVAS) throw erro(429, 'Muitas tentativas de login. Aguarde alguns minutos.');
}

function registrarFalha(ip) {
  const t = tentativas.get(ip) || { n: 0, inicio: Date.now() };
  t.n += 1;
  tentativas.set(ip, t);
}

const CAMPOS_EMPRESA = ['nome', 'cnpj', 'telefone', 'email', 'endereco'];

function registrar(router, db) {
  // ---------- Autenticação ----------
  router.post('/api/login', (ctx) => {
    const ip = ctx.req.socket.remoteAddress || '?';
    verificarLimite(ip);
    const email = v.texto(ctx.body.email, 'email', { obrigatorio: true });
    const senha = v.texto(ctx.body.senha, 'senha', { obrigatorio: true, max: 200 });
    const u = db.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(email);
    if (!u || !auth.verificarSenha(senha, u.senha_hash)) {
      registrarFalha(ip);
      throw erro(401, 'E-mail ou senha inválidos');
    }
    tentativas.delete(ip);
    const s = auth.criarSessao(db, u.id);
    ctx.cookies.push(`sessao=${s.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${s.maxAge}${ctx.seguro ? '; Secure' : ''}`);
    return { id: u.id, nome: u.nome, email: u.email, papel: u.papel };
  }, { publica: true });

  router.post('/api/logout', (ctx) => {
    auth.encerrarSessao(db, ctx.token);
    ctx.cookies.push('sessao=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  }, { publica: true });

  router.get('/api/me', (ctx) => ctx.usuario);

  router.post('/api/me/senha', (ctx) => {
    const atual = v.texto(ctx.body.senha_atual, 'senha_atual', { obrigatorio: true, max: 200 });
    const nova = v.texto(ctx.body.nova_senha, 'nova_senha', { obrigatorio: true, max: 200 });
    if (nova.length < 8) throw erro(400, 'A nova senha deve ter pelo menos 8 caracteres');
    const u = db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(ctx.usuario.id);
    if (!auth.verificarSenha(atual, u.senha_hash)) throw erro(400, 'Senha atual incorreta');
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(auth.hashSenha(nova), ctx.usuario.id);
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND token != ?').run(ctx.usuario.id, ctx.token);
  });

  // ---------- Usuários (somente admin) ----------
  const buscarUsuario = (id) => {
    const u = db.prepare('SELECT id, nome, email, papel, ativo, criado_em FROM usuarios WHERE id = ?').get(id);
    if (!u) throw erro(404, 'Usuário não encontrado');
    return u;
  };
  const traduzirEmail = (fn) => {
    try { return fn(); } catch (e) {
      if (/UNIQUE constraint failed: usuarios.email/.test(e.message)) throw erro(409, 'Já existe um usuário com este e-mail');
      throw e;
    }
  };

  router.get('/api/usuarios', (ctx) => {
    exigirAdmin(ctx);
    return db.prepare('SELECT id, nome, email, papel, ativo, criado_em FROM usuarios ORDER BY nome').all();
  });

  router.post('/api/usuarios', (ctx) => {
    exigirAdmin(ctx);
    const b = ctx.body;
    const senha = v.texto(b.senha, 'senha', { obrigatorio: true, max: 200 });
    if (senha.length < 8) throw erro(400, 'A senha deve ter pelo menos 8 caracteres');
    const r = traduzirEmail(() => db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, ativo) VALUES (?, ?, ?, ?, ?)').run(
      v.texto(b.nome, 'nome', { obrigatorio: true, max: 200 }),
      v.texto(b.email, 'email', { obrigatorio: true, max: 200 }),
      auth.hashSenha(senha),
      v.opcao(b.papel, 'papel', ['admin', 'usuario'], { padrao: 'usuario' }),
      v.booleano(b.ativo),
    ));
    ctx.status = 201;
    return buscarUsuario(r.lastInsertRowid);
  });

  router.put('/api/usuarios/:id', (ctx) => {
    exigirAdmin(ctx);
    const id = Number(ctx.params.id);
    buscarUsuario(id);
    const b = ctx.body;
    const papel = v.opcao(b.papel, 'papel', ['admin', 'usuario'], { padrao: 'usuario' });
    const ativo = v.booleano(b.ativo);
    if (id === ctx.usuario.id && (papel !== 'admin' || !ativo)) {
      throw erro(400, 'Você não pode remover seu próprio acesso de administrador');
    }
    traduzirEmail(() => db.prepare('UPDATE usuarios SET nome = ?, email = ?, papel = ?, ativo = ? WHERE id = ?').run(
      v.texto(b.nome, 'nome', { obrigatorio: true, max: 200 }),
      v.texto(b.email, 'email', { obrigatorio: true, max: 200 }),
      papel, ativo, id,
    ));
    const senha = v.texto(b.senha, 'senha', { max: 200 });
    if (senha) {
      if (senha.length < 8) throw erro(400, 'A senha deve ter pelo menos 8 caracteres');
      db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(auth.hashSenha(senha), id);
    }
    if (!ativo || senha) db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(id);
    return buscarUsuario(id);
  });

  // ---------- Dados da empresa ----------
  const lerEmpresa = () => {
    const out = Object.fromEntries(CAMPOS_EMPRESA.map((c) => [c, '']));
    for (const r of db.prepare("SELECT chave, valor FROM configuracoes WHERE chave LIKE 'empresa.%'").all()) {
      out[r.chave.slice(8)] = r.valor;
    }
    return out;
  };

  router.get('/api/empresa', () => lerEmpresa());

  router.put('/api/empresa', (ctx) => {
    exigirAdmin(ctx);
    const up = db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');
    for (const c of CAMPOS_EMPRESA) up.run(`empresa.${c}`, v.texto(ctx.body[c], c, { max: 300 }) || '');
    return lerEmpresa();
  });

  // ---------- Painel ----------
  router.get('/api/dashboard', () => {
    const hoje = v.hoje();
    const inicioMes = `${hoje.slice(0, 7)}-01`;
    const um = (sql, ...p) => Object.values(db.prepare(sql).get(...p))[0] || 0;
    const inicioSerie = v.somarMeses(inicioMes, -5);
    return {
      vendas_mes: um("SELECT SUM(total) FROM vendas WHERE status = 'confirmada' AND data >= ?", inicioMes),
      qtd_vendas_mes: um("SELECT COUNT(*) FROM vendas WHERE status = 'confirmada' AND data >= ?", inicioMes),
      a_receber: um("SELECT SUM(valor) FROM lancamentos WHERE tipo = 'receber' AND status = 'aberto'"),
      a_pagar: um("SELECT SUM(valor) FROM lancamentos WHERE tipo = 'pagar' AND status = 'aberto'"),
      receber_vencido: um("SELECT SUM(valor) FROM lancamentos WHERE tipo = 'receber' AND status = 'aberto' AND vencimento < ?", hoje),
      pagar_vencido: um("SELECT SUM(valor) FROM lancamentos WHERE tipo = 'pagar' AND status = 'aberto' AND vencimento < ?", hoje),
      saldo_mes: um(`SELECT SUM(CASE WHEN tipo = 'receber' THEN valor_pago ELSE -valor_pago END)
        FROM lancamentos WHERE status = 'pago' AND pago_em >= ?`, inicioMes),
      valor_estoque: um('SELECT SUM(estoque_atual * preco_custo) FROM produtos WHERE ativo = 1 AND estoque_atual > 0'),
      estoque_baixo: db.prepare(`SELECT id, nome, sku, unidade, estoque_atual, estoque_minimo FROM produtos
        WHERE ativo = 1 AND estoque_atual <= estoque_minimo ORDER BY estoque_atual - estoque_minimo LIMIT 10`).all(),
      vendas_por_mes: db.prepare(`SELECT substr(data, 1, 7) AS mes, SUM(total) AS total, COUNT(*) AS qtd
        FROM vendas WHERE status = 'confirmada' AND data >= ? GROUP BY mes ORDER BY mes`).all(inicioSerie),
      proximos_vencimentos: db.prepare(`SELECT l.id, l.tipo, l.descricao, l.valor, l.vencimento,
          COALESCE(c.nome, f.nome) AS pessoa
        FROM lancamentos l LEFT JOIN clientes c ON c.id = l.cliente_id LEFT JOIN fornecedores f ON f.id = l.fornecedor_id
        WHERE l.status = 'aberto' ORDER BY l.vencimento LIMIT 8`).all(),
    };
  });

  // ---------- Relatórios ----------
  const periodo = (query) => ({
    de: v.data(query.de, 'de') || `${v.hoje().slice(0, 7)}-01`,
    ate: v.data(query.ate, 'ate') || v.hoje(),
  });

  router.get('/api/relatorios/vendas-por-produto', ({ query }) => {
    const { de, ate } = periodo(query);
    return db.prepare(`
      SELECT p.id, p.sku, p.nome, p.unidade, SUM(i.quantidade) AS quantidade, SUM(i.subtotal) AS faturamento,
        SUM(i.quantidade * p.preco_custo) AS custo_estimado
      FROM venda_itens i JOIN vendas ve ON ve.id = i.venda_id JOIN produtos p ON p.id = i.produto_id
      WHERE ve.status = 'confirmada' AND ve.data BETWEEN ? AND ?
      GROUP BY p.id ORDER BY faturamento DESC`).all(de, ate)
      .map((r) => ({ ...r, custo_estimado: Math.round(r.custo_estimado), margem: r.faturamento - Math.round(r.custo_estimado) }));
  });

  router.get('/api/relatorios/vendas-por-cliente', ({ query }) => {
    const { de, ate } = periodo(query);
    return db.prepare(`
      SELECT c.id, c.nome, c.documento, COUNT(ve.id) AS qtd_vendas, SUM(ve.total) AS total,
        ROUND(AVG(ve.total)) AS ticket_medio, MAX(ve.data) AS ultima_compra
      FROM vendas ve JOIN clientes c ON c.id = ve.cliente_id
      WHERE ve.status = 'confirmada' AND ve.data BETWEEN ? AND ?
      GROUP BY c.id ORDER BY total DESC`).all(de, ate);
  });

  router.get('/api/relatorios/despesas-por-categoria', ({ query }) => {
    const { de, ate } = periodo(query);
    return db.prepare(`
      SELECT COALESCE(categoria, 'Sem categoria') AS categoria, tipo, COUNT(*) AS qtd, SUM(valor_pago) AS total
      FROM lancamentos WHERE status = 'pago' AND pago_em BETWEEN ? AND ?
      GROUP BY categoria, tipo ORDER BY tipo, total DESC`).all(de, ate);
  });
}

module.exports = { registrar };
