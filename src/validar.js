'use strict';

const { erro } = require('./http');

const vazio = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function texto(v, campo, { obrigatorio = false, max = 500 } = {}) {
  if (vazio(v)) {
    if (obrigatorio) throw erro(400, `O campo "${campo}" é obrigatório`);
    return null;
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw erro(400, `O campo "${campo}" é inválido`);
  const s = String(v).trim();
  if (s.length > max) throw erro(400, `O campo "${campo}" excede ${max} caracteres`);
  return s;
}

function numero(v, campo, { obrigatorio = false, min = -Infinity, padrao = null } = {}) {
  if (vazio(v)) {
    if (obrigatorio) throw erro(400, `O campo "${campo}" é obrigatório`);
    return padrao;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw erro(400, `O campo "${campo}" deve ser numérico`);
  if (n < min) throw erro(400, `O campo "${campo}" deve ser maior ou igual a ${min}`);
  return n;
}

function inteiro(v, campo, opts = {}) {
  const n = numero(v, campo, opts);
  if (n !== null && !Number.isInteger(n)) throw erro(400, `O campo "${campo}" deve ser um número inteiro`);
  return n;
}

// Valores monetários trafegam na API em centavos (inteiros).
const centavos = (v, campo, opts = {}) => inteiro(v, campo, { min: 0, ...opts });

function data(v, campo, { obrigatorio = false } = {}) {
  if (vazio(v)) {
    if (obrigatorio) throw erro(400, `O campo "${campo}" é obrigatório`);
    return null;
  }
  const s = String(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw erro(400, `O campo "${campo}" deve ser uma data no formato AAAA-MM-DD`);
  }
  return s;
}

function opcao(v, campo, opcoes, { obrigatorio = false, padrao = null } = {}) {
  if (vazio(v)) {
    if (obrigatorio) throw erro(400, `O campo "${campo}" é obrigatório`);
    return padrao;
  }
  if (!opcoes.includes(v)) throw erro(400, `O campo "${campo}" deve ser um de: ${opcoes.join(', ')}`);
  return v;
}

const booleano = (v, padrao = true) => (v === undefined || v === null ? (padrao ? 1 : 0) : (v === true || v === 1 || v === '1' || v === 'true') ? 1 : 0);

function hoje() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

// Soma meses a uma data AAAA-MM-DD, ajustando para o último dia do mês quando necessário.
function somarMeses(dataStr, meses) {
  const [a, m, d] = dataStr.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

// Divide um valor em n parcelas; a diferença de centavos vai para a primeira.
function dividirParcelas(total, n) {
  const base = Math.floor(total / n);
  const parcelas = Array(n).fill(base);
  parcelas[0] += total - base * n;
  return parcelas;
}

// Valida CPF (11 dígitos) ou CNPJ (14 dígitos) pelos dígitos verificadores.
function documentoValido(doc) {
  const d = String(doc || '').replace(/\D/g, '');
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false;
    const dv = (n) => {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
      const r = (soma * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false;
    const dv = (n) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const soma = pesos.reduce((s, p, i) => s + Number(d[i]) * p, 0);
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
  }
  return false;
}

const soDigitos = (v) => (v ? String(v).replace(/\D/g, '') : null);

module.exports = { documentoValido, soDigitos, texto, numero, inteiro, centavos, data, opcao, booleano, hoje, somarMeses, dividirParcelas };
