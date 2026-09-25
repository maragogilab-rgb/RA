'use strict';

const http = require('node:http');
const path = require('node:path');
const { abrir } = require('./src/db');
const { garantirAdmin } = require('./src/auth');
const { criarApp } = require('./src/app');

const PORTA = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ARQUIVO_DB = process.env.ERP_DB || path.join(__dirname, 'data', 'erp.db');

const db = abrir(ARQUIVO_DB);

const adminEmail = process.env.ERP_ADMIN_EMAIL || 'admin@empresa.com';
const adminSenha = process.env.ERP_ADMIN_SENHA || 'admin123';
if (garantirAdmin(db, { email: adminEmail, senha: adminSenha })) {
  console.log(`Usuário administrador criado: ${adminEmail} / ${adminSenha}`);
  console.log('IMPORTANTE: altere esta senha após o primeiro acesso (menu "Minha conta").');
}

const app = criarApp(db, { seguro: process.env.ERP_COOKIE_SEGURO === '1', log: process.env.ERP_LOG !== '0' });
const servidor = http.createServer(app);

servidor.listen(PORTA, HOST, () => {
  console.log(`ERP rodando em http://localhost:${PORTA}`);
});

function encerrar() {
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
