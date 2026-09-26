// Propostas e projetos (jobs): da proposta ao cliente até a entrega, com receitas, custos e lucro.
import {
  trocar, GET, POST, PUT, qs, h, R$, num, dataBR, hoje, selo, modal, confirmar, formulario, tabela, cabecalho, filtros, btn, aviso,
  paraCentavos, deCentavos, paraNumero, ROTULOS, estado,
} from './nucleo.js';
import { novaNotaDe } from './notas.js';

const ETAPAS = ['aprovado', 'producao', 'revisao', 'entregue'];
const FORMAS = ['pix', 'transferencia', 'boleto', 'cartao', 'dinheiro'];
const CATEGORIAS_CUSTO = ['Freelancers', 'Locação de equipamentos', 'Deslocamento', 'Alimentação/Set', 'Trilha/Banco de imagens', 'Tráfego pago (mídia)', 'Impressão', 'Outros'];
const somarDias = (iso, dias) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

// ---------- Lista ----------
export async function lista(raiz) {
  const area = h('div');
  const f = filtros([
    { nome: 'busca', rotulo: 'Buscar por título, cliente ou nº…' },
    { nome: 'status', tipo: 'select', rotulo: 'Situação', padrao: '', opcoes: [
      ['', 'Todos'], ['proposta', 'Propostas'], ['andamento', 'Em andamento'], ['entregue', 'Entregues'], ['recusado', 'Recusados'], ['cancelado', 'Cancelados'],
    ] },
  ], carregar);

  async function carregar(filtro = f.valores()) {
    const dados = await GET(`/projetos${qs(filtro)}`);
    const hj = hoje();
    const soma = (st) => dados.filter((p) => st.includes(p.status));
    const propostas = soma(['proposta']);
    const andamento = soma(['aprovado', 'producao', 'revisao']);
    trocar(area,
      h('div', { class: 'resumo-linha' },
        h('span', {}, `${propostas.length} proposta(s) em aberto: `, h('strong', {}, R$(propostas.reduce((s, p) => s + p.total, 0)))),
        h('span', {}, `${andamento.length} job(s) em andamento: `, h('strong', {}, R$(andamento.reduce((s, p) => s + p.total, 0))))),
      tabela([
        { titulo: 'Nº', valor: (l) => `#${l.id}` },
        { titulo: 'Projeto', valor: (l) => h('div', {}, h('strong', {}, l.titulo), h('small', { class: 'mudo bloco' }, l.cliente_nome)), csv: (l) => l.titulo },
        { titulo: 'Cliente', classe: 'so-csv', valor: (l) => l.cliente_nome },
        { titulo: 'Entrega', valor: (l) => {
          if (!l.prazo_entrega) return '—';
          const atrasado = ['aprovado', 'producao', 'revisao'].includes(l.status) && l.prazo_entrega < hj;
          return h('span', { class: atrasado ? 'txt-alerta' : null }, atrasado ? '⚠ ' : '', dataBR(l.prazo_entrega));
        }, csv: (l) => dataBR(l.prazo_entrega) },
        { titulo: 'Valor', classe: 'num', valor: (l) => R$(l.total), csv: (l) => deCentavos(l.total) },
        { titulo: 'Custos', classe: 'num', valor: (l) => (l.custos ? R$(l.custos) : '—'), csv: (l) => deCentavos(l.custos) },
        { titulo: 'Situação', valor: (l) => selo(l.status), csv: (l) => ROTULOS[l.status] },
      ], dados, { aoClicar: (l) => { location.hash = `#/projetos/${l.id}`; }, nomeArquivo: 'projetos', vazio: 'Nenhum projeto. Crie sua primeira proposta!' }),
    );
  }

  trocar(raiz, cabecalho('Orçamentos e projetos', btn('Novo orçamento', () => { location.hash = '#/projetos/novo'; }, 'btn-primario')), f.el, area);
  await carregar();
}

