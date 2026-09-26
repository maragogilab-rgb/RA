import {
  trocar, GET, POST, PUT, qs, h, R$, num, dataBR, hoje, inicioMes, mesBR, selo, modal, confirmar, formulario, tabela, cabecalho,
  filtros, btn, aviso, deCentavos, ROTULOS,
} from './nucleo.js';
import { novaNotaDe } from './notas.js';

const CATEGORIAS = {
  receber: ['Projetos', 'Fee mensal', 'Evento', 'Gráfica', 'Locação', 'Outras receitas'],
  pagar: ['Comissão de parceiro', 'Evento', 'Gráfica', 'Freelancers', 'Locação de equipamentos', 'Equipamentos', 'Softwares e assinaturas', 'Tráfego pago (mídia)', 'Deslocamento',
    'Alimentação/Set', 'Aluguel', 'Água/Luz/Internet', 'Impostos', 'Pró-labore', 'Contabilidade', 'Outros'],
};

export async function financeiro(raiz, params = {}) {
  const tipo = params.tipo === 'pagar' ? 'pagar' : 'receber';
  const [clientes, fornecedores, areas] = await Promise.all([GET('/clientes?ativo=1'), GET('/fornecedores?ativo=1'), GET('/areas')]);
  const area = h('div');
  const f = filtros([
    { nome: 'busca', rotulo: 'Buscar descrição, categoria, cliente…' },
    { nome: 'status', tipo: 'select', rotulo: 'Situação', padrao: 'aberto', opcoes: [['aberto', 'Em aberto'], ['pago', 'Pagos'], ['cancelado', 'Cancelados'], ['', 'Todos']] },
    { nome: 'de', tipo: 'date', rotulo: 'Vencimento de' },
    { nome: 'ate', tipo: 'date', rotulo: 'até' },
  ], carregar);

  async function carregar(filtro = f.valores()) {
    const dados = await GET(`/lancamentos${qs({ ...filtro, tipo })}`);
    const hj = hoje();
    const abertos = dados.filter((l) => l.status === 'aberto');
    const vencidos = abertos.filter((l) => l.vencimento < hj);
    trocar(area,
      h('div', { class: 'resumo-linha' },
        h('span', {}, 'Em aberto: ', h('strong', {}, R$(abertos.reduce((s, l) => s + l.valor, 0)))),
        vencidos.length ? h('span', { class: 'txt-alerta' }, `⚠ Vencidos (${vencidos.length}): `, h('strong', {}, R$(vencidos.reduce((s, l) => s + l.valor, 0)))) : null),
      tabela([
        { titulo: 'Vencimento', valor: (l) => h('span', { class: l.status === 'aberto' && l.vencimento < hj ? 'txt-alerta' : null }, dataBR(l.vencimento)) },
        { titulo: 'Descrição', valor: (l) => l.descricao },
        { titulo: tipo === 'receber' ? 'Cliente' : 'Fornecedor', valor: (l) => l.cliente_nome || l.fornecedor_nome || '' },
        { titulo: 'Categoria', valor: (l) => l.categoria || '' },
        { titulo: 'Valor', classe: 'num', valor: (l) => R$(l.valor), csv: (l) => deCentavos(l.valor) },
        { titulo: 'Situação', valor: (l) => (l.status === 'aberto' && l.vencimento < hj ? selo('Vencido', 'erro') : selo(l.status)), csv: (l) => ROTULOS[l.status] },
        { titulo: 'Pago em', valor: (l) => (l.pago_em ? `${dataBR(l.pago_em)} (${R$(l.valor_pago)})` : '') },
        { titulo: '', classe: 'acoes-linha', csv: false, valor: acoesLinha },
      ], dados, { nomeArquivo: `contas-a-${tipo}`, aoClicar: (l) => l.status === 'aberto' && abrir(l) }),
    );
  }

  function acoesLinha(l) {
    const out = [];
    if (l.status === 'aberto') {
      out.push(btn(tipo === 'receber' ? 'Receber' : 'Pagar', () => baixar(l), 'btn-pequeno btn-primario'));
      if (l.origem !== 'projeto') {
        out.push(btn('Cancelar', async () => {
          if (!await confirmar(`Cancelar o lançamento "${l.descricao}"?`, 'Cancelar lançamento', 'btn-perigo')) return;
          try { await POST(`/lancamentos/${l.id}/cancelar`); aviso('Lançamento cancelado'); carregar(); } catch (e) { aviso(e.message, 'erro'); }
        }, 'btn-pequeno btn-fantasma'));
      }
    } else if (l.status === 'pago') {
      out.push(btn('Estornar', async () => {
        if (!await confirmar(`Estornar o pagamento de "${l.descricao}"? Ele voltará a ficar em aberto.`, 'Estornar')) return;
        try { await POST(`/lancamentos/${l.id}/estornar`); aviso('Pagamento estornado'); carregar(); } catch (e) { aviso(e.message, 'erro'); }
      }, 'btn-pequeno btn-fantasma'));
    }
    if (tipo === 'receber' && l.status !== 'cancelado') out.push(btn('NF', () => novaNotaDe({ lancamento_id: l.id }), 'btn-pequeno btn-fantasma'));
    if (l.projeto_id) out.push(h('a', { href: `#/projetos/${l.projeto_id}`, class: 'link-pequeno' }, `Projeto #${l.projeto_id}`));
    if (l.contrato_id) out.push(h('a', { href: '#/contratos', class: 'link-pequeno' }, 'Contrato'));
    return h('div', { class: 'grupo-acoes' }, out);
  }

  function baixar(l) {
    const form = formulario([
      { nome: 'data', rotulo: 'Data do pagamento', tipo: 'date', padrao: hoje(), obrigatorio: true },
      { nome: 'valor_pago', rotulo: 'Valor pago (R$)', tipo: 'moeda' },
    ], { valor_pago: l.valor });
    modal(`${tipo === 'receber' ? 'Receber' : 'Pagar'}: ${l.descricao}`, form.el, {
      acoes: [
        { texto: 'Cancelar', acao: () => {} },
        { texto: 'Confirmar baixa', classe: 'btn-primario', acao: async () => {
          await POST(`/lancamentos/${l.id}/pagar`, form.ler());
          aviso('Baixa registrada');
          carregar();
        } },
      ],
    });
  }

  function abrir(l = {}) {
    const pessoas = tipo === 'receber'
      ? { nome: 'cliente_id', rotulo: 'Cliente', tipo: 'select', opcoes: [['', '—'], ...clientes.map((c) => [c.id, c.nome])] }
      : { nome: 'fornecedor_id', rotulo: 'Fornecedor', tipo: 'select', opcoes: [['', '—'], ...fornecedores.map((c) => [c.id, c.nome])] };
    const form = formulario([
      { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true, largura: 'cheio', max: 300 },
      { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', obrigatorio: true },
      { nome: 'vencimento', rotulo: 'Vencimento', tipo: 'date', padrao: hoje(), obrigatorio: true },
      { nome: 'categoria', rotulo: 'Categoria', tipo: 'select', opcoes: [['', '—'], ...[...new Set([...CATEGORIAS[tipo], ...(l.categoria ? [l.categoria] : [])])].map((c) => [c, c])] },
      pessoas,
      { nome: 'area', rotulo: 'Área de negócio', tipo: 'select', largura: 'cheio', opcoes: [['', '—'], ...areas.map((a) => [a, a])] },
    ], l);
    modal(l.id ? 'Editar lançamento' : `Nova conta a ${tipo}`, form.el, {
      acoes: [
        { texto: 'Cancelar', acao: () => {} },
        { texto: 'Salvar', classe: 'btn-primario', acao: async () => {
          const d = { ...form.ler(), tipo };
          if (!d.valor) throw new Error('Informe o valor');
          if (l.id) await PUT(`/lancamentos/${l.id}`, d);
          else await POST('/lancamentos', d);
          aviso('Lançamento salvo');
          carregar();
        } },
      ],
    });
  }

  trocar(raiz,
    cabecalho('Financeiro', btn(`Nova conta a ${tipo}`, () => abrir(), 'btn-primario')),
    h('nav', { class: 'abas', 'aria-label': 'Tipo de conta' },
      h('a', { href: '#/financeiro/receber', class: tipo === 'receber' ? 'ativa' : null, 'aria-current': tipo === 'receber' ? 'page' : null }, 'Contas a receber'),
      h('a', { href: '#/financeiro/pagar', class: tipo === 'pagar' ? 'ativa' : null, 'aria-current': tipo === 'pagar' ? 'page' : null }, 'Contas a pagar'),
      h('a', { href: '#/fluxo' }, 'Fluxo de caixa')),
    f.el,
    area,
  );
  await carregar();
}

export async function fluxo(raiz) {
  const ano = hoje().slice(0, 4);
  const area = h('div');
  const f = filtros([
    { nome: 'de', tipo: 'date', rotulo: 'De', padrao: `${ano}-01-01` },
    { nome: 'ate', tipo: 'date', rotulo: 'Até', padrao: `${ano}-12-31` },
  ], carregar);

  async function carregar(filtro = f.valores()) {
    const dados = await GET(`/financeiro/fluxo${qs(filtro)}`);
    let acumulado = 0;
    const linhas = dados.map((m) => { acumulado += m.saldo; return { ...m, acumulado }; });
    const soma = (k) => linhas.reduce((s, l) => s + l[k], 0);
    const cor = (v) => h('span', { class: v < 0 ? 'txt-negativo' : null }, R$(v));
    trocar(area,
      h('div', { class: 'kpis' },
        kpi('Entradas realizadas', R$(soma('entradas'))),
        kpi('Saídas realizadas', R$(soma('saidas'))),
        kpi('Saldo realizado', R$(soma('saldo')), soma('saldo') < 0 ? 'negativo' : null),
        kpi('Saldo previsto (em aberto)', R$(soma('a_receber') - soma('a_pagar')), soma('a_receber') < soma('a_pagar') ? 'negativo' : null)),
      tabela([
        { titulo: 'Mês', valor: (l) => mesBR(l.mes) },
        { titulo: 'Entradas', classe: 'num', valor: (l) => R$(l.entradas), csv: (l) => deCentavos(l.entradas) },
        { titulo: 'Saídas', classe: 'num', valor: (l) => R$(l.saidas), csv: (l) => deCentavos(l.saidas) },
        { titulo: 'Saldo do mês', classe: 'num', valor: (l) => cor(l.saldo), csv: (l) => deCentavos(l.saldo) },
        { titulo: 'Saldo acumulado', classe: 'num', valor: (l) => cor(l.acumulado), csv: (l) => deCentavos(l.acumulado) },
        { titulo: 'A receber', classe: 'num', valor: (l) => R$(l.a_receber), csv: (l) => deCentavos(l.a_receber) },
        { titulo: 'A pagar', classe: 'num', valor: (l) => R$(l.a_pagar), csv: (l) => deCentavos(l.a_pagar) },
      ], linhas, { nomeArquivo: 'fluxo-de-caixa', vazio: 'Sem movimentação no período.' }),
      h('p', { class: 'mudo nota' }, 'Entradas e saídas consideram lançamentos pagos pela data do pagamento; valores em aberto pela data de vencimento.'),
    );
  }

  trocar(raiz,
    cabecalho('Fluxo de caixa'),
    h('nav', { class: 'abas', 'aria-label': 'Financeiro' },
      h('a', { href: '#/financeiro/receber' }, 'Contas a receber'),
      h('a', { href: '#/financeiro/pagar' }, 'Contas a pagar'),
      h('a', { href: '#/fluxo', class: 'ativa', 'aria-current': 'page' }, 'Fluxo de caixa')),
    f.el, area);
  await carregar();
}

export function kpi(rotulo, valor, tom, detalhe) {
  return h('div', { class: `kpi${tom ? ` kpi-${tom}` : ''}` },
    h('span', { class: 'kpi-rotulo' }, rotulo),
    h('strong', { class: 'kpi-valor' }, valor),
    detalhe ? h('span', { class: 'kpi-detalhe' }, detalhe) : null);
}

// ---------- Relatórios ----------
export async function relatorios(raiz) {
  const area = h('div');
  const pct = (n) => `${String(n).replace('.', ',')}%`;
  const RELS = {
    'lucro-por-projeto': {
      titulo: 'Lucro por projeto (aprovados no período)',
      colunas: [
        { titulo: 'Nº', valor: (l) => h('a', { href: `#/projetos/${l.id}` }, `#${l.id}`), csv: (l) => l.id },
        { titulo: 'Projeto', valor: (l) => l.titulo },
        { titulo: 'Cliente', valor: (l) => l.cliente_nome },
        { titulo: 'Receita', classe: 'num', valor: (l) => R$(l.receita), csv: (l) => deCentavos(l.receita) },
        { titulo: 'Custos', classe: 'num', valor: (l) => R$(l.custos), csv: (l) => deCentavos(l.custos) },
        { titulo: 'Lucro', classe: 'num', valor: (l) => h('span', { class: l.lucro < 0 ? 'txt-negativo' : null }, R$(l.lucro)), csv: (l) => deCentavos(l.lucro) },
        { titulo: 'Margem', classe: 'num', valor: (l) => pct(l.margem) },
      ],
    },
    'faturamento-por-cliente': {
      titulo: 'Faturamento por cliente (vencimentos no período)',
      colunas: [
        { titulo: 'Cliente', valor: (l) => l.nome },
        { titulo: 'Projetos', classe: 'num', valor: (l) => R$(l.projetos), csv: (l) => deCentavos(l.projetos) },
        { titulo: 'Fee mensal', classe: 'num', valor: (l) => R$(l.recorrente), csv: (l) => deCentavos(l.recorrente) },
        { titulo: 'Total', classe: 'num', valor: (l) => R$(l.total), csv: (l) => deCentavos(l.total) },
        { titulo: 'Já recebido', classe: 'num', valor: (l) => R$(l.recebido), csv: (l) => deCentavos(l.recebido) },
      ],
    },
    'faturamento-por-servico': {
      titulo: 'Serviços mais vendidos (projetos aprovados no período)',
      colunas: [
        { titulo: 'Serviço', valor: (l) => l.servico },
        { titulo: 'Categoria', valor: (l) => l.categoria || '' },
        { titulo: 'Projetos', classe: 'num', valor: (l) => l.projetos },
        { titulo: 'Quantidade', classe: 'num', valor: (l) => num(l.quantidade) },
        { titulo: 'Total', classe: 'num', valor: (l) => R$(l.total), csv: (l) => deCentavos(l.total) },
      ],
    },
    'despesas-por-categoria': {
      titulo: 'Receitas e despesas por categoria (pagas no período)',
      colunas: [
        { titulo: 'Tipo', valor: (l) => (l.tipo === 'receber' ? 'Receita' : 'Despesa') },
        { titulo: 'Categoria', valor: (l) => l.categoria },
        { titulo: 'Lançamentos', classe: 'num', valor: (l) => l.qtd },
        { titulo: 'Total pago', classe: 'num', valor: (l) => R$(l.total), csv: (l) => deCentavos(l.total) },
      ],
    },
  };
  const f = filtros([
    { nome: 'relatorio', tipo: 'select', rotulo: 'Relatório', opcoes: Object.entries(RELS).map(([k, r]) => [k, r.titulo]) },
    { nome: 'de', tipo: 'date', rotulo: 'De', padrao: inicioMes() },
    { nome: 'ate', tipo: 'date', rotulo: 'Até', padrao: hoje() },
  ], carregar);

  async function carregar({ relatorio, de, ate } = f.valores()) {
    const rel = RELS[relatorio];
    const dados = await GET(`/relatorios/${relatorio}${qs({ de, ate })}`);
    trocar(area, h('h2', { class: 'secao' }, `${rel.titulo} — ${dataBR(de)} a ${dataBR(ate)}`),
      tabela(rel.colunas, dados, { nomeArquivo: relatorio, vazio: 'Sem dados no período.' }));
  }

  trocar(raiz, cabecalho('Relatórios', btn('Imprimir', () => window.print())), f.el, area);
  await carregar();
}
