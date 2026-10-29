'use strict';

// Emissão automática de NFS-e.
// A cada ciclo:
//   1. gera as mensalidades (fee) do mês, se ativado;
//   2. cria a nota das contas a receber que chegaram ao momento escolhido (recebimento ou vencimento);
//   3. envia à Focus NFe as notas automáticas que estão com os dados completos;
//   4. consulta as notas que a prefeitura ainda está processando.
// Notas com dados faltando ficam como rascunho e são enviadas sozinhas assim que o cadastro for completado.

const v = require('../validar');
const { lerEmpresa } = require('../modulos/sistema');
const { criarServicoNotas, automaticaConfigurada } = require('../modulos/notas');
const { gerarCobrancas } = require('../modulos/contratos');
const focus = require('./focusnfe');

const LIMITE_POR_CICLO = 20;
const CHAVE_ULTIMO = 'nfse_auto.ultimo';
const GATILHOS = ['recebimento', 'vencimento'];

function criarAutomacao(db, { fetchNfse = globalThis.fetch, requisitarNacional, log = console.log } = {}) {
  const notas = criarServicoNotas(db, { fetchNfse, requisitarNacional });
  let emAndamento = null;
  let timer = null;
  let espera = null;

  const config = () => {
    const empresa = lerEmpresa(db);
    return {
      empresa,
      gatilho: GATILHOS.includes(empresa.nfse_auto) ? empresa.nfse_auto : 'desligado',
      dias: Math.min(30, Math.max(0, Number.parseInt(empresa.nfse_auto_dias, 10) || 0)),
      desde: empresa.nfse_auto_desde || v.hoje(),
      feeAuto: empresa.fee_auto === '1',
      configurada: automaticaConfigurada(empresa),
    };
  };

  // Contas a receber prontas para ganhar nota. Ficam de fora:
  // - as que já têm qualquer nota (mesmo cancelada: aí quem decide é o usuário);
  // - parcelas de projeto que já tem uma nota do projeto inteiro;
  // - lançamentos anteriores à data em que a automação foi ligada.
  const candidatos = ({ gatilho, dias, desde }) => {
    const filtros = `l.tipo = 'receber' AND l.cliente_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM notas_fiscais n WHERE n.lancamento_id = l.id)
      AND NOT (l.projeto_id IS NOT NULL AND EXISTS (SELECT 1 FROM notas_fiscais n2
        WHERE n2.projeto_id = l.projeto_id AND n2.lancamento_id IS NULL AND n2.status != 'cancelada'))`;
    if (gatilho === 'recebimento') {
      return db.prepare(`SELECT l.id FROM lancamentos l WHERE ${filtros} AND l.status = 'pago' AND l.pago_em >= ?
        ORDER BY l.pago_em, l.id LIMIT ?`).all(desde, LIMITE_POR_CICLO);
    }
    if (gatilho === 'vencimento') {
      return db.prepare(`SELECT l.id FROM lancamentos l WHERE ${filtros} AND l.status IN ('aberto', 'pago')
        AND l.vencimento >= ? AND l.vencimento <= ? ORDER BY l.vencimento, l.id LIMIT ?`)
        .all(desde, v.somarDias(v.hoje(), dias), LIMITE_POR_CICLO);
    }
    return [];
  };

  async function ciclo() {
    const c = config();
    const r = { quando: new Date().toISOString(), cobrancas: 0, criadas: 0, enviadas: 0, emitidas: 0, recusadas: 0, aguardando_dados: 0, falhas: [] };
    const contar = (n) => {
      if (n.status === 'emitida') r.emitidas += 1;
      else if (n.status === 'erro') r.recusadas += 1;
    };

    if (c.feeAuto) r.cobrancas = gerarCobrancas(db, v.hoje().slice(0, 7)).geradas;

    if (c.configurada) {
      if (c.gatilho !== 'desligado') {
        for (const { id } of candidatos(c)) {
          try {
            notas.inserir(notas.sugerir({ lancamento_id: id }), { automatica: true });
            r.criadas += 1;
          } catch (e) {
            r.falhas.push(`Conta a receber #${id}: ${e.message}`);
          }
        }
      }

      const enviadasAgora = new Set();
      for (const { id } of db.prepare("SELECT id FROM notas_fiscais WHERE automatica = 1 AND status = 'rascunho' ORDER BY id LIMIT ?").all(LIMITE_POR_CICLO)) {
        if (notas.buscar(id).pendencias.length) { r.aguardando_dados += 1; continue; }
        try {
          const n = await notas.emitir(id);
          enviadasAgora.add(id);
          r.enviadas += 1;
          contar(n);
        } catch (e) {
          r.falhas.push(`Nota #${id}: ${e.message}`);
        }
      }

      for (const { id } of db.prepare("SELECT id FROM notas_fiscais WHERE provedor IN ('focusnfe', 'nacional') AND status = 'processando' ORDER BY id LIMIT ?").all(LIMITE_POR_CICLO)) {
        if (enviadasAgora.has(id)) continue;
        try {
          contar(await notas.consultar(id));
        } catch (e) {
          r.falhas.push(`Nota #${id}: ${e.message}`);
        }
      }
    }

    db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
      .run(CHAVE_ULTIMO, JSON.stringify(r));
    if (r.cobrancas || r.criadas || r.enviadas || r.emitidas || r.recusadas || r.falhas.length) {
      log(`[NFS-e automática] mensalidades: ${r.cobrancas}, notas criadas: ${r.criadas}, enviadas: ${r.enviadas}, `
        + `autorizadas: ${r.emitidas}, recusadas: ${r.recusadas}, aguardando dados: ${r.aguardando_dados}${r.falhas.length ? `, falhas: ${r.falhas.join(' | ')}` : ''}`);
    }
    return r;
  }

  // Um ciclo por vez: chamadas simultâneas aguardam o ciclo em andamento.
  function executar() {
    if (!emAndamento) emAndamento = ciclo().finally(() => { emAndamento = null; });
    return emAndamento;
  }

  function situacao() {
    const c = config();
    let ultimo = null;
    try { ultimo = JSON.parse(db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(CHAVE_ULTIMO)?.valor || 'null'); } catch { /* ignora */ }
    const conta = (sql) => db.prepare(sql).get().n;
    return {
      configurada: c.configurada,
      gatilho: c.gatilho,
      dias: c.dias,
      desde: c.empresa.nfse_auto_desde || null,
      fee_auto: c.feeAuto,
      padrao: c.empresa.nfse_provedor === 'nacional' || focus.apiDaEmpresa(c.empresa) === 'nfsen' ? 'nacional' : 'municipal',
      provedor: c.empresa.nfse_provedor || 'manual',
      ambiente: c.empresa.nfse_ambiente || 'homologacao',
      rodando_no_servidor: Boolean(timer),
      ultimo,
      aguardando_dados: conta("SELECT COUNT(*) AS n FROM notas_fiscais WHERE automatica = 1 AND status = 'rascunho'"),
      processando: conta("SELECT COUNT(*) AS n FROM notas_fiscais WHERE status = 'processando'"),
      recusadas: conta("SELECT COUNT(*) AS n FROM notas_fiscais WHERE automatica = 1 AND status = 'erro'"),
    };
  }

  const seguro = () => executar().catch((e) => log(`[NFS-e automática] erro no ciclo: ${e.message}`));

  return {
    executar: async () => ({ resultado: await executar(), situacao: situacao() }),
    situacao,
    // Pede um ciclo logo após um recebimento ou nova cobrança (só com o agendamento ligado).
    disparar() {
      if (!timer || espera) return;
      espera = setTimeout(() => { espera = null; seguro(); }, 1000);
      espera.unref?.();
    },
    iniciar(intervaloMs = 2 * 60 * 1000) {
      if (timer) return;
      timer = setInterval(seguro, intervaloMs);
      timer.unref?.();
      setTimeout(seguro, 5000).unref?.();
    },
    parar() {
      clearInterval(timer);
      clearTimeout(espera);
      timer = null;
      espera = null;
    },
  };
}

module.exports = { criarAutomacao };
