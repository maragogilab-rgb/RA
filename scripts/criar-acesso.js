'use strict';

// Cria o primeiro acesso (usado pelo instalador do Mac).
// Uso: ERP_DB=caminho/erp.db ERP_ADMIN_EMAIL=... ERP_ADMIN_SENHA=... node scripts/criar-acesso.js
const { abrir } = require('../src/db');
const { garantirAdmin } = require('../src/auth');

const email = process.env.ERP_ADMIN_EMAIL;
const senha = process.env.ERP_ADMIN_SENHA;
if (!process.env.ERP_DB || !email || !senha || senha.length < 8) {
  console.error('Informe ERP_DB, ERP_ADMIN_EMAIL e ERP_ADMIN_SENHA (mínimo 8 caracteres).');
  process.exit(1);
}
const db = abrir(process.env.ERP_DB);
const { n } = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get();
if (n === 0) garantirAdmin(db, { email, senha, nome: process.env.ERP_ADMIN_NOME || 'Administrador' });
db.close();