// ---------- Editor de proposta ----------
export async function editor(raiz, { id } = {}) {
  const [clientes, servicos, proj] = await Promise.all([
    GET('/clientes?ativo=1'), GET('/servicos?ativo=1'), id ? GET(`/projetos/${id}`) : null,
  ]);
  if (proj && proj.status !== 'proposta') { location.hash = `#/projetos/${id}`; return; }
  const porId = new Map(servicos.map((s) => [s.id, s]));
  const el = (tag, attrs, valor) => { const e = h(tag, attrs); if (valor !== undefined) e.value = valor ?? ''; return e; };

  const selCliente = h('select', { id: 'p-cliente' }, h('option', { value: '' }, 'Selecione…'),
    clientes.map((c) => h('option', { value: c.id, selected: proj?.cliente_id === c.id }, c.nome)));
  const inTitulo = el('input', { id: 'p-titulo', maxlength: 200, placeholder: 'Ex.: Vídeo institucional + 4 reels' }, proj?.titulo);
  const inDesc = el('textarea', { id: 'p-desc', rows: 4, placeholder: 'Objetivo, briefing, o que será entregue…' }, proj?.descricao);
  const inData = el('input', { id: 'p-data', type: 'date' }, proj?.data || hoje());
  const inValidade = el('input', { id: 'p-validade', type: 'date' }, proj?.validade || somarDias(hoje(), 15));
  const inPrazo = el('input', { id: 'p-prazo', type: 'date' }, proj?.prazo_entrega);
  const selForma = h('select', { id: 'p-forma' }, FORMAS.map((f) => h('option', { value: f, selected: proj?.forma_pagamento === f }, ROTULOS[f])));
  const inParcelas = el('input', { id: 'p-parcelas', type: 'number', min: 1, max: 36 }, proj?.parcelas || 1);
  const inPrimeiro = el('input', { id: 'p-primeiro', type: 'date' }, proj?.primeiro_vencimento);
  const inDesconto = el('input', { id: 'p-desconto', inputmode: 'decimal', placeholder: '0,00' }, proj?.desconto ? deCentavos(proj.desconto) : '');
  const inCond = el('textarea', { id: 'p-cond', rows: 2, placeholder: 'Ex.: 50% na aprovação e 50% na entrega. Inclui 2 rodadas de ajustes.' }, proj?.condicoes);
  const inObs = el('textarea', { id: 'p-obs', rows: 2, placeholder: 'Anotações internas (não aparecem na proposta)' }, proj?.observacoes);
  const inCategoria = el('input', { id: 'p-categoria', list: 'categorias-orc', placeholder: 'Ex.: Locação de itens / Festas' }, proj?.categoria);
  const inPagTexto = el('input', { id: 'p-pagtexto', placeholder: 'Ex.: Pix à vista ou 50% de entrada + 50% na entrega' }, proj?.pagamento_texto);
  const inPrazoTexto = el('input', { id: 'p-prazotexto', placeholder: 'Ex.: 5 dias úteis após aprovação da arte' }, proj?.prazo_texto);
  const inCondTitulo = el('input', { id: 'p-condtitulo', placeholder: 'Condições', list: 'titulos-cond' }, proj?.condicoes_titulo);
  const inTermos = el('textarea', { id: 'p-termos', rows: 5 }, proj ? proj.termos : (estado.empresa?.termos_orcamento || ''));

  const corpoItens = h('tbody');
  const totais = h('div', { class: 'totais' });

  function linhaItem(item = {}) {
    const sel = h('select', { 'aria-label': 'Serviço' }, h('option', { value: '' }, 'Serviço avulso (descreva abaixo)'),
      servicos.map((s) => h('option', { value: s.id, selected: item.servico_id === s.id }, `${s.nome} — ${R$(s.preco)}/${ROTULOS[s.unidade]}`)));
    const desc = el('input', { 'aria-label': 'Nome do item', placeholder: 'Nome do item' }, item.descricao);
    const detalhe = el('input', { 'aria-label': 'Detalhe', placeholder: 'Detalhe (opcional) — ex.: Animadores e pintura facial', class: 'sub' }, item.detalhe);
    const medida = el('input', { 'aria-label': 'Medida', placeholder: 'ex.: 2 horas' }, item.medida);
    const qtd = el('input', { inputmode: 'decimal', 'aria-label': 'Quantidade' }, item.quantidade ? String(item.quantidade).replace('.', ',') : '1');
    const preco = el('input', { inputmode: 'decimal', 'aria-label': 'Valor unitário', placeholder: '0,00' }, item.preco_unitario !== undefined ? deCentavos(item.preco_unitario) : '');
    const sub = h('td', { class: 'num', 'data-rotulo': 'Subtotal' });
    const tr = h('tr', {},
      h('td', { 'data-rotulo': 'Serviço' }, sel, desc, detalhe),
      h('td', { 'data-rotulo': 'Qtd.' }, qtd),
      h('td', { 'data-rotulo': 'Medida' }, medida),
      h('td', { 'data-rotulo': 'Valor unit.' }, preco),
      sub,
      h('td', {}, h('button', { class: 'btn-icone', type: 'button', 'aria-label': 'Remover item', onclick: () => { tr.remove(); recalcular(); } }, '×')));
    tr.ler = () => ({
      servico_id: Number(sel.value) || null, descricao: desc.value, detalhe: detalhe.value, medida: medida.value,
      quantidade: paraNumero(qtd.value), preco_unitario: paraCentavos(preco.value),
    });
    tr.sub = sub;
    sel.addEventListener('change', () => {
      const s = porId.get(Number(sel.value));
      if (s) { preco.value = deCentavos(s.preco); desc.value = s.nome; if (!medida.value && s.unidade !== 'projeto' && s.unidade !== 'unidade') medida.value = ROTULOS[s.unidade]; }
      recalcular();
    });
    qtd.addEventListener('input', recalcular);
    preco.addEventListener('input', recalcular);
    corpoItens.append(tr);
    return sel;
  }

  function recalcular() {
    let subtotal = 0;
    for (const tr of corpoItens.children) {
      let val = 0;
      try { const it = tr.ler(); val = Number.isNaN(it.quantidade) ? 0 : Math.round(it.quantidade * it.preco_unitario); } catch { val = 0; }
      tr.sub.textContent = R$(val);
      subtotal += val;
    }
    let desconto = 0;
    try { desconto = paraCentavos(inDesconto.value); } catch { desconto = 0; }
    const n = Math.max(1, Number(inParcelas.value) || 1);
    const total = subtotal - desconto;
    trocar(totais,
      h('div', {}, h('span', {}, 'Subtotal'), h('span', {}, R$(subtotal))),
      desconto ? h('div', {}, h('span', {}, 'Desconto'), h('span', {}, `− ${R$(desconto)}`)) : null,
      h('div', { class: 'total' }, h('span', {}, 'Total'), h('span', {}, R$(total))),
      n > 1 ? h('div', { class: 'mudo' }, h('span', {}, 'Parcelamento'), h('span', {}, `${n}x de ${R$(Math.floor(total / n))}`)) : null);
  }
  inDesconto.addEventListener('input', recalcular);
  inParcelas.addEventListener('input', recalcular);
  (proj?.itens?.length ? proj.itens : [{}]).forEach((it) => linhaItem(it));
  recalcular();

  async function salvar() {
    try {
      if (!selCliente.value) { selCliente.focus(); throw new Error('Selecione o cliente'); }
      if (!inTitulo.value.trim()) { inTitulo.focus(); throw new Error('Dê um título ao projeto'); }
      const itens = [...corpoItens.children].map((tr) => tr.ler()).filter((it) => it.servico_id || it.descricao.trim());
      if (!itens.length) throw new Error('Adicione ao menos um serviço');
      if (itens.some((it) => Number.isNaN(it.quantidade) || it.quantidade <= 0)) throw new Error('Verifique as quantidades');
      const corpo = {
        cliente_id: Number(selCliente.value), titulo: inTitulo.value, descricao: inDesc.value, data: inData.value,
        validade: inValidade.value, prazo_entrega: inPrazo.value, forma_pagamento: selForma.value,
        parcelas: Number(inParcelas.value) || 1, primeiro_vencimento: inPrimeiro.value,
        desconto: paraCentavos(inDesconto.value), condicoes: inCond.value, observacoes: inObs.value, itens,
        categoria: inCategoria.value, pagamento_texto: inPagTexto.value, prazo_texto: inPrazoTexto.value,
        condicoes_titulo: inCondTitulo.value, termos: inTermos.value,
      };
      const r = proj ? await PUT(`/projetos/${proj.id}`, corpo) : await POST('/projetos', corpo);
      aviso(`Orçamento #${r.id} salvo`);
      location.hash = `#/projetos/${r.id}`;
    } catch (e) {
      aviso(e.message, 'erro');
    }
  }

  const campo = (rotulo, e, classe = '') => h('div', { class: `campo ${classe}` }, h('label', { for: e.id }, rotulo), e);
  trocar(raiz,
    cabecalho(proj ? `Editar orçamento #${proj.id}` : 'Novo orçamento', btn('Voltar', () => history.back(), 'btn-fantasma')),
    h('section', { class: 'cartao' }, h('h2', { class: 'secao' }, 'Projeto'), h('div', { class: 'form-grade' },
      campo('Cliente', selCliente, 'campo-cheio'),
      campo('Título do projeto', inTitulo),
      campo('Categoria (aparece no topo do orçamento)', inCategoria),
      campo('Descrição / escopo (aparece na proposta)', inDesc, 'campo-cheio'),
      campo('Data da proposta', inData),
      campo('Proposta válida até', inValidade),
      campo('Prazo de entrega', inPrazo))),
    h('section', { class: 'cartao' },
      h('h2', { class: 'secao' }, 'Serviços'),
      h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela-itens' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Serviço'), h('th', {}, 'Qtd.'), h('th', {}, 'Medida'), h('th', {}, 'Valor unit.'), h('th', { class: 'num' }, 'Subtotal'), h('th', {}))),
        corpoItens)),
      btn('+ Adicionar serviço', () => linhaItem().focus(), 'btn-fantasma'),
      totais),
    h('section', { class: 'cartao' }, h('h2', { class: 'secao' }, 'Pagamento'), h('div', { class: 'form-grade' },
      campo('Forma de pagamento', selForma),
      campo('Parcelas', inParcelas),
      campo('1º vencimento (padrão: data da aprovação)', inPrimeiro),
      campo('Desconto (R$)', inDesconto),
      campo('Pagamento — texto do orçamento (opcional, substitui a forma acima)', inPagTexto, 'campo-cheio'),
      campo('Prazo — texto do orçamento', inPrazoTexto, 'campo-cheio'),
      campo('Título do bloco de condições', inCondTitulo),
      campo('Texto das condições', inCond, 'campo-cheio'),
      campo('Termos / observações do orçamento (uma por linha)', inTermos, 'campo-cheio'),
      campo('Observações internas', inObs, 'campo-cheio')),
      h('datalist', { id: 'categorias-orc' }, ['Locação de itens / Festas', 'Gráfica', 'Cobertura de evento', 'Casamento', 'Audiovisual', 'Social media', 'Corporativo'].map((c) => h('option', { value: c }))),
      h('datalist', { id: 'titulos-cond' }, ['Condições', 'Retirada / devolução', 'Entrega', 'O que está incluso'].map((c) => h('option', { value: c })))),
    h('div', { class: 'barra-final' },
      btn('Salvar orçamento', salvar, 'btn-primario')),
  );
}

