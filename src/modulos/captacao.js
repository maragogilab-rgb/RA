'use strict';

// Captação de clientes: página pública "Peça seu orçamento" (/pedir-orcamento).
// Cada pedido vira um lead em "Clientes e leads" e aparece nos lembretes do Painel.

const { erro } = require('../http');
const v = require('../validar');
const { lerEmpresa } = require('./sistema');

const ORIGENS = { instagram: 'Instagram', google: 'Google', whatsapp: 'WhatsApp', indicacao: 'Indicação', facebook: 'Facebook', tiktok: 'TikTok', site: 'Site', cartao: 'Cartão/QR' };
const LIMITE_POR_HORA = 5;

function registrar(router, db) {
  const tentativas = new Map(); // ip -> [timestamps]

  // Dados mínimos para montar a página pública (nada sensível).
  router.get('/api/publico/empresa', () => {
    const e = lerEmpresa(db);
    const servicos = db.prepare('SELECT id, nome, categoria FROM servicos WHERE ativo = 1 ORDER BY categoria, nome LIMIT 100').all();
    return { nome: e.nome || '', telefone: e.telefone || '', cidade: e.cidade || '', uf: e.uf || '', logo: e.logo || '', servicos };
  }, { publica: true });

  router.post('/api/publico/pedido', (ctx) => {
    const b = ctx.body;
    // Campo escondido: robôs preenchem, pessoas não.
    if (b.site) return { ok: true };

    const agora = Date.now();
    const lista = (tentativas.get(ctx.ip) || []).filter((t) => agora - t < 3600e3);
    if (lista.length >= LIMITE_POR_HORA) throw erro(429, 'Muitos pedidos seguidos. Chame no WhatsApp, por favor.');
    lista.push(agora);
    tentativas.set(ctx.ip, lista);
    if (tentativas.size > 5000) tentativas.clear();

    const nome = v.texto(b.nome, 'nome', { obrigatorio: true, max: 120 });
    const telefone = v.texto(b.telefone, 'telefone', { obrigatorio: true, max: 30 });
    if (v.soDigitos(telefone).length < 10) throw erro(400, 'Informe o WhatsApp com DDD');
    const email = v.texto(b.email, 'email', { max: 200 });
    const empresa = v.texto(b.empresa, 'empresa', { max: 120 });
    const mensagem = v.texto(b.mensagem, 'mensagem', { max: 1500 });
    const quando = v.texto(b.quando, 'quando', { max: 60 });
    const servicoId = v.inteiro(b.servico_id, 'servico_id');
    const servico = servicoId ? db.prepare('SELECT id, nome FROM servicos WHERE id = ? AND ativo = 1').get(servicoId) : null;
    const origem = ORIGENS[String(b.origem || '').toLowerCase()] || 'Site';

    const obs = [
      `Pedido de orçamento pela página (${new Date().toLocaleString('pt-BR', { timeZone: 'America/Maceio' })})`,
      servico && `Serviço: ${servico.nome}`,
      quando && `Para quando: ${quando}`,
      mensagem && `Mensagem: ${mensagem}`,
    ].filter(Boolean).join('\n');

    // Mesmo telefone já cadastrado: atualiza em vez de duplicar.
    const digitos = v.soDigitos(telefone);
    const existente = db.prepare("SELECT id, telefone, observacoes FROM clientes WHERE telefone IS NOT NULL AND telefone <> ''").all()
      .find((c) => v.soDigitos(c.telefone).slice(-9) === digitos.slice(-9));
    if (existente) {
      db.prepare(`UPDATE clientes SET observacoes = ?, pedido_em = datetime('now'), estagio = 'Novo lead', ativo = 1,
        email = COALESCE(NULLIF(email, ''), ?) WHERE id = ?`).run(`${obs}\n\n${existente.observacoes || ''}`.slice(0, 2000), email, existente.id);
    } else {
      db.prepare(`INSERT INTO clientes (nome, telefone, email, contato, observacoes, relacao, estagio, origem, pedido_em, servico_padrao_id, tipo_pessoa)
        VALUES (?, ?, ?, ?, ?, 'lead', 'Novo lead', ?, datetime('now'), ?, ?)`)
        .run(empresa || nome, telefone, email, empresa ? nome : null, obs, origem, servico?.id ?? null, empresa ? 'PJ' : 'PF');
    }
    ctx.status = 201;
    return { ok: true };
  }, { publica: true, limiteCorpo: 16 * 1024 });
}

module.exports = { registrar };
