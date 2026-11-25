'use strict';

const crypto = require('node:crypto');
const { erro } = require('../http');
const v = require('../validar');
const { transacao } = require('../db');
const bot = require('../whatsapp-bot');

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

// Cadastra o contato como lead (com tarefa para responder) ou devolve o que já existe com esse número.
function registrarLead(db, b) {
  const telefone = v.texto(b.telefone, 'telefone', { obrigatorio: true, max: 30 });
  const chave = chaveTelefone(telefone);
  if (!chave) throw erro(400, `Telefone inválido: ${telefone}`);
  const nome = v.texto(b.nome, 'nome', { max: 200 }) || `Contato ${telefone}`;
  const mensagem = v.texto(b.mensagem, 'mensagem', { max: 2000 });
  const origem = v.texto(b.origem, 'origem', { max: 100 }) || 'WhatsApp';

  const existente = db.prepare("SELECT * FROM clientes WHERE telefone IS NOT NULL AND telefone != ''").all()
    .find((c) => chaveTelefone(c.telefone) === chave);
  if (existente) return { chave, novo: false, cliente: existente };

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
  return { chave, novo: true, cliente: db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId), tarefa_id: tarefaId };
}

// Integrações com ferramentas externas (n8n, Evolution API...).
// Desligadas enquanto ERP_INTEGRACAO_TOKEN não estiver definido.
function registrar(router, db, { tokenIntegracao } = {}) {
  const autenticar = (ctx) => {
    if (!tokenIntegracao) throw erro(404, 'Integração desligada: defina ERP_INTEGRACAO_TOKEN');
    if (!tokenConfere(ctx.req.headers['x-erp-token'], tokenIntegracao)) throw erro(401, 'Token de integração inválido');
  };

  router.post('/api/integracoes/lead', (ctx) => {
    autenticar(ctx);
    const { chave, ...r } = registrarLead(db, ctx.body);
    if (r.novo) ctx.status = 201;
    return r;
  }, { publica: true });

  // Cada mensagem do WhatsApp passa por aqui. Responde { resposta } com o texto a enviar, ou resposta null.
  // de_mim = true: mensagem enviada pelo WhatsApp da própria agência (o robô sai da conversa).
  router.post('/api/integracoes/whatsapp', (ctx) => {
    autenticar(ctx);
    const b = ctx.body;
    const deMim = b.de_mim === true;
    let lead;
    let chave;
    if (deMim) {
      chave = chaveTelefone(v.texto(b.telefone, 'telefone', { obrigatorio: true, max: 30 }));
      if (!chave) throw erro(400, 'Telefone inválido');
    } else {
      lead = registrarLead(db, { ...b, origem: 'WhatsApp' });
      chave = lead.chave;
    }
    const resposta = bot.processar(db, {
      chave, nome: v.texto(b.nome, 'nome', { max: 200 }), mensagem: v.texto(b.mensagem, 'mensagem', { max: 2000 }) || '',
      deMim, lead, hoje: v.hoje(),
    });
    return { resposta: resposta || null, novo: Boolean(lead?.novo), cliente_id: lead?.cliente?.id ?? null };
  }, { publica: true });

  // Textos padrão do robô, para a tela de Configurações.
  router.get('/api/integracoes/whatsapp/padroes', () => ({ ...bot.PADROES, integracao_ligada: Boolean(tokenIntegracao) }));
}

module.exports = { registrar, chaveTelefone };
