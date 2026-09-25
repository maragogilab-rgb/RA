import {
  trocar, GET, POST, PUT, DEL, qs, h, R$, num, dataBR, selo, modal, confirmar, formulario, tabela, cabecalho, filtros, btn, aviso,
  paraNumero, estado,
} from './nucleo.js';

const UFS = ['', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const CAMPOS_PESSOA = [
  { nome: 'nome', rotulo: 'Nome / Razão social', obrigatorio: true, largura: 'cheio', max: 200 },
  { nome: 'documento', rotulo: 'CPF / CNPJ', max: 30 },
  { nome: 'telefone', rotulo: 'Telefone', tipo: 'tel', max: 30 },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email', largura: 'cheio', max: 200 },
  { nome: 'endereco', rotulo: 'Endereço', largura: 'cheio', max: 300 },
  { nome: 'cidade', rotulo: 'Cidade', max: 100 },
  { nome: 'uf', rotulo: 'UF', tipo: 'select', opcoes: UFS.map((u) => [u, u || '—']) },
  { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', largura: 'cheio' },
  { nome: 'ativo', rotulo: 'Ativo', tipo: 'checkbox' },
];

// Página genérica de cadastro (lista + formulário em modal).
function paginaCadastro({ titulo, recurso, singular, campos, colunas, buscaPlaceholder }) {
  return async (raiz) => {
    const lista = h('div');
    const f = filtros([
      { nome: 'busca', rotulo: buscaPlaceholder },
      { nome: 'ativo', tipo: 'select', rotulo: 'Situação', padrao: '1', opcoes: [['1', 'Ativos'], ['0', 'Inativos'], ['', 'Todos']] },
    ], carregar);

    async function carregar(filtro = f.valores()) {
      const dados = await GET(`/${recurso}${qs(filtro)}`);
      trocar(lista, tabela([...colunas,
        { titulo: '', classe: 'acoes-linha', csv: false, valor: (l) => l.ativo ? btn('Inativar', async () => {
          if (!await confirmar(`Inativar "${l.nome}"? O histórico será preservado.`, 'Inativar', 'btn-perigo')) return;
          await DEL(`/${recurso}/${l.id}`);
          aviso(`${singular} inativado`);
          carregar();
        }, 'btn-pequeno btn-fantasma') : selo('inativo', 'neutro') },
      ], dados, { aoClicar: abrir, nomeArquivo: recurso }));
    }

    function abrir(registro = {}) {
      const form = formulario(campos, registro);
      modal(registro.id ? `Editar ${singular.toLowerCase()}` : `Novo ${singular.toLowerCase()}`, form.el, {
        acoes: [
          { texto: 'Cancelar', acao: () => {} },
          {
            texto: 'Salvar', classe: 'btn-primario', acao: async () => {
              const d = form.ler();
              if (registro.id) await PUT(`/${recurso}/${registro.id}`, d);
              else await POST(`/${recurso}`, d);
              aviso(`${singular} salvo`);
              carregar();
            },
          },
        ],
      });
    }

    trocar(raiz, cabecalho(titulo, btn(`Novo ${singular.toLowerCase()}`, () => abrir(), 'btn-primario')), f.el, lista);
    await carregar();
  };
}

export const clientes = paginaCadastro({
  titulo: 'Clientes', recurso: 'clientes', singular: 'Cliente', campos: CAMPOS_PESSOA, buscaPlaceholder: 'Buscar por nome, documento, e-mail…',
  colunas: [
    { titulo: 'Nome', valor: (l) => l.nome },
    { titulo: 'CPF/CNPJ', valor: (l) => l.documento || '' },
    { titulo: 'Telefone', valor: (l) => l.telefone || '' },
    { titulo: 'E-mail', valor: (l) => l.email || '' },
    { titulo: 'Cidade/UF', valor: (l) => [l.cidade, l.uf].filter(Boolean).join(' / ') },
  ],
});

export const fornecedores = paginaCadastro({
  titulo: 'Fornecedores', recurso: 'fornecedores', singular: 'Fornecedor', campos: CAMPOS_PESSOA, buscaPlaceholder: 'Buscar por nome, documento, e-mail…',
  colunas: [
    { titulo: 'Nome', valor: (l) => l.nome },
    { titulo: 'CPF/CNPJ', valor: (l) => l.documento || '' },
    { titulo: 'Telefone', valor: (l) => l.telefone || '' },
    { titulo: 'E-mail', valor: (l) => l.email || '' },
    { titulo: 'Cidade/UF', valor: (l) => [l.cidade, l.uf].filter(Boolean).join(' / ') },
  ],
});

const estoqueCelula = (l) => {
  const baixo = l.ativo && l.estoque_atual <= l.estoque_minimo;
  return h('span', { class: baixo ? 'txt-alerta' : null, title: baixo ? 'Abaixo do estoque mínimo' : null },
    baixo ? '▼ ' : '', `${num(l.estoque_atual)} ${l.unidade}`);
};

export const produtos = async (raiz) => {
  await paginaCadastro({
    titulo: 'Produtos', recurso: 'produtos', singular: 'Produto', buscaPlaceholder: 'Buscar por nome, SKU…',
    campos: [
      { nome: 'nome', rotulo: 'Nome', obrigatorio: true, largura: 'cheio', max: 200 },
      { nome: 'sku', rotulo: 'Código / SKU', max: 60 },
      { nome: 'unidade', rotulo: 'Unidade', padrao: 'UN', max: 10, placeholder: 'UN, KG, CX…' },
      { nome: 'preco_custo', rotulo: 'Preço de custo (R$)', tipo: 'moeda' },
      { nome: 'preco_venda', rotulo: 'Preço de venda (R$)', tipo: 'moeda' },
      { nome: 'estoque_minimo', rotulo: 'Estoque mínimo', tipo: 'number' },
      { nome: 'estoque_inicial', rotulo: 'Estoque inicial (só no cadastro)', tipo: 'number' },
      { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', largura: 'cheio' },
      { nome: 'ativo', rotulo: 'Ativo', tipo: 'checkbox' },
    ],
    colunas: [
      { titulo: 'SKU', valor: (l) => l.sku || '' },
      { titulo: 'Produto', valor: (l) => l.nome },
      { titulo: 'Custo', classe: 'num', valor: (l) => R$(l.preco_custo), csv: (l) => (l.preco_custo / 100).toFixed(2).replace('.', ',') },
      { titulo: 'Venda', classe: 'num', valor: (l) => R$(l.preco_venda), csv: (l) => (l.preco_venda / 100).toFixed(2).replace('.', ',') },
      { titulo: 'Margem', classe: 'num', valor: (l) => (l.preco_venda ? `${(((l.preco_venda - l.preco_custo) / l.preco_venda) * 100).toFixed(1).replace('.', ',')}%` : '—') },
      { titulo: 'Estoque', classe: 'num', valor: estoqueCelula, csv: (l) => num(l.estoque_atual) },
      { titulo: 'Mínimo', classe: 'num', valor: (l) => num(l.estoque_minimo) },
    ],
  })(raiz);
};

// ---------- Estoque ----------
export async function estoque(raiz) {
  const produtosLista = await GET('/produtos?ativo=1');
  const lista = h('div');
  const f = filtros([
    { nome: 'produto_id', tipo: 'select', rotulo: 'Produto', opcoes: [['', 'Todos os produtos'], ...produtosLista.map((p) => [p.id, p.nome])] },
    { nome: 'de', tipo: 'date', rotulo: 'De' },
    { nome: 'ate', tipo: 'date', rotulo: 'Até' },
  ], carregar);

  async function carregar(filtro = f.valores()) {
    const movs = await GET(`/estoque/movimentacoes${qs(filtro)}`);
    trocar(lista, tabela([
      { titulo: 'Data', valor: (l) => `${dataBR(l.criado_em)} ${l.criado_em.slice(11, 16)}` },
      { titulo: 'Produto', valor: (l) => l.produto_nome },
      { titulo: 'Tipo', valor: (l) => selo(l.tipo), csv: (l) => l.tipo },
      { titulo: 'Quantidade', classe: 'num', valor: (l) => `${l.tipo === 'saida' ? '−' : l.tipo === 'entrada' ? '+' : '='}${num(l.quantidade)} ${l.unidade}` },
      { titulo: 'Saldo', classe: 'num', valor: (l) => num(l.saldo_apos) },
      { titulo: 'Motivo', valor: (l) => l.motivo || '' },
      { titulo: 'Usuário', valor: (l) => l.usuario_nome || '' },
    ], movs, { nomeArquivo: 'movimentacoes-estoque' }));
  }

  function novaMovimentacao() {
    const form = formulario([
      { nome: 'produto_id', rotulo: 'Produto', tipo: 'select', obrigatorio: true, largura: 'cheio',
        opcoes: [['', 'Selecione…'], ...produtosLista.map((p) => [p.id, `${p.nome} (saldo: ${num(p.estoque_atual)} ${p.unidade})`])] },
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: [['entrada', 'Entrada'], ['saida', 'Saída'], ['ajuste', 'Ajuste (define o saldo)']] },
      { nome: 'quantidade', rotulo: 'Quantidade', obrigatorio: true, inputmode: 'decimal' },
      { nome: 'motivo', rotulo: 'Motivo', largura: 'cheio', placeholder: 'Ex.: inventário, perda, devolução…' },
    ]);
    modal('Movimentar estoque', form.el, {
      acoes: [
        { texto: 'Cancelar', acao: () => {} },
        {
          texto: 'Registrar', classe: 'btn-primario', acao: async () => {
            const d = form.ler();
            const quantidade = paraNumero(d.quantidade);
            if (Number.isNaN(quantidade)) throw new Error('Quantidade inválida');
            await POST('/estoque/movimentacoes', { ...d, produto_id: Number(d.produto_id), quantidade });
            aviso('Movimentação registrada');
            estado.recarregar();
          },
        },
      ],
    });
  }

  const baixos = produtosLista.filter((p) => p.estoque_atual <= p.estoque_minimo);
  trocar(raiz,
    cabecalho('Estoque', btn('Movimentar estoque', novaMovimentacao, 'btn-primario')),
    baixos.length ? h('div', { class: 'faixa faixa-alerta', role: 'status' },
      h('strong', {}, `▼ ${baixos.length} produto(s) abaixo do estoque mínimo: `),
      baixos.slice(0, 8).map((p) => p.nome).join(', '), baixos.length > 8 ? '…' : '') : null,
    h('h2', { class: 'secao' }, 'Movimentações'),
    f.el,
    lista,
  );
  await carregar();
}
