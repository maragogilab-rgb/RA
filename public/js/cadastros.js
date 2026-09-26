import {
  trocar, GET, POST, PUT, DEL, qs, h, R$, selo, modal, confirmar, formulario, tabela, cabecalho, filtros, btn, aviso, ROTULOS,
} from './nucleo.js';

const CATEGORIAS_SERVICO = ['Audiovisual', 'Fotografia', 'Social media', 'Tráfego pago', 'Design', 'Branding', 'Site', 'Consultoria', 'Outros'];
const UNIDADES = ['projeto', 'hora', 'diaria', 'mes', 'unidade', 'video', 'post'];

const UFS = ['', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const ESTAGIOS = ['', 'Novo lead', 'Contato feito', 'Proposta enviada', 'Negociação', 'Fechado', 'Perdido'];
const SEGMENTOS = ['', 'Casamentos e sociais', 'Eventos corporativos', 'Marcas locais', 'Shows e eventos musicais', 'Serviços gráficos', 'Locação de itens / festas', 'Outros'];

const ENDERECO = [
  { tipo: 'titulo', rotulo: 'Endereço', ajuda: '— digite o CEP para preencher automaticamente' },
  { nome: 'cep', rotulo: 'CEP', max: 9, nf: true, inputmode: 'numeric' },
  { nome: 'logradouro', rotulo: 'Logradouro (rua, avenida…)', max: 200, nf: true },
  { nome: 'numero', rotulo: 'Número', max: 20, nf: true },
  { nome: 'complemento', rotulo: 'Complemento', max: 100 },
  { nome: 'bairro', rotulo: 'Bairro', max: 100, nf: true },
  { nome: 'cidade', rotulo: 'Cidade', max: 100 },
  { nome: 'uf', rotulo: 'UF', tipo: 'select', nf: true, opcoes: UFS.map((u) => [u, u || '—']) },
  { nome: 'codigo_municipio', rotulo: 'Código IBGE do município', max: 7, nf: true, ajuda: 'Preenchido pelo CEP' },
];

async function camposCliente() {
  const servicos = await GET('/servicos?ativo=1');
  return [
    { tipo: 'titulo', rotulo: 'Dados cadastrais' },
    { nome: 'tipo_pessoa', rotulo: 'Tipo', tipo: 'select', opcoes: [['PJ', 'Pessoa jurídica (CNPJ)'], ['PF', 'Pessoa física (CPF)']] },
    { nome: 'documento', rotulo: 'CNPJ / CPF', max: 30, nf: true },
    { nome: 'nome', rotulo: 'Razão social / Nome completo', obrigatorio: true, largura: 'cheio', max: 200, nf: true },
    { nome: 'nome_fantasia', rotulo: 'Nome fantasia', max: 200 },
    { nome: 'inscricao_municipal', rotulo: 'Inscrição municipal', max: 30 },
    { nome: 'inscricao_estadual', rotulo: 'Inscrição estadual', max: 30 },
    { nome: 'servico_padrao_id', rotulo: 'Tipo de serviço contratado', tipo: 'select',
      opcoes: [['', '—'], ...servicos.map((sv) => [sv.id, sv.nome])], ajuda: 'Usado para sugerir o código do serviço na NF' },
    { tipo: 'titulo', rotulo: 'Relacionamento' },
    { nome: 'relacao', rotulo: 'Tipo de relação', tipo: 'select', opcoes: [['cliente', 'Cliente'], ['lead', 'Lead (prospecção)'], ['parceiro', 'Parceiro (indica clientes)']] },
    { nome: 'estagio', rotulo: 'Estágio', tipo: 'select', opcoes: ESTAGIOS.map((e) => [e, e || '—']) },
    { nome: 'segmento', rotulo: 'Segmento', tipo: 'select', opcoes: SEGMENTOS.map((e) => [e, e || '—']) },
    { nome: 'classificacao', rotulo: 'Classificação', tipo: 'select', opcoes: [['', '—'], ['A — Prioritário', 'A — Prioritário'], ['B — Regular', 'B — Regular'], ['C — Ocasional', 'C — Ocasional']] },
    { nome: 'origem', rotulo: 'Origem', placeholder: 'Indicação, Instagram…' },
    { nome: 'proximo_contato', rotulo: 'Próximo contato (follow-up)', tipo: 'date' },
    { nome: 'prazo_faturamento', rotulo: 'Prazo de faturamento', placeholder: 'Ex.: 21 dias após entrega' },
    { tipo: 'titulo', rotulo: 'Contato' },
    { nome: 'contato', rotulo: 'Pessoa de contato', max: 100, placeholder: 'Ex.: Alessandra, @perfil (Instagram)' },
    { nome: 'email', rotulo: 'E-mail', tipo: 'email', max: 200 },
    { nome: 'telefone', rotulo: 'Telefone / WhatsApp', tipo: 'tel', max: 30 },
    { nome: 'email_nf', rotulo: 'E-mail para envio da NF', tipo: 'email', largura: 'cheio', max: 200, ajuda: 'Se vazio, usa o e-mail principal' },
    ...ENDERECO,
    { tipo: 'titulo', rotulo: 'Outros' },
    { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', largura: 'cheio' },
    { nome: 'ativo', rotulo: 'Ativo', tipo: 'checkbox' },
  ];
}

const CAMPOS_FORNECEDOR = [
  { nome: 'tipo_pessoa', rotulo: 'Tipo', tipo: 'select', opcoes: [['PF', 'Pessoa física (freelancer)'], ['PJ', 'Pessoa jurídica']] },
  { nome: 'documento', rotulo: 'CPF / CNPJ', max: 30 },
  { nome: 'nome', rotulo: 'Nome / Razão social', obrigatorio: true, largura: 'cheio', max: 200 },
  { nome: 'telefone', rotulo: 'Telefone / WhatsApp', tipo: 'tel', max: 30 },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email', max: 200 },
  { nome: 'chave_pix', rotulo: 'Chave PIX', largura: 'cheio', max: 100 },
  ...ENDERECO.map((c) => ({ ...c, nf: false })),
  { nome: 'observacoes', rotulo: 'Observações (especialidade, valor da diária…)', tipo: 'textarea', largura: 'cheio' },
  { nome: 'ativo', rotulo: 'Ativo', tipo: 'checkbox' },
];

// Preenche o endereço a partir do CEP.
function ligarCep(form) {
  const cep = form.els.cep;
  if (!cep) return;
  cep.addEventListener('change', async () => {
    const digitos = cep.value.replace(/\D/g, '');
    if (digitos.length !== 8) return;
    try {
      const d = await GET(`/cep/${digitos}`);
      for (const k of ['logradouro', 'bairro', 'cidade', 'uf', 'codigo_municipio']) {
        if (d[k] && form.els[k]) form.els[k].value = d[k];
      }
      form.els.numero?.focus();
    } catch (e) {
      aviso(e.message, 'erro');
    }
  });
}

// Página genérica de cadastro (lista + formulário em modal).
function paginaCadastro({ titulo, recurso, singular, campos, colunas, buscaPlaceholder, largo = false, extraFiltros = [] }) {
  return async (raiz) => {
    const lista = h('div');
    const f = filtros([
      { nome: 'busca', rotulo: buscaPlaceholder },
      ...extraFiltros,
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

    async function abrir(registro = {}) {
      const form = formulario(typeof campos === 'function' ? await campos() : campos, registro);
      ligarCep(form);
      modal(registro.id ? `Editar ${singular.toLowerCase()}` : `Novo ${singular.toLowerCase()}`, form.el, {
        largo,
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

// Cliente pronto para NF quando tem documento e endereço completos.
const prontoNF = (l) => Boolean(l.documento && l.cep && l.logradouro && l.bairro && l.uf && l.codigo_municipio);

export const clientes = paginaCadastro({
  titulo: 'Clientes e leads', recurso: 'clientes', singular: 'Cliente', campos: camposCliente, largo: true, buscaPlaceholder: 'Buscar por nome, documento, e-mail…',
  extraFiltros: [
    { nome: 'relacao', tipo: 'select', rotulo: 'Relação', opcoes: [['', 'Clientes, leads e parceiros'], ['cliente', 'Clientes'], ['lead', 'Leads'], ['parceiro', 'Parceiros']] },
    { nome: 'segmento', tipo: 'select', rotulo: 'Segmento', opcoes: SEGMENTOS.map((e) => [e, e || 'Todos os segmentos']) },
    { nome: 'estagio', tipo: 'select', rotulo: 'Estágio', opcoes: ESTAGIOS.map((e) => [e, e || 'Todos os estágios']) },
  ],
  colunas: [
    { titulo: 'Nome', valor: (l) => h('div', {}, l.nome, l.nome_fantasia ? h('small', { class: 'mudo bloco' }, l.nome_fantasia) : null), csv: (l) => l.nome },
    { titulo: 'Contato', valor: (l) => [l.contato, l.telefone].filter(Boolean).join(' · ') },
    { titulo: 'Segmento', valor: (l) => l.segmento || '' },
    { titulo: 'Relação', valor: (l) => h('div', {}, { cliente: 'Cliente', lead: 'Lead', parceiro: 'Parceiro' }[l.relacao] || '',
      l.estagio ? h('small', { class: 'mudo bloco' }, l.estagio) : null), csv: (l) => `${l.relacao}${l.estagio ? ` / ${l.estagio}` : ''}` },
    { titulo: 'Dados p/ NF', valor: (l) => (prontoNF(l) ? selo('Completo', 'ok') : selo('Incompleto', 'aviso')), csv: (l) => (prontoNF(l) ? 'Completo' : 'Incompleto') },
    { titulo: 'Cidade/UF', valor: (l) => [l.cidade, l.uf].filter(Boolean).join(' / ') },
  ],
});

export const fornecedores = paginaCadastro({
  titulo: 'Fornecedores e freelancers', recurso: 'fornecedores', singular: 'Fornecedor', campos: CAMPOS_FORNECEDOR, largo: true, buscaPlaceholder: 'Buscar por nome, documento, e-mail…',
  colunas: [
    { titulo: 'Nome', valor: (l) => l.nome },
    { titulo: 'CPF/CNPJ', valor: (l) => l.documento || '' },
    { titulo: 'Telefone', valor: (l) => l.telefone || '' },
    { titulo: 'E-mail', valor: (l) => l.email || '' },
    { titulo: 'Cidade/UF', valor: (l) => [l.cidade, l.uf].filter(Boolean).join(' / ') },
  ],
});

// Itens da LC 116/2003 mais comuns para agências de marketing e produtoras audiovisuais.
export const ITENS_LC116 = [
  ['17.06', 'Propaganda e publicidade, planejamento de campanhas, elaboração de materiais publicitários'],
  ['13.03', 'Fotografia e cinematografia, inclusive revelação, ampliação, cópia, reprodução e trucagem'],
  ['13.02', 'Fonografia ou gravação de sons, inclusive trucagem, dublagem, mixagem'],
  ['12.13', 'Produção, mediante ou sem encomenda prévia, de eventos, espetáculos, entrevistas, shows'],
  ['23.01', 'Programação e comunicação visual, desenho industrial e congêneres'],
  ['17.01', 'Assessoria ou consultoria de qualquer natureza'],
  ['17.02', 'Datilografia, digitação, redação, edição, revisão e congêneres'],
  ['1.08', 'Planejamento, confecção, manutenção e atualização de páginas eletrônicas'],
  ['1.03', 'Processamento, armazenamento ou hospedagem de dados, textos, imagens, vídeos'],
  ['10.08', 'Agenciamento de publicidade e propaganda, inclusive veiculação por quaisquer meios'],
  ['17.10', 'Planejamento, organização e administração de feiras, exposições, congressos'],
];

export const servicos = paginaCadastro({
  titulo: 'Serviços', recurso: 'servicos', singular: 'Serviço', largo: true, buscaPlaceholder: 'Buscar serviço ou categoria…',
  campos: [
    { nome: 'nome', rotulo: 'Nome do serviço', obrigatorio: true, largura: 'cheio', max: 200 },
    { nome: 'categoria', rotulo: 'Categoria', tipo: 'select', opcoes: [['', '—'], ...CATEGORIAS_SERVICO.map((c) => [c, c])] },
    { nome: 'unidade', rotulo: 'Cobrado por', tipo: 'select', opcoes: UNIDADES.map((u) => [u, ROTULOS[u]]) },
    { nome: 'preco', rotulo: 'Preço de referência (R$)', tipo: 'moeda' },
    { nome: 'descricao', rotulo: 'Descrição (aparece na proposta e na NF)', tipo: 'textarea', largura: 'cheio' },
    { tipo: 'titulo', rotulo: 'Dados fiscais (NFS-e)', ajuda: '— confirme os códigos com seu contador' },
    { nome: 'item_lista_servico', rotulo: 'Item da lista de serviços (LC 116)', tipo: 'select', nf: true, largura: 'cheio',
      opcoes: [['', '—'], ...ITENS_LC116.map(([c, t]) => [c, `${c} — ${t}`])] },
    { nome: 'codigo_tributario_municipio', rotulo: 'Código de tributação do município', max: 30, ajuda: 'Se a prefeitura exigir' },
    { nome: 'codigo_nbs', rotulo: 'Código NBS', max: 20, ajuda: 'Exigido na NFS-e nacional' },
    { nome: 'cnae', rotulo: 'CNAE', max: 12, placeholder: 'Ex.: 7311-4/00' },
    { nome: 'aliquota_iss', rotulo: 'Alíquota do ISS (%)', tipo: 'number', nf: true, placeholder: 'Ex.: 2' },
    { nome: 'ativo', rotulo: 'Ativo', tipo: 'checkbox' },
  ],
  colunas: [
    { titulo: 'Serviço', valor: (l) => l.nome },
    { titulo: 'Categoria', valor: (l) => l.categoria || '' },
    { titulo: 'Preço', classe: 'num', valor: (l) => `${R$(l.preco)} / ${ROTULOS[l.unidade] || l.unidade}`, csv: (l) => (l.preco / 100).toFixed(2).replace('.', ',') },
    { titulo: 'LC 116', valor: (l) => l.item_lista_servico || h('span', { class: 'txt-alerta' }, 'definir'), csv: (l) => l.item_lista_servico || '' },
    { titulo: 'ISS', classe: 'num', valor: (l) => (l.aliquota_iss !== null && l.aliquota_iss !== undefined ? `${String(l.aliquota_iss).replace('.', ',')}%` : '—') },
  ],
});
