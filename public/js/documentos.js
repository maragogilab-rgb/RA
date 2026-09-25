// Vendas e compras compartilham a mesma estrutura: documento com pessoa, itens e parcelas.
import {
  trocar, GET, POST, PUT, qs, h, R$, num, dataBR, hoje, selo, confirmar, tabela, cabecalho, filtros, btn, aviso,
  paraCentavos, deCentavos, paraNumero, ROTULOS, estado,
} from './nucleo.js';

const CONFIG = {
  vendas: {
    titulo: 'Vendas', singular: 'Venda', novo: 'Nova venda',
    pessoa: { campo: 'cliente_id', recurso: 'clientes', rotulo: 'Cliente', nome: 'cliente_nome', doc: 'cliente_documento' },
    preco: { campo: 'preco_unitario', produto: 'preco_venda', rotulo: 'Preço unit.' },
    status: [['', 'Todos'], ['orcamento', 'Orçamentos'], ['confirmada', 'Confirmadas'], ['cancelada', 'Canceladas']],
    rascunho: 'orcamento', efetivado: 'confirmada',
    efetivar: { rota: 'confirmar', texto: 'Confirmar venda', flag: 'confirmar', pergunta: 'Confirmar a venda? O estoque será baixado e as contas a receber geradas.' },
    salvarRascunho: 'Salvar orçamento',
    comercial: true,
  },
  compras: {
    titulo: 'Compras', singular: 'Compra', novo: 'Nova compra',
    pessoa: { campo: 'fornecedor_id', recurso: 'fornecedores', rotulo: 'Fornecedor', nome: 'fornecedor_nome', doc: 'fornecedor_documento' },
    preco: { campo: 'custo_unitario', produto: 'preco_custo', rotulo: 'Custo unit.' },
    status: [['', 'Todos'], ['pendente', 'Pendentes'], ['recebida', 'Recebidas'], ['cancelada', 'Canceladas']],
    rascunho: 'pendente', efetivado: 'recebida',
    efetivar: { rota: 'receber', texto: 'Receber mercadoria', flag: 'receber', pergunta: 'Confirmar o recebimento? O estoque será atualizado e as contas a pagar geradas.' },
    salvarRascunho: 'Salvar pedido',
    comercial: false,
  },
};

// ---------- Lista ----------
export function lista(recurso) {
  const cfg = CONFIG[recurso];
  return async (raiz) => {
    const area = h('div');
    const f = filtros([
      { nome: 'busca', rotulo: `Buscar por ${cfg.pessoa.rotulo.toLowerCase()} ou nº…` },
      { nome: 'status', tipo: 'select', rotulo: 'Situação', opcoes: cfg.status },
      { nome: 'de', tipo: 'date', rotulo: 'De' },
      { nome: 'ate', tipo: 'date', rotulo: 'Até' },
    ], carregar);

    async function carregar(filtro = f.valores()) {
      const dados = await GET(`/${recurso}${qs(filtro)}`);
      const efetivos = dados.filter((d) => d.status === cfg.efetivado);
      trocar(area,
        h('div', { class: 'resumo-linha' },
          h('span', {}, `${efetivos.length} ${ROTULOS[cfg.efetivado].toLowerCase()}(s): `, h('strong', {}, R$(efetivos.reduce((s, d) => s + d.total, 0))))),
        tabela([
          { titulo: 'Nº', valor: (l) => `#${l.id}` },
          { titulo: 'Data', valor: (l) => dataBR(l.data) },
          { titulo: cfg.pessoa.rotulo, valor: (l) => l[cfg.pessoa.nome] },
          { titulo: 'Itens', classe: 'num', valor: (l) => l.qtd_itens },
          { titulo: 'Pagamento', valor: (l) => `${cfg.comercial ? `${ROTULOS[l.forma_pagamento] || ''} ` : ''}${l.parcelas > 1 ? `${l.parcelas}x` : cfg.comercial ? '' : 'à vista/1x'}` },
          { titulo: 'Total', classe: 'num', valor: (l) => R$(l.total), csv: (l) => deCentavos(l.total) },
          { titulo: 'Situação', valor: (l) => selo(l.status), csv: (l) => ROTULOS[l.status] },
        ], dados, { aoClicar: (l) => { location.hash = `#/${recurso}/${l.id}`; }, nomeArquivo: recurso }),
      );
    }

    trocar(raiz, cabecalho(cfg.titulo, btn(cfg.novo, () => { location.hash = `#/${recurso}/nova`; }, 'btn-primario')), f.el, area);
    await carregar();
  };
}

