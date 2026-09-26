'use strict';

// Importa o backup JSON do painel antigo da Maragogi Lab.
// Uso: npm run importar -- caminho/do/backup.json   (use ERP_DB para escolher o banco)

const fs = require('node:fs');
const path = require('node:path');
const { abrir } = require('../src/db');
const { importarPainel } = require('../src/importar');

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Uso: npm run importar -- caminho/do/backup.json');
  process.exit(1);
}
const db = abrir(process.env.ERP_DB || path.join(__dirname, '..', 'data', 'erp.db'));
try {
  const admin = db.prepare("SELECT id FROM usuarios WHERE papel = 'admin' ORDER BY id LIMIT 1").get();
  const r = importarPainel(db, JSON.parse(fs.readFileSync(arquivo, 'utf8')), admin?.id ?? null);
  console.log('Importação concluída:');
  console.log(`  clientes: ${r.clientes} · orçamentos: ${r.orcamentos} · lançamentos: ${r.lancamentos} · notas: ${r.notas}`);
  if (r.ignorados) console.log(`  ${r.ignorados} registro(s) já importado(s) antes foram ignorados`);
  if (r.nao_importados.agenda || r.nao_importados.tarefas) {
    console.log(`  Não importados (sem módulo equivalente): ${r.nao_importados.agenda} evento(s) da agenda, ${r.nao_importados.tarefas} tarefa(s)`);
  }
} catch (e) {
  console.error(`Erro: ${e.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
