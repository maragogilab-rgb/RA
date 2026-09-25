'use strict';

const crypto = require('node:crypto');

const DURACAO_SESSAO_HORAS = 12;

function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, sal, 64);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

function verificarSenha(senha, armazenado) {
  const [alg, salHex, hashHex] = String(armazenado).split('$');
  if (alg !== 'scrypt' || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const obtido = crypto.scryptSync(senha, Buffer.from(salHex, 'hex'), esperado.length);
  return crypto.timingSafeEqual(esperado, obtido);
}

function criarSessao(db, usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + DURACAO_SESSAO_HORAS * 3600 * 1000).toISOString();
  db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(new Date().toISOString());
  db.prepare('INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?, ?, ?)').run(token, usuarioId, expira);
  return { token, maxAge: DURACAO_SESSAO_HORAS * 3600 };
}

function usuarioDaSessao(db, token) {
  if (!token) return null;
  const u = db.prepare(`
    SELECT u.id, u.nome, u.email, u.papel
    FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token = ? AND s.expira_em > ? AND u.ativo = 1
  `).get(token, new Date().toISOString());
  return u ? { ...u } : null;
}

function encerrarSessao(db, token) {
  if (token) db.prepare('DELETE FROM sessoes WHERE token = ?').run(token);
}

// Cria o administrador inicial quando o banco ainda não tem usuários.
function garantirAdmin(db, { email, senha, nome = 'Administrador' }) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get();
  if (n > 0) return false;
  db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES (?, ?, ?, ?)')
    .run(nome, email, hashSenha(senha), 'admin');
  return true;
}

module.exports = { hashSenha, verificarSenha, criarSessao, usuarioDaSessao, encerrarSessao, garantirAdmin };