// ---------- Editor ----------
export function editor(recurso) {
  const cfg = CONFIG[recurso];
  return async (raiz, { id } = {}) => {
    const [pessoas, produtos, doc] = await Promise.all([
      GET(`/${cfg.pessoa.recurso}?ativo=1`),
      GET('/produtos?ativo=1'),
      id ? GET(`/${recurso}/${id}`) : null,
    ]);
    if (doc && doc.status !== cfg.rascunho) { location.hash = `#/${recurso}/${id}`; return; }
    const porId = new Map(produtos.map((p) => [p.id, p]));

    const selPessoa = h('select', { id: 'doc-pessoa', required: true },
      h('option', { value: '' }, 'Selecione…'),
      pessoas.map((p) => h('option', { value: p.id, selected: doc?.[cfg.pessoa.campo] === p.id }, p.documento ? `${p.nome} — ${p.documento}` : p.nome)));
    const inData = h('input', { id: 'doc-data', type: 'date', value: doc?.data || hoje() });
    const inParcelas = h('input', { id: 'doc-parcelas', type: 'number', min: 1, max: 48, value: doc?.parcelas || 1 });
    const selForma = h('select', { id: 'doc-forma' },
      ['dinheiro', 'pix', 'debito', 'credito', 'boleto', 'prazo'].map((f) => h('option', { value: f, selected: doc?.forma_pagamento === f }, ROTULOS[f])));
    const inDesconto = h('input', { id: 'doc-desconto', type: 'text', inputmode: 'decimal', placeholder: '0,00', value: doc?.desconto ? deCentavos(doc.desconto) : '' });
    const inObs = h('textarea', { id: 'doc-obs', rows: 2 });
    inObs.value = doc?.observacoes || '';

    const corpoItens = h('tbody');
    const totais = h('div', { class: 'totais' });

    function linhaItem(item = {}) {
      const sel = h('select', { 'aria-label': 'Produto' },
        h('option', { value: '' }, 'Selecione o produto…'),
        produtos.map((p) => h('option', { value: p.id, selected: item.produto_id === p.id }, `${p.sku ? `${p.sku} · ` : ''}${p.nome}`)));
      const qtd = h('input', { type: 'text', inputmode: 'decimal', 'aria-label': 'Quantidade', value: item.quantidade ? String(item.quantidade).replace('.', ',') : '1' });
      const preco = h('input', { type: 'text', inputmode: 'decimal', 'aria-label': cfg.preco.rotulo, value: item[cfg.preco.campo] !== undefined ? deCentavos(item[cfg.preco.campo]) : '' });
      const info = h('small', { class: 'mudo' });
      const sub = h('td', { class: 'num' });
      const tr = h('tr', {},
        h('td', { 'data-rotulo': 'Produto' }, sel, info),
        h('td', { 'data-rotulo': 'Qtd.' }, qtd),
        h('td', { 'data-rotulo': cfg.preco.rotulo }, preco),
        sub,
        h('td', {}, h('button', { class: 'btn-icone', type: 'button', 'aria-label': 'Remover item', onclick: () => { tr.remove(); recalcular(); } }, '×')));
      tr.ler = () => ({ produto_id: Number(sel.value), quantidade: paraNumero(qtd.value), preco: paraCentavos(preco.value) });
      const atualizarInfo = () => {
        const p = porId.get(Number(sel.value));
        info.textContent = p ? `Estoque: ${num(p.estoque_atual)} ${p.unidade}` : '';
      };
      sel.addEventListener('change', () => {
        const p = porId.get(Number(sel.value));
        if (p) preco.value = deCentavos(p[cfg.preco.produto]);
        atualizarInfo();
        recalcular();
      });
      qtd.addEventListener('input', recalcular);
      preco.addEventListener('input', recalcular);
      tr.sub = sub;
      atualizarInfo();
      corpoItens.append(tr);
      return sel;
    }

    function recalcular() {
      let subtotal = 0;
      for (const tr of corpoItens.children) {
        let v = 0;
        try { const it = tr.ler(); v = Number.isNaN(it.quantidade) ? 0 : Math.round(it.quantidade * it.preco); } catch { v = 0; }
        tr.sub.textContent = R$(v);
        subtotal += v;
      }
      let desconto = 0;
      try { desconto = cfg.comercial ? paraCentavos(inDesconto.value) : 0; } catch { desconto = 0; }
      const n = Math.max(1, Number(inParcelas.value) || 1);
      const total = subtotal - desconto;
      trocar(totais,
        cfg.comercial ? h('div', {}, h('span', {}, 'Subtotal'), h('span', {}, R$(subtotal))) : null,
        cfg.comercial ? h('div', {}, h('span', {}, 'Desconto'), h('span', {}, `− ${R$(desconto)}`)) : null,
        h('div', { class: 'total' }, h('span', {}, 'Total'), h('span', {}, R$(total))),
        n > 1 ? h('div', { class: 'mudo' }, h('span', {}, 'Parcelas'), h('span', {}, `${n}x de ${R$(Math.floor(total / n))}`)) : null,
      );
    }
    inDesconto.addEventListener('input', recalcular);
    inParcelas.addEventListener('input', recalcular);

    (doc?.itens?.length ? doc.itens : [{}]).forEach((it) => linhaItem(it));
    recalcular();

    function montar() {
      if (!selPessoa.value) { selPessoa.focus(); throw new Error(`Selecione o ${cfg.pessoa.rotulo.toLowerCase()}`); }
      const itens = [...corpoItens.children].map((tr) => tr.ler()).filter((it) => it.produto_id);
      if (!itens.length) throw new Error('Adicione ao menos um produto');
      if (itens.some((it) => Number.isNaN(it.quantidade) || it.quantidade <= 0)) throw new Error('Verifique as quantidades dos itens');
      const corpo = {
        [cfg.pessoa.campo]: Number(selPessoa.value),
        data: inData.value,
        parcelas: Number(inParcelas.value) || 1,
        observacoes: inObs.value,
        itens: itens.map((it) => ({ produto_id: it.produto_id, quantidade: it.quantidade, [cfg.preco.campo]: it.preco })),
      };
      if (cfg.comercial) {
        corpo.forma_pagamento = selForma.value;
        corpo.desconto = paraCentavos(inDesconto.value);
      }
      return corpo;
    }

    async function salvar(efetivar) {
      try {
        const corpo = montar();
        if (efetivar && !await confirmar(cfg.efetivar.pergunta, cfg.efetivar.texto)) return;
        let r;
        if (doc) {
          r = await PUT(`/${recurso}/${doc.id}`, corpo);
          if (efetivar) r = await POST(`/${recurso}/${doc.id}/${cfg.efetivar.rota}`);
        } else {
          r = await POST(`/${recurso}`, { ...corpo, [cfg.efetivar.flag]: efetivar });
        }
        aviso(`${cfg.singular} #${r.id} salva`);
        location.hash = `#/${recurso}/${r.id}`;
      } catch (e) {
        aviso(e.message, 'erro');
      }
    }

    const campo = (rotulo, el, classe = '') => h('div', { class: `campo ${classe}` }, h('label', { for: el.id }, rotulo), el);
    trocar(raiz,
      cabecalho(doc ? `Editar ${cfg.singular.toLowerCase()} #${doc.id}` : cfg.novo,
        btn('Voltar', () => history.back(), 'btn-fantasma')),
      h('section', { class: 'cartao' }, h('div', { class: 'form-grade' },
        campo(cfg.pessoa.rotulo, selPessoa, 'campo-cheio'),
        campo('Data', inData),
        cfg.comercial ? campo('Forma de pagamento', selForma) : null,
        campo('Parcelas', inParcelas),
        cfg.comercial ? campo('Desconto (R$)', inDesconto) : null,
        campo('Observações', inObs, 'campo-cheio'))),
      h('section', { class: 'cartao' },
        h('h2', { class: 'secao' }, 'Itens'),
        h('div', { class: 'tabela-wrap' }, h('table', { class: 'tabela-itens' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Produto'), h('th', {}, 'Qtd.'), h('th', {}, cfg.preco.rotulo), h('th', { class: 'num' }, 'Subtotal'), h('th', {}))),
          corpoItens)),
        btn('+ Adicionar item', () => linhaItem().focus(), 'btn-fantasma'),
        totais),
      h('div', { class: 'barra-final' },
        btn(cfg.salvarRascunho, () => salvar(false)),
        btn(`Salvar e ${cfg.efetivar.texto.split(' ')[0].toLowerCase()}`, () => salvar(true), 'btn-primario')),
    );
  };
}

// ---------- Detalhe ----------
export function detalhe(recurso) {
  const cfg = CONFIG[recurso];
  return async (raiz, { id }) => {
    const d = await GET(`/${recurso}/${id}`);
    const empresa = estado.empresa || {};
    const acao = (texto, fn, classe) => btn(texto, async () => {
      try { await fn(); estado.recarregar(); } catch (e) { aviso(e.message, 'erro'); }
    }, classe);

    const acoes = [btn('Voltar', () => { location.hash = `#/${recurso}`; }, 'btn-fantasma'), btn('Imprimir', () => window.print())];
    if (d.status === cfg.rascunho) {
      acoes.push(btn('Editar', () => { location.hash = `#/${recurso}/${id}/editar`; }));
      acoes.push(acao(cfg.efetivar.texto, async () => {
        if (!await confirmar(cfg.efetivar.pergunta, cfg.efetivar.texto)) return;
        await POST(`/${recurso}/${id}/${cfg.efetivar.rota}`);
        aviso('Operação concluída');
      }, 'btn-primario'));
    }
    if (d.status !== 'cancelada') {
      acoes.push(acao('Cancelar', async () => {
        const extra = d.status === cfg.efetivado ? ' O estoque será revertido e as parcelas em aberto canceladas.' : '';
        if (!await confirmar(`Cancelar ${cfg.singular.toLowerCase()} #${id}?${extra}`, 'Cancelar documento', 'btn-perigo')) return;
        await POST(`/${recurso}/${id}/cancelar`);
        aviso(`${cfg.singular} cancelada`);
      }, 'btn-perigo'));
    }

    const info = (rotulo, valor) => h('div', { class: 'info' }, h('span', {}, rotulo), h('strong', {}, valor));
    trocar(raiz,
      h('div', { class: 'so-impressao cabecalho-impressao' },
        h('strong', {}, empresa.nome || 'Minha Empresa'),
        h('div', {}, [empresa.cnpj && `CNPJ ${empresa.cnpj}`, empresa.telefone, empresa.email].filter(Boolean).join(' · ')),
        empresa.endereco ? h('div', {}, empresa.endereco) : null),
      cabecalho(`${d.status === 'orcamento' ? 'Orçamento' : cfg.singular} #${d.id}`, ...acoes),
      h('section', { class: 'cartao' }, h('div', { class: 'grade-info' },
        info(cfg.pessoa.rotulo, d[cfg.pessoa.nome]),
        d[cfg.pessoa.doc] ? info('CPF/CNPJ', d[cfg.pessoa.doc]) : null,
        info('Data', dataBR(d.data)),
        info('Situação', selo(d.status)),
        cfg.comercial ? info('Pagamento', `${ROTULOS[d.forma_pagamento]}${d.parcelas > 1 ? ` em ${d.parcelas}x` : ''}`) : info('Parcelas', `${d.parcelas}x`),
        info('Responsável', d.usuario_nome || '—')),
        d.observacoes ? h('p', { class: 'obs' }, d.observacoes) : null),
      h('section', { class: 'cartao' },
        h('h2', { class: 'secao' }, 'Itens'),
        tabela([
          { titulo: 'Produto', valor: (l) => `${l.sku ? `${l.sku} · ` : ''}${l.produto_nome}` },
          { titulo: 'Qtd.', classe: 'num', valor: (l) => `${num(l.quantidade)} ${l.unidade}` },
          { titulo: cfg.preco.rotulo, classe: 'num', valor: (l) => R$(l[cfg.preco.campo]) },
          { titulo: 'Subtotal', classe: 'num', valor: (l) => R$(l.subtotal) },
        ], d.itens),
        h('div', { class: 'totais' },
          cfg.comercial ? h('div', {}, h('span', {}, 'Subtotal'), h('span', {}, R$(d.subtotal))) : null,
          cfg.comercial && d.desconto ? h('div', {}, h('span', {}, 'Desconto'), h('span', {}, `− ${R$(d.desconto)}`)) : null,
          h('div', { class: 'total' }, h('span', {}, 'Total'), h('span', {}, R$(d.total))))),
      d.lancamentos.length ? h('section', { class: 'cartao' },
        h('h2', { class: 'secao' }, recurso === 'vendas' ? 'Contas a receber' : 'Contas a pagar'),
        tabela([
          { titulo: 'Descrição', valor: (l) => l.descricao },
          { titulo: 'Vencimento', valor: (l) => dataBR(l.vencimento) },
          { titulo: 'Valor', classe: 'num', valor: (l) => R$(l.valor) },
          { titulo: 'Situação', valor: (l) => selo(l.status) },
          { titulo: 'Pago em', valor: (l) => dataBR(l.pago_em) },
        ], d.lancamentos)) : null,
    );
  };
}
