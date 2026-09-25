'use strict';

// Micro-framework HTTP: roteamento, leitura de JSON, cookies e erros.

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

const erro = (status, mensagem) => new ErroHttp(status, mensagem);

class Router {
  constructor() {
    this.rotas = [];
  }

  // add(metodo, caminho, handler, opcoes?) — opcoes.publica dispensa autenticação.
  add(metodo, caminho, handler, opcoes = {}) {
    const nomes = [];
    const padrao = caminho.replace(/:(\w+)/g, (_, nome) => {
      nomes.push(nome);
      return '([^/]+)';
    });
    this.rotas.push({ metodo, regex: new RegExp(`^${padrao}/?$`), nomes, handler, opcoes });
  }

  get(c, h, o) { this.add('GET', c, h, o); }
  post(c, h, o) { this.add('POST', c, h, o); }
  put(c, h, o) { this.add('PUT', c, h, o); }
  delete(c, h, o) { this.add('DELETE', c, h, o); }

  encontrar(metodo, caminho) {
    let caminhoExiste = false;
    for (const rota of this.rotas) {
      const m = rota.regex.exec(caminho);
      if (!m) continue;
      caminhoExiste = true;
      if (rota.metodo !== metodo) continue;
      const params = {};
      rota.nomes.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      return { rota, params };
    }
    return { caminhoExiste };
  }
}

const LIMITE_CORPO = 1024 * 1024; // 1 MB

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes = [];
    req.on('data', (c) => {
      tamanho += c.length;
      if (tamanho > LIMITE_CORPO) {
        reject(erro(413, 'Requisição muito grande'));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on('end', () => {
      if (!partes.length) return resolve({});
      try {
        const obj = JSON.parse(Buffer.concat(partes).toString('utf8'));
        resolve(obj && typeof obj === 'object' ? obj : {});
      } catch {
        reject(erro(400, 'JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function lerCookies(req) {
  const out = {};
  for (const parte of (req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    out[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return out;
}

function enviarJson(res, status, dados, headers = {}) {
  const corpo = status === 204 ? '' : JSON.stringify(dados);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(corpo);
}

module.exports = { Router, ErroHttp, erro, lerCorpo, lerCookies, enviarJson };
