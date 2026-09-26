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

// Dados da empresa (prestador do serviço na NFS-e) e configuração da emissão.
const CAMPOS_EMPRESA = ['nome', 'razao_social', 'cnpj', 'inscricao_municipal', 'regime_tributario', 'telefone', 'email',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'codigo_municipio',
  'aliquota_iss', 'item_lista_servico', 'codigo_tributario_municipio', 'cnae',
  'nfse_provedor', 'nfse_ambiente', 'nfse_token', 'endereco'];
const CAMPO_SECRETO = 'nfse_token';

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
  // O token da API de NFS-e nunca é devolvido; a interface só sabe se ele está configurado.
  const publicarEmpresa = () => {
    const e = lerEmpresa(db);
    const { [CAMPO_SECRETO]: token, ...resto } = e;
    return { ...resto, nfse_token_configurado: Boolean(token) };
  };

  router.get('/api/empresa', () => publicarEmpresa());

  router.put('/api/empresa', (ctx) => {
    exigirAdmin(ctx);
    const b = ctx.body;
    const cnpj = v.texto(b.cnpj, 'cnpj', { max: 30 });
    if (cnpj && !v.documentoValido(cnpj)) throw erro(400, 'CNPJ da empresa inválido');
    if (b.codigo_municipio && v.soDigitos(b.codigo_municipio).length !== 7) throw erro(400, 'Código IBGE do município deve ter 7 dígitos');
    v.opcao(b.regime_tributario, 'regime_tributario', ['simples', 'mei', 'presumido', 'real']);
    v.opcao(b.nfse_provedor, 'nfse_provedor', ['manual', 'focusnfe']);
    v.opcao(b.nfse_ambiente, 'nfse_ambiente', ['homologacao', 'producao']);
    v.numero(b.aliquota_iss, 'aliquota_iss', { min: 0 });
    const up = db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');
    for (const c of CAMPOS_EMPRESA) {
      // Token em branco significa "manter o atual".
      if (c === CAMPO_SECRETO && !b[c]) continue;
      if (c === 'endereco' && b[c] === undefined) continue;
      up.run(`empresa.${c}`, v.texto(b[c], c, { max: 500 }) || '');
    }
    return publicarEmpresa();
  });

  // ---------- Painel ----------
  router.get('/api/dashboard', () => {
    const hoje = v.hoje();
    const inicioMes = `${hoje.slice(0, 7)}-01`;
    const um = (sql, ...p) => Object.values(db.prepare(sql).get(...p))[0] || 0;
    const inicioSerie = v.somarMeses(inicioMes, -5);
    const competencia = hoje.slice(0, 7);
    return {
      recebido_mes: um("SELECT SUM(valor_pago) FROM lancamentos WHERE tipo = 'receber' AND status = 'pago' AND pago_em >= ?", inicioMes),
      faturado_mes: um("SELECT SUM(valor) FROM lancamentos WHERE tipo = 'receber' AND status != 'cancelado' AND vencimento BETWEEN ? AND ?", inicioMes, `${competencia}-31`),
      saldo_mes: um(`SELECT SUM(CASE WHEN tipo = 'receber' THEN valor_pago ELSE -valor_pago END)
        FROM lancamentos WHERE status = 'pago' AND pago_em >= ?`, inicioMes),
      a_receber: um("SELECT SUM(valor) FROM lancamentos WHERE tipo = 'receber' AND status = 'aberto'"),
      a_pagar: um("SELECT SUM(valor) FROM lancamentos WHERE tipo = 'pagar' AND status = 'aberto'"),
      receber_vencido: um("SELECT SUM(valor) FROM lancamentos WHERE tipo = 'receber' AND status = 'aberto' AND vencimento < ?", hoje),
      pagar_vencido: um("SELECT SUM(valor) FROM lancamentos WHERE tipo = 'pagar' AND status = 'aberto' AND vencimento < ?", hoje),
      receita_recorrente: um("SELECT SUM(valor) FROM contratos WHERE ativo = 1 AND inicio <= ? AND (fim IS NULL OR fim >= ?)", hoje, hoje),
      qtd_contratos: um("SELECT COUNT(*) FROM contratos WHERE ativo = 1 AND inicio <= ? AND (fim IS NULL OR fim >= ?)", hoje, hoje),
      contratos_sem_cobranca: um(`SELECT COUNT(*) FROM contratos ct WHERE ativo = 1 AND inicio <= ? AND (fim IS NULL OR fim >= ?)
        AND NOT EXISTS (SELECT 1 FROM lancamentos l WHERE l.contrato_id = ct.id AND l.competencia = ?)`, `${competencia}-31`, inicioMes, competencia),
      propostas_abertas: db.prepare("SELECT COUNT(*) AS qtd, COALESCE(SUM(total), 0) AS total FROM projetos WHERE status = 'proposta'").get(),
      projetos_por_etapa: db.prepare(`SELECT status, COUNT(*) AS qtd FROM projetos
        WHERE status IN ('aprovado', 'producao', 'revisao') GROUP BY status`).all(),
      proximas_entregas: db.prepare(`SELECT p.id, p.titulo, p.status, p.prazo_entrega, c.nome AS cliente_nome
        FROM projetos p JOIN clientes c ON c.id = p.cliente_id
        WHERE p.status IN ('aprovado', 'producao', 'revisao')
        ORDER BY p.prazo_entrega IS NULL, p.prazo_entrega LIMIT 8`).all(),
      recebido_por_mes: db.prepare(`SELECT substr(pago_em, 1, 7) AS mes, SUM(valor_pago) AS total, COUNT(*) AS qtd
        FROM lancamentos WHERE tipo = 'receber' AND status = 'pago' AND pago_em >= ? GROUP BY mes ORDER BY mes`).all(inicioSerie),
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

  router.get('/api/relatorios/lucro-por-projeto', ({ query }) => {
    const { de, ate } = periodo(query);
    return db.prepare(`
      SELECT p.id, p.titulo, p.status, p.data_aprovacao, c.nome AS cliente_nome,
        COALESCE((SELECT SUM(valor) FROM lancamentos l WHERE l.projeto_id = p.id AND l.tipo = 'receber' AND l.status != 'cancelado'), 0) AS receita,
        COALESCE((SELECT SUM(valor) FROM lancamentos l WHERE l.projeto_id = p.id AND l.tipo = 'pagar' AND l.status != 'cancelado'), 0) AS custos
      FROM projetos p JOIN clientes c ON c.id = p.cliente_id
      WHERE p.status IN ('aprovado', 'producao', 'revisao', 'entregue') AND p.data_aprovacao BETWEEN ? AND ?
      ORDER BY p.data_aprovacao DESC`).all(de, ate)
      .map((r) => ({ ...r, lucro: r.receita - r.custos, margem: r.receita ? Math.round(((r.receita - r.custos) / r.receita) * 1000) / 10 : 0 }));
  });

  router.get('/api/relatorios/faturamento-por-cliente', ({ query }) => {
    const { de, ate } = periodo(query);
    return db.prepare(`
      SELECT c.id, c.nome, c.documento,
        SUM(CASE WHEN l.origem = 'projeto' THEN l.valor ELSE 0 END) AS projetos,
        SUM(CASE WHEN l.origem = 'contrato' THEN l.valor ELSE 0 END) AS recorrente,
        SUM(l.valor) AS total,
        SUM(CASE WHEN l.status = 'pago' THEN l.valor_pago ELSE 0 END) AS recebido
      FROM lancamentos l JOIN clientes c ON c.id = l.cliente_id
      WHERE l.tipo = 'receber' AND l.status != 'cancelado' AND l.vencimento BETWEEN ? AND ?
      GROUP BY c.id ORDER BY total DESC`).all(de, ate);
  });

  router.get('/api/relatorios/faturamento-por-servico', ({ query }) => {
    const { de, ate } = periodo(query);
    return db.prepare(`
      SELECT COALESCE(s.nome, i.descricao) AS servico, s.categoria, COUNT(DISTINCT p.id) AS projetos,
        SUM(i.quantidade) AS quantidade, SUM(i.subtotal) AS total
      FROM projeto_itens i JOIN projetos p ON p.id = i.projeto_id LEFT JOIN servicos s ON s.id = i.servico_id
      WHERE p.status IN ('aprovado', 'producao', 'revisao', 'entregue') AND p.data_aprovacao BETWEEN ? AND ?
      GROUP BY COALESCE(s.id, i.descricao) ORDER BY total DESC`).all(de, ate);
  });

  router.get('/api/relatorios/despesas-por-categoria', ({ query }) => {
    const { de, ate } = periodo(query);
    return db.prepare(`
      SELECT COALESCE(categoria, 'Sem categoria') AS categoria, tipo, COUNT(*) AS qtd, SUM(valor_pago) AS total
      FROM lancamentos WHERE status = 'pago' AND pago_em BETWEEN ? AND ?
      GROUP BY categoria, tipo ORDER BY tipo, total DESC`).all(de, ate);
  });
}

function lerEmpresa(db) {
  const out = Object.fromEntries(CAMPOS_EMPRESA.map((c) => [c, '']));
  for (const r of db.prepare("SELECT chave, valor FROM configuracoes WHERE chave LIKE 'empresa.%'").all()) {
    out[r.chave.slice(8)] = r.valor;
  }
  return out;
}

module.exports = { registrar, lerEmpresa };
