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

const producao = process.env.NODE_ENV === 'production';
const adminEmail = process.env.ERP_ADMIN_EMAIL || (producao ? '' : 'admin@empresa.com');
const adminSenha = process.env.ERP_ADMIN_SENHA || (producao ? '' : 'admin123');
const adminNome = process.env.ERP_ADMIN_NOME || 'Administrador';
const { n: totalUsuarios } = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get();
if (totalUsuarios === 0) {
  // Na internet não usamos a senha padrão: o primeiro acesso exige usuário e senha definidos na hospedagem.
  if (producao && (!adminEmail || !adminSenha || adminSenha.length < 8)) {
    console.error('Defina as variáveis ERP_ADMIN_EMAIL e ERP_ADMIN_SENHA (mínimo 8 caracteres) para criar o primeiro acesso.');
    process.exit(1);
  }
  garantirAdmin(db, { email: adminEmail, senha: adminSenha, nome: adminNome });
  console.log(`Usuário administrador criado: ${adminEmail}${producao ? '' : ` / ${adminSenha}`}`);
  if (!producao) console.log('IMPORTANTE: altere esta senha após o primeiro acesso (menu "Minha conta").');
}

const app = criarApp(db, {
  seguro: process.env.ERP_COOKIE_SEGURO === '1',
  log: process.env.ERP_LOG !== '0',
  confiarProxy: process.env.ERP_PROXY === '1',
});
const servidor = http.createServer(app);

servidor.listen(PORTA, HOST, () => {
  console.log(`ERP rodando em http://localhost:${PORTA}`);
});

// Emissão automática de NFS-e: verifica a cada ERP_NFSE_INTERVALO minutos (padrão 2). ERP_NFSE_AUTO=0 desliga.
if (process.env.ERP_NFSE_AUTO !== '0') {
  app.automacao.iniciar((Number(process.env.ERP_NFSE_INTERVALO) || 2) * 60 * 1000);
}

function encerrar() {
  app.automacao.parar();
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
