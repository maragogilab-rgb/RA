'use strict';

// Importa o backup JSON do painel antigo da Maragogi Lab ("backup-painel-maragogi-lab").
// Pode ser executado mais de uma vez: registros já importados são ignorados.

const { erro } = require('./http');
const { transacao } = require('./db');
const v = require('./validar');

const ORIGEM = 'painel-maragogi-lab';
const centavos = (n) => Math.round(Number(n || 0) * 100);
const limpo = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);

// "Alessandra · (82) 99922-8153" -> { contato, telefone }; "@perfil (Instagram)" fica como contato.
function separarContato(texto) {
  const t = limpo(texto);
  if (!t) return { contato: null, telefone: null };
  const tel = t.match(/\(?\d{2}\)?\s*9?\d{4}-?\d{4}/);
  const contato = t.replace(tel?.[0] || '', '').replace(/[·\-–|,]\s*$/, '').replace(/^\s*[·\-–|,]/, '').trim();
  return { contato: contato || null, telefone: tel ? tel[0] : null };
}

// "Rua X, Q A, Nº 5, Bairro, Cidade/UF, CEP 57081-140"
function separarEndereco(texto) {
  const t = limpo(texto);
  if (!t) return {};
  const cep = t.match(/(\d{5})-?(\d{3})/);
  const cidadeUf = t.match(/([A-Za-zÀ-ú .]+)\/([A-Z]{2})/);
  const numero = t.match(/N[º°o]\.?\s*(\w+)/i);
  const partes = t.split(',').map((p) => p.trim());
  const idxNum = partes.findIndex((p) => /^N[º°o]/i.test(p));
  return {
    cep: cep ? `${cep[1]}${cep[2]}` : null,
    cidade: cidadeUf?.[1].trim() || null,
    uf: cidadeUf?.[2] || null,
    numero: numero?.[1] || null,
    logradouro: idxNum > 0 ? partes.slice(0, idxNum).join(', ') : partes[0],
    bairro: idxNum >= 0 && partes[idxNum + 1] && !partes[idxNum + 1].includes('/') ? partes[idxNum + 1] : null,
  };
}

const RELACAO = { cliente: 'cliente', parceiro: 'parceiro' };

