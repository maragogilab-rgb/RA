'use strict';

// Robô de atendimento do WhatsApp com menu de opções (sem IA, sem custo).
// O n8n manda cada mensagem para cá; o ERP guarda em que ponto está cada conversa
// e devolve o texto que deve ser respondido (ou nada, quando o robô deve ficar quieto).

const { transacao } = require('./db');

// Textos padrão; todos podem ser trocados em Configurações → WhatsApp.
const PADROES = {
  bot_modo: 'menu', // 'menu' | 'boas_vindas' (só a 1ª mensagem) | 'desligado'
  bot_boas_vindas: 'Oi, {nome}! 👋 Aqui é da Maragogi Lab. Que bom ter você por aqui!',
  bot_servicos: 'Vídeo / filmagem\nFotografia\nGestão de redes sociais\nTráfego pago (anúncios)\nOutro',
  bot_perguntas: 'Qual a data do evento ou da gravação? (se ainda não sabe, responda "não sei")\n'
    + 'Em qual cidade ou local?\n'
    + 'Conta rapidinho o que você imagina (estilo, duração, quantidade…)',
  bot_portfolio: '',
  bot_fim: 'Perfeito, {nome}! Já anotei tudo e vamos preparar seu orçamento. Em breve te chamamos por aqui. 🙌',
  bot_humano: 'Certo, {nome}! Já avisei a equipe e alguém te responde por aqui em breve.',
};
const CAMPOS_BOT = Object.keys(PADROES);

const MAX_INVALIDAS = 3; // depois de 3 respostas que o robô não entende, passa para a equipe
const REINICIO_DIAS = 30; // conversa parada há mais que isso recomeça pelo menu
const ECO_MS = 10 * 60 * 1000; // a própria resposta do robô volta do WhatsApp como "enviada por mim"

const agoraIso = () => new Date().toISOString();
const linhas = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);
const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function config(db) {
  const out = { ...PADROES };
  for (const r of db.prepare("SELECT chave, valor FROM configuracoes WHERE chave LIKE 'empresa.bot_%'").all()) {
    const c = r.chave.slice(8);
    if (c in PADROES && r.valor) out[c] = r.valor;
  }
  if (!['menu', 'boas_vindas', 'desligado'].includes(out.bot_modo)) out.bot_modo = PADROES.bot_modo;
  return out;
}

const preencher = (modelo, nome) => modelo.replace(/\{nome\}/g, (nome || '').trim().split(/\s+/)[0] || 'tudo bem');

function opcoesMenu(cfg) {
  return [
    { id: 'orcamento', texto: 'Pedir um orçamento' },
    cfg.bot_portfolio ? { id: 'portfolio', texto: 'Ver nossos trabalhos' } : null,
    { id: 'cliente', texto: 'Já sou cliente' },
    { id: 'humano', texto: 'Falar com a equipe' },
  ].filter(Boolean);
}

const textoMenu = (cfg) => `Como posso te ajudar? Responda com o número:\n\n${
  opcoesMenu(cfg).map((o, i) => `*${i + 1}* - ${o.texto}`).join('\n')}`;

const textoServicos = (cfg) => `Show! Qual serviço você procura? Responda com o número:\n\n${
  linhas(cfg.bot_servicos).map((s, i) => `*${i + 1}* - ${s}`).join('\n')}`;

// Lê "1", "1.", "1)", "opção 1" ou "1️⃣" como o número 1. Textos longos não contam como escolha.
function numeroEscolhido(msg) {
  const t = String(msg || '').trim();
  if (t.length > 20) return null;
  const m = /^\D{0,10}?(\d{1,2})(?!\d)/.exec(t);
  return m ? Number(m[1]) : null;
}

function escolherMenu(cfg, msg) {
  const ops = opcoesMenu(cfg);
  const n = numeroEscolhido(msg);
  if (n) return ops[n - 1]?.id || null;
  const t = normalizar(msg);
  if (/orcamento|preco|valor|quanto custa/.test(t)) return 'orcamento';
  if (/atendente|humano|pessoa|falar com/.test(t)) return 'humano';
  return null;
}

function rotuloPergunta(p) {
  const i = p.indexOf('?');
  return (i >= 0 ? p.slice(0, i + 1) : p).slice(0, 80);
}

// ---------- Banco ----------
function lerConversa(db, chave) {
  const c = db.prepare('SELECT * FROM whatsapp_conversas WHERE chave = ?').get(chave);
  if (!c) return null;
  let dados = {};
  try { dados = JSON.parse(c.dados || '{}') || {}; } catch { dados = {}; }
  return { ...c, dados };
}

