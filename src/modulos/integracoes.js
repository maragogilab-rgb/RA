'use strict';

const crypto = require('node:crypto');
const { erro } = require('../http');
const v = require('../validar');
const { transacao } = require('../db');

// Reduz um telefone a DDD + 8 últimos dígitos, para reconhecer o mesmo número
// escrito de jeitos diferentes: "+55 (82) 9 9999-1234", "82999991234" ou o
// "558299991234" que o WhatsApp manda (sem o 9 extra).
function chaveTelefone(telefone) {
  let d = v.soDigitos(String(telefone || '')) || '';
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d.slice(0, 2) + d.slice(-8);
  return d.length >= 8 ? d.slice(-8) : null;
}

function tokenConfere(recebido, esperado) {
  const a = Buffer.from(String(recebido || ''));
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Integrações com ferramentas externas (n8n, Evolution API...).
// Desligadas enquanto ERP_INTEGRACAO_TOKEN não estiver definido.
function registrar(router, db, { tokenIntegracao } = {}) {
  router.post('/api/integracoes/lead', (ctx) => {
    if (!tokenIntegracao) throw erro(404, 'Integração desligada: defina ERP_INTEGRACAO_TOKEN');
    if (!tokenConfere(ctx.req.headers['x-erp-token'], tokenIntegracao)) throw erro(401, 'Token de integração inválido');

    const b = ctx.body;
    const telefone = v.texto(b.telefone, 'telefone', { obrigatorio: true, max: 30 });
    const chave = chaveTelefone(telefone);
    if (!chave) throw erro(400, `Telefone inválido: ${telefone}`);
    const nome = v.texto(b.nome, 'nome', { max: 200 }) || `Contato ${telefone}`;
    const mensagem = v.texto(b.mensagem, 'mensagem', { max: 2000 });
    const origem = v.texto(b.origem, 'origem', { max: 100 }) || 'WhatsApp';

    const existente = db.prepare("SELECT * FROM clientes WHERE telefone IS NOT NULL AND telefone != ''").all()
      .find((c) => chaveTelefone(c.telefone) === chave);
    if (existente) return { novo: false, cliente: existente };

    const hoje = v.hoje();
    const { clienteId, tarefaId } = transacao(db, () => {
      const r = db.prepare(`INSERT INTO clientes (nome, tipo_pessoa, telefone, relacao, estagio, origem, proximo_contato, observacoes)
        VALUES (?, 'PF', ?, 'lead', 'Novo lead', ?, ?, ?)`)
        .run(nome, telefone, origem, hoje, mensagem ? `Primeira mensagem (${origem}): ${mensagem}` : null);
      const clienteId = Number(r.lastInsertRowid);
      const t = db.prepare("INSERT INTO tarefas (titulo, prazo, prioridade, cliente_id) VALUES (?, ?, 'alta', ?)")
        .run(`Responder novo lead (${origem}): ${nome}`, hoje, clienteId);
      return { clienteId, tarefaId: Number(t.lastInsertRowid) };
    });
    ctx.status = 201;
    return { novo: true, cliente: db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId), tarefa_id: tarefaId };
  }, { publica: true });
}

module.exports = { registrar, chaveTelefone };
