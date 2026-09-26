'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Router, ErroHttp, lerCorpo, lerCookies, enviarJson } = require('./http');
const auth = require('./auth');

const PUBLICO = path.join(__dirname, '..', 'public');
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};
const SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
};

function criarRouter(db, opcoes) {
  const router = new Router();
  for (const m of ['sistema', 'cadastros', 'projetos', 'contratos', 'financeiro', 'notas']) {
    require(`./modulos/${m}`).registrar(router, db, opcoes);
  }
  return router;
}

function servirEstatico(req, res, caminho) {
  let arquivo = path.normalize(path.join(PUBLICO, caminho === '/' ? 'index.html' : caminho));
  if (!arquivo.startsWith(PUBLICO + path.sep)) {
    res.writeHead(403, SEGURANCA);
    return res.end('Proibido');
  }
  // Rotas desconhecidas caem na SPA.
  if (!fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) arquivo = path.join(PUBLICO, 'index.html');
  res.writeHead(200, {
    ...SEGURANCA,
    'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(arquivo).pipe(res);
}

// opcoes.fetchNfse permite substituir a chamada HTTP à API de NFS-e (usado nos testes).
function criarApp(db, { seguro = false, log = true, fetchNfse } = {}) {
  const router = criarRouter(db, { fetchNfse });

  return async function app(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const caminho = url.pathname;

    if (!caminho.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, SEGURANCA);
        return res.end();
      }
      return servirEstatico(req, res, caminho);
    }

    const ctx = {
      req, res,
      query: Object.fromEntries(url.searchParams),
      params: {},
      body: {},
      cookies: [],
      status: 200,
      seguro,
    };
    const inicio = Date.now();
    try {
      const { rota, params, caminhoExiste } = router.encontrar(req.method, caminho);
      if (!rota) throw new ErroHttp(caminhoExiste ? 405 : 404, caminhoExiste ? 'Método não permitido' : 'Rota não encontrada');
      ctx.params = params;

      // Proteção CSRF: mutações exigem Content-Type JSON (bloqueia formulários de outros sites).
      if (req.method !== 'GET' && !(req.headers['content-type'] || '').includes('application/json')) {
        throw new ErroHttp(415, 'Envie o corpo como application/json');
      }

      ctx.token = lerCookies(req).sessao;
      ctx.usuario = auth.usuarioDaSessao(db, ctx.token);
      if (!rota.opcoes.publica && !ctx.usuario) throw new ErroHttp(401, 'Sessão expirada. Faça login novamente.');

      if (req.method !== 'GET') ctx.body = await lerCorpo(req);
      const resultado = await rota.handler(ctx);
      const headers = ctx.cookies.length ? { 'Set-Cookie': ctx.cookies } : {};
      if (resultado === undefined) enviarJson(res, 204, null, { ...SEGURANCA, ...headers });
      else enviarJson(res, ctx.status, resultado, { ...SEGURANCA, ...headers });
    } catch (e) {
      if (e instanceof ErroHttp) {
        enviarJson(res, e.status, { erro: e.message }, SEGURANCA);
      } else {
        console.error(e);
        enviarJson(res, 500, { erro: 'Erro interno do servidor' }, SEGURANCA);
      }
    }
    if (log) console.log(`${req.method} ${caminho} ${res.statusCode} ${Date.now() - inicio}ms`);
  };
}

module.exports = { criarApp };