function salvarConversa(db, c, resposta) {
  const agora = agoraIso();
  db.prepare(`INSERT INTO whatsapp_conversas (chave, cliente_id, etapa, dados, invalidas, ultima_resposta, ultima_resposta_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chave) DO UPDATE SET cliente_id = excluded.cliente_id, etapa = excluded.etapa, dados = excluded.dados,
      invalidas = excluded.invalidas, ultima_resposta = excluded.ultima_resposta,
      ultima_resposta_em = excluded.ultima_resposta_em, atualizado_em = excluded.atualizado_em`)
    .run(c.chave, c.cliente_id, c.etapa, JSON.stringify(c.dados || {}), c.invalidas || 0,
      resposta ?? c.ultima_resposta ?? null, resposta ? agora : c.ultima_resposta_em ?? null, agora);
}

// Passa a conversa para a equipe: atualiza a tarefa do lead (se ainda aberta) ou cria uma nova.
function chamarEquipe(db, conversa, titulo, hoje) {
  const t = conversa.dados.tarefa_id
    ? db.prepare('SELECT id FROM tarefas WHERE id = ? AND feito = 0').get(conversa.dados.tarefa_id) : null;
  if (t) {
    db.prepare("UPDATE tarefas SET titulo = ?, prioridade = 'alta', prazo = ? WHERE id = ?").run(titulo, hoje, t.id);
  } else {
    const r = db.prepare("INSERT INTO tarefas (titulo, prazo, prioridade, cliente_id) VALUES (?, ?, 'alta', ?)")
      .run(titulo, hoje, conversa.cliente_id);
    conversa.dados.tarefa_id = Number(r.lastInsertRowid);
  }
}

function anotarNoCliente(db, clienteId, texto) {
  const c = db.prepare('SELECT observacoes FROM clientes WHERE id = ?').get(clienteId);
  if (!c) return;
  const obs = c.observacoes ? `${c.observacoes}\n\n${texto}` : texto;
  db.prepare('UPDATE clientes SET observacoes = ? WHERE id = ?').run(obs.slice(-8000), clienteId);
}