// ---------- Detalhe ----------
export async function detalhe(raiz, { id }) {
  const p = await GET(`/projetos/${id}`);
  const empresa = estado.empresa || {};
  const hj = hoje();
  const executar = (fn) => async () => { try { await fn(); estado.recarregar(); } catch (e) { aviso(e.message, 'erro'); } };
  const ativo = ETAPAS.includes(p.status) && p.status !== 'entregue';

  const aprovar = () => {
    const form = formulario([
      { nome: 'primeiro_vencimento', rotulo: '1º vencimento', tipo: 'date', obrigatorio: true, padrao: p.primeiro_vencimento || hj },
    ]);
    modal('Aprovar proposta', h('div', {},
      h('p', {}, `Ao aprovar, serão geradas ${p.parcelas} parcela(s) a receber totalizando ${R$(p.total)}, com vencimentos mensais.`),
      form.el), {
      acoes: [
        { texto: 'Voltar', acao: () => {} },
        { texto: 'Aprovar proposta', classe: 'btn-primario', acao: async () => {
          await POST(`/projetos/${id}/aprovar`, form.ler());
          aviso('Proposta aprovada! Job em andamento.');
          estado.recarregar();
        } },
      ],
    });
  };

  const adicionarCusto = async () => {
    const fornecedores = await GET('/fornecedores?ativo=1');
    const form = formulario([
      { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true, largura: 'cheio', placeholder: 'Ex.: Diária de cinegrafista' },
      { nome: 'fornecedor_id', rotulo: 'Fornecedor / freelancer', tipo: 'select', opcoes: [['', '—'], ...fornecedores.map((f) => [f.id, f.nome])] },
      { nome: 'categoria', rotulo: 'Categoria', tipo: 'select', opcoes: CATEGORIAS_CUSTO.map((c) => [c, c]) },
      { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'moeda', obrigatorio: true },
      { nome: 'vencimento', rotulo: 'Vencimento', tipo: 'date', padrao: hj, obrigatorio: true },
      { nome: 'pago', rotulo: 'Já foi pago', tipo: 'checkbox', padrao: false },
    ]);
    modal('Adicionar custo ao projeto', form.el, {
      acoes: [
        { texto: 'Cancelar', acao: () => {} },
        { texto: 'Adicionar', classe: 'btn-primario', acao: async () => {
          const d = form.ler();
          if (!d.valor) throw new Error('Informe o valor');
          await POST('/lancamentos', { ...d, tipo: 'pagar', projeto_id: p.id, pago_em: d.vencimento });
          aviso('Custo adicionado');
          estado.recarregar();
        } },
      ],
    });
  };

  const gerarPdf = () => window.open(`/orcamento.html?id=${p.id}&imprimir=1`, '_blank', 'noopener');
  const acoes = [btn('Voltar', () => { location.hash = '#/projetos'; }, 'btn-fantasma'), btn('Gerar orçamento (PDF)', gerarPdf, p.status === 'proposta' ? 'btn-primario' : '')];
  if (p.status === 'proposta') {
    acoes.push(btn('Editar', () => { location.hash = `#/projetos/${id}/editar`; }));
    acoes.push(btn('Recusada', executar(async () => {
      if (!await confirmar('Marcar a proposta como recusada pelo cliente?', 'Marcar recusada', 'btn-perigo')) return;
      await POST(`/projetos/${id}/recusar`);
    }), 'btn-fantasma'));
    acoes.push(btn('Aprovar proposta', aprovar));
  } else if (ETAPAS.includes(p.status)) {
    acoes.push(btn('+ Custo', adicionarCusto));
    acoes.push(btn('Emitir NF', () => novaNotaDe({ projeto_id: p.id }), 'btn-primario'));
  }
  acoes.push(btn('Duplicar', executar(async () => {
    const n = await POST(`/projetos/${id}/duplicar`);
    aviso(`Criada a proposta #${n.id}`);
    location.hash = `#/projetos/${n.id}/editar`;
  }), 'btn-fantasma'));
  if (p.status === 'proposta' || ativo) {
    acoes.push(btn('Cancelar', executar(async () => {
      const extra = p.status === 'proposta' ? '' : ' As parcelas em aberto serão canceladas.';
      if (!await confirmar(`Cancelar o projeto #${id}?${extra}`, 'Cancelar projeto', 'btn-perigo')) return;
      await POST(`/projetos/${id}/cancelar`);
      aviso('Projeto cancelado');
    }), 'btn-perigo'));
  }

  // Linha do tempo das etapas: clicar muda a etapa.
  const etapas = ETAPAS.includes(p.status) ? h('nav', { class: 'etapas', 'aria-label': 'Etapa do projeto' }, ETAPAS.map((e, i) => {
    const idx = ETAPAS.indexOf(p.status);
    const classe = i < idx ? 'feita' : i === idx ? 'atual' : '';
    return h('button', {
      class: `etapa ${classe}`, 'aria-current': i === idx ? 'step' : null, disabled: i === idx,
      onclick: executar(async () => {
        await POST(`/projetos/${id}/etapa`, { status: e });
        aviso(`Projeto: ${ROTULOS[e]}`);
      }),
    }, h('span', { class: 'etapa-num' }, i < idx ? '✓' : String(i + 1)), ROTULOS[e]);
  })) : null;

  const info = (rotulo, valor) => h('div', { class: 'info' }, h('span', {}, rotulo), h('strong', {}, valor));
  const r = p.resumo;
  const listaLanc = (itens, tipo) => tabela([
    { titulo: 'Descrição', valor: (l) => h('div', {}, l.descricao, l.fornecedor_nome ? h('small', { class: 'mudo bloco' }, l.fornecedor_nome) : null) },
    { titulo: 'Vencimento', valor: (l) => h('span', { class: l.status === 'aberto' && l.vencimento < hj ? 'txt-alerta' : null }, dataBR(l.vencimento)) },
    { titulo: 'Valor', classe: 'num', valor: (l) => R$(l.valor) },
    { titulo: 'Situação', valor: (l) => selo(l.status) },
  ], itens, { vazio: tipo === 'pagar' ? 'Nenhum custo lançado. Use "+ Custo" para registrar freelancers, locações etc.' : 'Sem parcelas.' });

  trocar(raiz,
    // Cabeçalho que só aparece na impressão (proposta comercial).
    h('div', { class: 'so-impressao cabecalho-impressao' },
      h('strong', {}, empresa.nome || 'Maragogi Lab'),
      h('div', {}, [empresa.cnpj && `CNPJ ${empresa.cnpj}`, empresa.telefone, empresa.email].filter(Boolean).join(' · ')),
      empresa.endereco ? h('div', {}, empresa.endereco) : null),
    cabecalho(`${p.status === 'proposta' ? 'Orçamento' : 'Projeto'} #${p.id} · ${p.titulo}`, ...acoes),
    etapas,
    h('section', { class: 'cartao' }, h('div', { class: 'grade-info' },
      info('Cliente', p.cliente_nome),
      p.cliente_documento ? info('CPF/CNPJ', p.cliente_documento) : null,
      info('Data da proposta', dataBR(p.data)),
      p.status === 'proposta' && p.validade ? info('Válida até', dataBR(p.validade)) : null,
      p.prazo_entrega ? info('Prazo de entrega', dataBR(p.prazo_entrega)) : null,
      p.data_aprovacao ? info('Aprovado em', dataBR(p.data_aprovacao)) : null,
      p.data_entrega ? info('Entregue em', dataBR(p.data_entrega)) : null,
      info('Situação', selo(p.status)),
      info('Pagamento', `${ROTULOS[p.forma_pagamento] || ''}${p.parcelas > 1 ? ` em ${p.parcelas}x` : ' à vista'}`)),
      p.descricao ? h('div', { class: 'escopo' }, h('h3', {}, 'Escopo'), h('p', {}, p.descricao)) : null),
    h('section', { class: 'cartao' },
      h('h2', { class: 'secao' }, 'Serviços'),
      tabela([
        { titulo: 'Serviço', valor: (l) => h('div', {}, l.descricao, l.detalhe ? h('small', { class: 'mudo bloco' }, l.detalhe) : null) },
        { titulo: 'Qtd.', classe: 'num', valor: (l) => num(l.quantidade) },
        { titulo: 'Medida', valor: (l) => l.medida || '—' },
        { titulo: 'Valor unit.', classe: 'num', valor: (l) => R$(l.preco_unitario) },
        { titulo: 'Subtotal', classe: 'num', valor: (l) => R$(l.subtotal) },
      ], p.itens),
      h('div', { class: 'totais' },
        h('div', {}, h('span', {}, 'Subtotal'), h('span', {}, R$(p.subtotal))),
        p.desconto ? h('div', {}, h('span', {}, 'Desconto'), h('span', {}, `− ${R$(p.desconto)}`)) : null,
        h('div', { class: 'total' }, h('span', {}, 'Total'), h('span', {}, R$(p.total)))),
      p.pagamento_texto || p.prazo_texto ? h('div', { class: 'grade-info escopo' },
        p.pagamento_texto ? h('div', { class: 'info' }, h('span', {}, 'Pagamento (orçamento)'), h('strong', {}, p.pagamento_texto)) : null,
        p.prazo_texto ? h('div', { class: 'info' }, h('span', {}, 'Prazo'), h('strong', {}, p.prazo_texto)) : null) : null,
      p.condicoes ? h('div', { class: 'escopo' }, h('h3', {}, p.condicoes_titulo || 'Condições'), h('p', {}, p.condicoes)) : null,
      p.termos ? h('div', { class: 'escopo' }, h('h3', {}, 'Termos'), h('p', { class: 'mudo' }, p.termos)) : null),
    p.status !== 'proposta' && p.status !== 'recusado' ? h('div', { class: 'nao-imprimir' },
      h('div', { class: 'kpis' },
        kpiMini('Receita', R$(r.receita)),
        kpiMini('Recebido', R$(r.recebido)),
        kpiMini('Custos', R$(r.custos)),
        kpiMini('Lucro', R$(r.lucro), r.lucro < 0 ? 'negativo' : null, `Margem ${String(r.margem).replace('.', ',')}%`)),
      h('div', { class: 'painel-grade' },
        h('section', { class: 'cartao' }, h('h2', { class: 'secao' }, 'Parcelas a receber'), listaLanc(p.receitas, 'receber')),
        h('section', { class: 'cartao' }, h('div', { class: 'secao-topo' }, h('h2', { class: 'secao' }, 'Custos do projeto'),
          ETAPAS.includes(p.status) ? btn('+ Custo', adicionarCusto, 'btn-pequeno') : null), listaLanc(p.custos, 'pagar')))) : null,
    p.observacoes ? h('section', { class: 'cartao nao-imprimir' }, h('h2', { class: 'secao' }, 'Observações internas'), h('p', { class: 'obs' }, p.observacoes)) : null,
  );
}

function kpiMini(rotulo, valor, tom, detalhe) {
  return h('div', { class: `kpi${tom ? ` kpi-${tom}` : ''}` },
    h('span', { class: 'kpi-rotulo' }, rotulo), h('strong', { class: 'kpi-valor' }, valor),
    detalhe ? h('span', { class: 'kpi-detalhe' }, detalhe) : null);
}