function importarPainel(db, dados, usuarioId) {
  if (!dados || dados.tipo !== 'backup-painel-maragogi-lab') {
    throw erro(400, 'Arquivo não reconhecido: esperado um backup do painel Maragogi Lab');
  }
  const resultado = { clientes: 0, orcamentos: 0, lancamentos: 0, notas: 0, configuracoes: 0, ignorados: 0 };

  const jaImportado = (tabela, idExt) => db.prepare('SELECT id_local FROM ids_externos WHERE origem = ? AND tabela = ? AND id_externo = ?')
    .get(ORIGEM, tabela, String(idExt))?.id_local;
  const marcar = (tabela, idExt, idLocal) => db.prepare('INSERT INTO ids_externos (origem, id_externo, tabela, id_local) VALUES (?, ?, ?, ?)')
    .run(ORIGEM, String(idExt), tabela, idLocal);
  const inserir = (tabela, obj) => {
    const cols = Object.keys(obj).filter((k) => obj[k] !== undefined);
    return Number(db.prepare(`INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(...cols.map((c) => obj[c])).lastInsertRowid);
  };
  // Encontra cliente pelo nome (sem diferenciar maiúsculas) ou cria um novo.
  const clientePorNome = (nome, extra = {}) => {
    const existente = db.prepare('SELECT id FROM clientes WHERE lower(trim(nome)) = lower(trim(?))').get(nome);
    if (existente) return existente.id;
    resultado.clientes++;
    return inserir('clientes', { nome: nome.trim(), tipo_pessoa: 'PJ', relacao: 'cliente', ...extra });
  };

  transacao(db, () => {
    // ---------- Configurações da empresa ----------
    const c = dados.config || {};
    const end = separarEndereco(c.endereco);
    const doc = limpo(c.documento);
    const empresa = {
      nome: 'Maragogi Lab',
      razao_social: limpo(c.empresa),
      cnpj: doc && v.documentoValido(doc) ? doc : null,
      telefone: limpo(c.whatsapp),
      email: limpo(c.email),
      regime_tributario: c.tetoMeiAnual ? 'mei' : null,
      ...end,
      codigo_municipio: end.cidade && /macei[oó]/i.test(end.cidade) && end.uf === 'AL' ? '2704302' : null,
      pix_chave: limpo(c.pix),
      pix_titular: limpo(c.titularBanco),
      dados_bancarios: [limpo(c.banco), c.agencia && `Ag. ${c.agencia}`, c.conta && `Conta ${c.conta}`].filter(Boolean).join(' ') || null,
      termos_orcamento: limpo(c.obsPadrao),
      teto_mei: c.tetoMeiAnual ? String(c.tetoMeiAnual) : null,
    };
    const up = db.prepare(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
      ON CONFLICT(chave) DO UPDATE SET valor = CASE WHEN configuracoes.valor = '' OR configuracoes.valor IS NULL THEN excluded.valor ELSE configuracoes.valor END`);
    for (const [k, val] of Object.entries(empresa)) {
      if (val) { up.run(`empresa.${k}`, String(val)); resultado.configuracoes++; }
    }

    // ---------- Clientes / leads / parceiros ----------
    const mapaCliente = new Map();
    for (const cl of dados.clientes || []) {
      const existente = jaImportado('clientes', cl.id);
      if (existente) { mapaCliente.set(cl.id, existente); resultado.ignorados++; continue; }
      const { contato, telefone } = separarContato(cl.contato);
      const relacao = RELACAO[cl.tipoLead] || (cl.estagio === 'Fechado' ? 'cliente' : 'lead');
      const id = inserir('clientes', {
        nome: cl.nome.trim(),
        tipo_pessoa: 'PJ',
        contato,
        telefone,
        relacao,
        segmento: limpo(cl.segmento),
        estagio: limpo(cl.estagio),
        classificacao: limpo(cl.classificacao),
        origem: limpo(cl.origem),
        prazo_faturamento: limpo(cl.prazoFaturamento),
        proximo_contato: /^\d{4}-\d{2}-\d{2}$/.test(cl.proximoFollowUp || '') ? cl.proximoFollowUp : null,
        observacoes: limpo(cl.notas),
        criado_em: cl.criadoEm ? cl.criadoEm.replace('T', ' ').slice(0, 19) : undefined,
      });
      marcar('clientes', cl.id, id);
      mapaCliente.set(cl.id, id);
      resultado.clientes++;
    }

    // ---------- Orçamentos -> projetos ----------
    for (const o of dados.orcamentos || []) {
      if (jaImportado('projetos', o.id)) { resultado.ignorados++; continue; }
      const { contato, telefone } = separarContato(o.clienteContato);
      const clienteId = clientePorNome(o.clienteNome || 'Cliente sem nome', { contato, telefone });
      if (contato) db.prepare('UPDATE clientes SET contato = COALESCE(contato, ?), telefone = COALESCE(telefone, ?) WHERE id = ?').run(contato, telefone, clienteId);
      const itens = (o.itens || []).map((it) => {
        const preco = centavos(it.valor);
        const qtd = Number(it.qtd) || 1;
        return { descricao: String(it.nome || 'Item').trim(), detalhe: limpo(it.desc), medida: limpo(it.medida), quantidade: qtd, preco_unitario: preco, subtotal: Math.round(qtd * preco) };
      });
      const total = itens.reduce((s, it) => s + it.subtotal, 0);
      const status = o.status === 'aprovado' ? 'aprovado' : o.status === 'recusado' ? 'recusado' : 'proposta';
      const data = /^\d{4}-\d{2}-\d{2}$/.test(o.dataEmissao || '') ? o.dataEmissao : v.hoje();
      // Aprovados entram sem gerar parcelas: o financeiro importado já traz os valores.
      const id = inserir('projetos', {
        cliente_id: clienteId,
        titulo: `${o.categoria ? `${o.categoria} — ` : ''}${o.clienteNome}`,
        status,
        data,
        validade: limpo(o.dataValidade),
        data_aprovacao: status === 'aprovado' ? data : null,
        subtotal: total,
        total,
        forma_pagamento: 'pix',
        parcelas: 1,
        categoria: limpo(o.categoria),
        pagamento_texto: limpo(o.pagamento),
        prazo_texto: limpo(o.prazo),
        condicoes: limpo(o.retirada),
        condicoes_titulo: limpo(o.retirada) ? 'Retirada / devolução' : null,
        termos: limpo(o.obs),
        usuario_id: usuarioId,
      });
      const ins = db.prepare(`INSERT INTO projeto_itens (projeto_id, descricao, detalhe, medida, quantidade, preco_unitario, subtotal)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (const it of itens) ins.run(id, it.descricao, it.detalhe, it.medida, it.quantidade, it.preco_unitario, it.subtotal);
      marcar('projetos', o.id, id);
      resultado.orcamentos++;
    }

    // ---------- Financeiro ----------
    for (const f of dados.financeiro || []) {
      if (jaImportado('lancamentos', f.id)) { resultado.ignorados++; continue; }
      const tipo = f.tipo === 'despesa' ? 'pagar' : 'receber';
      const pago = ['pago', 'recebido'].includes(f.status);
      const valor = centavos(f.valor);
      if (valor <= 0) { resultado.ignorados++; continue; }
      const data = /^\d{4}-\d{2}-\d{2}$/.test(f.data || '') ? f.data : v.hoje();
      const clienteId = f.clienteId ? mapaCliente.get(f.clienteId) ?? jaImportado('clientes', f.clienteId) ?? null : null;
      const categoria = [limpo(f.categoria), limpo(f.vertical)].filter(Boolean).join(' · ') || null;
      const semClienteComNota = f.notaEmitida && !clienteId;
      const id = inserir('lancamentos', {
        tipo,
        descricao: `${String(f.descricao || 'Lançamento').trim()}${semClienteComNota ? ' [NF emitida]' : ''}`,
        categoria,
        valor,
        vencimento: data,
        status: pago ? 'pago' : 'aberto',
        pago_em: pago ? data : null,
        valor_pago: pago ? valor : null,
        cliente_id: tipo === 'receber' ? clienteId : null,
        usuario_id: usuarioId,
      });
      marcar('lancamentos', f.id, id);
      resultado.lancamentos++;

      // Receitas com nota já emitida viram registros de NF (emitidas fora do sistema).
      if (f.notaEmitida && tipo === 'receber' && clienteId) {
        const nf = inserir('notas_fiscais', {
          referencia: `import-${f.id}`,
          cliente_id: clienteId,
          lancamento_id: id,
          discriminacao: String(f.descricao || 'Serviço').trim(),
          valor_servicos: valor,
          status: 'emitida',
          provedor: 'manual',
          data_emissao: data,
          mensagem: `Importada do painel antigo${f.notaFilename ? ` (arquivo: ${f.notaFilename})` : ''}`,
          usuario_id: usuarioId,
        });
        marcar('notas_fiscais', f.id, nf);
        resultado.notas++;
      }
    }
  });

  resultado.nao_importados = {
    agenda: (dados.agenda || []).length,
    tarefas: (dados.tarefas || []).length,
  };
  return resultado;
}

module.exports = { importarPainel, separarContato, separarEndereco };