// ---------- Conversa ----------
// Recebe uma mensagem e decide a resposta. `lead` é o resultado do cadastro do contato
// ({ novo, cliente, tarefa_id }); `deMim` indica mensagem enviada pelo WhatsApp da própria agência.
function processar(db, { chave, nome, mensagem, deMim = false, lead, hoje }) {
  const cfg = config(db);
  let conversa = lerConversa(db, chave);
  const nomeContato = nome || lead?.cliente?.nome || '';

  // Mensagem enviada pela agência: se não for o eco da resposta do robô, alguém da equipe assumiu.
  if (deMim) {
    if (!conversa) return null;
    const eco = conversa.ultima_resposta && conversa.ultima_resposta.trim() === String(mensagem || '').trim()
      && Date.now() - Date.parse(conversa.ultima_resposta_em || 0) < ECO_MS;
    if (eco) return null;
    conversa.etapa = 'humano';
    conversa.invalidas = 0;
    salvarConversa(db, conversa);
    return null;
  }

  // Contato que já existia antes do robô (cliente, parceiro, lead antigo): o robô não se mete.
  if (!conversa && !lead?.novo) return null;

  return transacao(db, () => {
    let resposta = null;
    const pedidoMenu = /^#?menu$/.test(normalizar(mensagem));

    if (!conversa) {
      conversa = { chave, cliente_id: lead.cliente.id, etapa: 'humano', dados: { tarefa_id: lead.tarefa_id }, invalidas: 0 };
      if (cfg.bot_modo === 'menu') {
        conversa.etapa = 'menu';
        resposta = `${preencher(cfg.bot_boas_vindas, nomeContato)}\n\n${textoMenu(cfg)}`;
      } else if (cfg.bot_modo === 'boas_vindas') {
        resposta = preencher(cfg.bot_boas_vindas, nomeContato);
      }
      salvarConversa(db, conversa, resposta);
      return resposta;
    }

    if (cfg.bot_modo !== 'menu') {
      salvarConversa(db, conversa);
      return null;
    }

    // Com a equipe: só volta ao menu se o contato pedir ou se a conversa estava parada há muito tempo.
    if (conversa.etapa === 'humano') {
      const parada = Date.now() - Date.parse(conversa.atualizado_em || 0) > REINICIO_DIAS * 86400000;
      if (!pedidoMenu && !parada) {
        salvarConversa(db, conversa);
        return null;
      }
      conversa.etapa = 'menu';
      conversa.invalidas = 0;
      resposta = parada && !pedidoMenu
        ? `Oi de novo, ${preencher('{nome}', nomeContato)}! 👋\n\n${textoMenu(cfg)}`
        : textoMenu(cfg);
      salvarConversa(db, conversa, resposta);
      return resposta;
    }

    if (pedidoMenu) {
      conversa.etapa = 'menu';
      conversa.invalidas = 0;
      resposta = textoMenu(cfg);
      salvarConversa(db, conversa, resposta);
      return resposta;
    }

    const passarParaEquipe = (titulo, texto) => {
      chamarEquipe(db, conversa, titulo, hoje);
      conversa.etapa = 'humano';
      conversa.invalidas = 0;
      return `${preencher(texto, nomeContato)}\n\n_Se quiser voltar ao menu, é só mandar *menu*._`;
    };
    const quem = nomeContato || chave;

    if (conversa.etapa === 'menu') {
      const opcao = escolherMenu(cfg, mensagem);
      if (opcao === 'orcamento') {
        conversa.etapa = 'orc_servico';
        conversa.dados.respostas = [];
        conversa.invalidas = 0;
        resposta = textoServicos(cfg);
      } else if (opcao === 'portfolio') {
        resposta = `${cfg.bot_portfolio}\n\nQuer pedir um orçamento? Responda *1*. Para ver as opções de novo, mande *menu*.`;
      } else if (opcao === 'cliente') {
        conversa.etapa = 'cliente_msg';
        conversa.invalidas = 0;
        resposta = 'Que bom falar com você de novo! Me conta em uma mensagem o que você precisa que eu já passo para a equipe.';
      } else if (opcao === 'humano') {
        resposta = passarParaEquipe(`WhatsApp: ${quem} quer falar com a equipe`, cfg.bot_humano);
      } else {
        conversa.invalidas = (conversa.invalidas || 0) + 1;
        resposta = conversa.invalidas >= MAX_INVALIDAS
          ? passarParaEquipe(`WhatsApp: responder ${quem} (não usou o menu)`, cfg.bot_humano)
          : `Não entendi 🙂\n\n${textoMenu(cfg)}`;
      }
    } else if (conversa.etapa === 'cliente_msg') {
      anotarNoCliente(db, conversa.cliente_id, `[WhatsApp ${hoje}] Já é cliente, pediu: ${mensagem}`);
      resposta = passarParaEquipe(`WhatsApp: ${quem} (cliente) — ${String(mensagem).slice(0, 120)}`, cfg.bot_humano);
    } else if (conversa.etapa === 'orc_servico') {
      const servicos = linhas(cfg.bot_servicos);
      const n = numeroEscolhido(mensagem);
      const servico = n ? servicos[n - 1] : String(mensagem || '').trim().slice(0, 200);
      if (!servico) {
        conversa.invalidas = (conversa.invalidas || 0) + 1;
        resposta = conversa.invalidas >= MAX_INVALIDAS
          ? passarParaEquipe(`WhatsApp: responder ${quem} (pedido de orçamento)`, cfg.bot_humano)
          : `Não encontrei essa opção 🙂\n\n${textoServicos(cfg)}`;
      } else {
        conversa.dados.servico = servico;
        conversa.dados.respostas = [];
        conversa.invalidas = 0;
        conversa.etapa = 'orc_pergunta';
      }
    } else if (conversa.etapa === 'orc_pergunta') {
      conversa.dados.respostas = [...(conversa.dados.respostas || []), String(mensagem || '').trim().slice(0, 500)];
    }

    // Fluxo do orçamento: faz as perguntas em ordem e, no fim, anota tudo no lead.
    if (conversa.etapa === 'orc_pergunta') {
      const perguntas = linhas(cfg.bot_perguntas);
      const feitas = conversa.dados.respostas.length;
      if (feitas < perguntas.length) {
        resposta = perguntas[feitas];
      } else {
        const resumo = [`[WhatsApp ${hoje}] Pedido de orçamento`, `• Serviço: ${conversa.dados.servico}`,
          ...perguntas.map((p, i) => `• ${rotuloPergunta(p)} ${conversa.dados.respostas[i] || ''}`)].join('\n');
        anotarNoCliente(db, conversa.cliente_id, resumo);
        resposta = passarParaEquipe(`Enviar orçamento (WhatsApp): ${quem} — ${conversa.dados.servico}`, cfg.bot_fim)
          .replace(/\n\n_Se quiser voltar.*$/s, '');
      }
    }

    salvarConversa(db, conversa, resposta);
    return resposta;
  });
}

module.exports = { processar, config, PADROES, CAMPOS_BOT, textoMenu };
