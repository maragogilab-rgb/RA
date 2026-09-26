// Contratos recorrentes (fee mensal) e geração das cobranças do mês.
import {
  trocar, GET, POST, PUT, qs, h, R$, dataBR, hoje, selo, modal, formulario, tabela, cabecalho, filtros, btn, aviso,
  deCentavos,
} from './nucleo.js';

export async function contratos(raiz) {
  const clientes = await GET('/clientes?ativo=1');
  const area = h('div');
  const f = filtros([
    { nome: 'ativo', tipo: 'select', rotulo: 'Situação', padrao: '1', opcoes: [['1', 'Ativos'], ['0', 'Encerrados'], ['', 'Todos']] },
  ], carregar);

  async function carregar(filtro = f.valores()) {
    const dados = await GET(`/contratos${qs(filtro)}`);
    const hj = hoje();
    const vigentes = dados.filter((c) => c.ativo && c.inicio <= hj && (!c.fim || c.fim >= hj));
    const pendentes = vigentes.filter((c) => !c.cobrado_mes_atual);
    trocar(area,
      h('div', { class: 'kpis' },
        kpi('Receita recorrente mensal', R$(vigentes.reduce((s, c) => s + c.valor, 0)), `${vigentes.length} contrato(s) vigente(s)`),
        kpi('Cobranças deste mês', pendentes.length ? `${pendentes.length} pendente(s)` : 'Todas geradas', pendentes.length ? 'Clique em "Gerar cobranças do mês"' : '✓ Em dia')),
      tabela([
        { titulo: 'Cliente', valor: (l) => l.cliente_nome },
        { titulo: 'Serviço', valor: (l) => l.descricao },
        { titulo: 'Valor mensal', classe: 'num', valor: (l) => R$(l.valor), csv: (l) => deCentavos(l.valor) },
        { titulo: 'Vence dia', classe: 'num', valor: (l) => l.dia_vencimento },
        { titulo: 'Vigência', valor: (l) => `${dataBR(l.inicio)} → ${l.fim ? dataBR(l.fim) : 'indeterminado'}` },
        { titulo: 'Mês atual', valor: (l) => (!l.ativo ? selo('inativo') : l.cobrado_mes_atual ? selo('Cobrado', 'ok') : selo('Pendente', 'aviso')), csv: (l) => (l.cobrado_mes_atual ? 'Cobrado' : 'Pendente') },
      ], dados, { aoClicar: abrir, nomeArquivo: 'contratos', vazio: 'Nenhum contrato. Cadastre seus clientes de fee mensal (ex.: gestão de redes sociais).' }),
    );
  }

  function abrir(c = {}) {
    const form = formulario([
      { nome: 'cliente_id', rotulo: 'Cliente', tipo: 'select', obrigatorio: true, largura: 'cheio', opcoes: [['', 'Selecione…'], ...clientes.map((x) => [x.id, x.nome])] },
      { nome: 'descricao', rotulo: 'Serviço contratado', obrigatorio: true, largura: 'cheio', placeholder: 'Ex.: Gestão de redes sociais (12 posts/mês)' },
      { nome: 'valor', rotulo: 'Valor mensal (R$)', tipo: 'moeda', obrigatorio: true },
      { nome: 'dia_vencimento', rotulo: 'Dia do vencimento (1 a 28)', tipo: 'number', padrao: 10 },
      { nome: 'inicio', rotulo: 'Início', tipo: 'date', padrao: hoje(), obrigatorio: true },
      { nome: 'fim', rotulo: 'Fim (vazio = indeterminado)', tipo: 'date' },
      { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', largura: 'cheio' },
      { nome: 'ativo', rotulo: 'Ativo', tipo: 'checkbox' },
    ], c);
    modal(c.id ? 'Editar contrato' : 'Novo contrato de fee mensal', form.el, {
      acoes: [
        { texto: 'Cancelar', acao: () => {} },
        { texto: 'Salvar', classe: 'btn-primario', acao: async () => {
          const d = form.ler();
          if (c.id) await PUT(`/contratos/${c.id}`, d); else await POST('/contratos', d);
          aviso('Contrato salvo');
          carregar();
        } },
      ],
    });
  }

  function gerar() {
    const form = formulario([{ nome: 'competencia', rotulo: 'Mês de referência', tipo: 'month', padrao: hoje().slice(0, 7), obrigatorio: true }]);
    modal('Gerar cobranças do mês', h('div', {},
      h('p', {}, 'Cria uma conta a receber para cada contrato ativo no mês escolhido. Contratos já cobrados nesse mês são ignorados, então pode clicar sem medo.'),
      form.el), {
      acoes: [
        { texto: 'Cancelar', acao: () => {} },
        { texto: 'Gerar cobranças', classe: 'btn-primario', acao: async () => {
          const r = await POST('/contratos/gerar-cobrancas', form.ler());
          aviso(r.geradas ? `${r.geradas} cobrança(s) gerada(s): ${R$(r.total)}` : 'Nenhuma cobrança pendente para esse mês');
          carregar();
        } },
      ],
    });
  }

  trocar(raiz,
    cabecalho('Contratos (fee mensal)', btn('Gerar cobranças do mês', gerar), btn('Novo contrato', () => abrir(), 'btn-primario')),
    f.el, area);
  await carregar();
}

function kpi(rotulo, valor, detalhe) {
  return h('div', { class: 'kpi' }, h('span', { class: 'kpi-rotulo' }, rotulo), h('strong', { class: 'kpi-valor' }, valor),
    h('span', { class: 'kpi-detalhe' }, detalhe));
}
