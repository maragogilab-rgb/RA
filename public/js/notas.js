// Notas fiscais de serviço (NFS-e): rascunho, conferência de pendências, emissão e cancelamento.
import {
  trocar, GET, POST, PUT, DEL, qs, h, R$, dataBR, selo, modal, confirmar, formulario, tabela, cabecalho, filtros, btn, aviso,
  deCentavos, hoje, estado,
} from './nucleo.js';
import { ITENS_LC116 } from './cadastros.js';

const ROTULO_STATUS = { rascunho: 'Rascunho', processando: 'Processando', emitida: 'Emitida', erro: 'Erro', cancelada: 'Cancelada' };
const TOM_STATUS = { rascunho: 'info', processando: 'aviso', emitida: 'ok', erro: 'erro', cancelada: 'neutro' };
const seloNF = (st) => selo(ROTULO_STATUS[st], TOM_STATUS[st]);

// Abre o formulário da nota. `base` pode vir de uma sugestão (projeto/parcela) ou de uma nota existente.
export async function abrirNota(base = {}) {
  const [clientes, servicos] = await Promise.all([GET('/clientes?ativo=1'), GET('/servicos?ativo=1')]);
  const porServico = new Map(servicos.map((s) => [String(s.id), s]));
  const form = formulario([
    { nome: 'cliente_id', rotulo: 'Cliente (tomador)', tipo: 'select', obrigatorio: true, largura: 'cheio',
      opcoes: [['', 'Selecione…'], ...clientes.map((c) => [c.id, `${c.nome}${c.documento ? ` — ${c.documento}` : ''}`])] },
    { nome: 'servico_id', rotulo: 'Serviço', tipo: 'select', largura: 'cheio', opcoes: [['', '—'], ...servicos.map((s) => [s.id, s.nome])],
      ajuda: 'Ao escolher, preenche os códigos fiscais do serviço' },
    { nome: 'discriminacao', rotulo: 'Discriminação do serviço (texto da nota)', tipo: 'textarea', obrigatorio: true, largura: 'cheio' },
    { nome: 'valor_servicos', rotulo: 'Valor do serviço (R$)', tipo: 'moeda', obrigatorio: true },
    { nome: 'aliquota', rotulo: 'Alíquota do ISS (%)', tipo: 'number' },
    { nome: 'item_lista_servico', rotulo: 'Item da lista de serviços (LC 116)', tipo: 'select', largura: 'cheio',
      opcoes: [['', '—'], ...ITENS_LC116.map(([c, t]) => [c, `${c} — ${t}`])] },
    { nome: 'codigo_tributario_municipio', rotulo: 'Código de tributação do município' },
    { nome: 'cnae', rotulo: 'CNAE' },
    { nome: 'iss_retido', rotulo: 'ISS retido pelo tomador', tipo: 'checkbox', padrao: false },
  ], base);
  // Garante que um item LC 116 fora da lista padrão também apareça.
  if (base.item_lista_servico && !ITENS_LC116.some(([c]) => c === base.item_lista_servico)) {
    form.els.item_lista_servico.append(h('option', { value: base.item_lista_servico, selected: true }, base.item_lista_servico));
  }
  form.els.servico_id.addEventListener('change', () => {
    const s = porServico.get(form.els.servico_id.value);
    if (!s) return;
    if (s.item_lista_servico) form.els.item_lista_servico.value = s.item_lista_servico;
    if (s.aliquota_iss !== null && s.aliquota_iss !== undefined) form.els.aliquota.value = s.aliquota_iss;
    if (s.codigo_tributario_municipio) form.els.codigo_tributario_municipio.value = s.codigo_tributario_municipio;
    if (s.cnae) form.els.cnae.value = s.cnae;
    if (!form.els.discriminacao.value) form.els.discriminacao.value = s.descricao || s.nome;
  });

  const pend = base.pendencias?.length ? h('div', { class: 'faixa faixa-info' },
    h('strong', {}, 'Antes de emitir, complete:'), h('ul', {}, base.pendencias.map((p) => h('li', {}, p)))) : null;

  modal(base.id ? `Editar nota (rascunho #${base.id})` : 'Nova nota fiscal de serviço', h('div', {}, pend, form.el), {
    largo: true,
    acoes: [
      { texto: 'Cancelar', acao: () => {} },
      { texto: 'Salvar rascunho', classe: 'btn-primario', acao: async () => {
        const d = { ...form.ler(), projeto_id: base.projeto_id, lancamento_id: base.lancamento_id };
        const n = base.id ? await PUT(`/notas/${base.id}`, d) : await POST('/notas', d);
        aviso('Rascunho salvo');
        location.hash = `#/notas/${n.id}`;
        estado.recarregar();
      } },
    ],
  });
}

// Atalho usado por projetos e financeiro: sugere a nota a partir da origem.
export async function novaNotaDe(origem) {
  try {
    await abrirNota(await GET(`/notas/sugestao${qs(origem)}`));
  } catch (e) {
    aviso(e.message, 'erro');
  }
}

export async function lista(raiz) {
  const area = h('div');
  const f = filtros([
    { nome: 'busca', rotulo: 'Buscar cliente, número ou texto…' },
    { nome: 'status', tipo: 'select', rotulo: 'Situação', opcoes: [['', 'Todas'], ...Object.entries(ROTULO_STATUS)] },
    { nome: 'de', tipo: 'date', rotulo: 'De' },
    { nome: 'ate', tipo: 'date', rotulo: 'Até' },
  ], carregar);

  async function carregar(filtro = f.valores()) {
    const dados = await GET(`/notas${qs(filtro)}`);
    const emitidas = dados.filter((n) => n.status === 'emitida');
    trocar(area,
      h('div', { class: 'resumo-linha' },
        h('span', {}, `${emitidas.length} emitida(s): `, h('strong', {}, R$(emitidas.reduce((s, n) => s + n.valor_servicos, 0)))),
        h('span', {}, 'ISS: ', h('strong', {}, R$(emitidas.reduce((s, n) => s + n.valor_iss, 0))))),
      tabela([
        { titulo: 'Número', valor: (l) => l.numero || '—' },
        { titulo: 'Emissão', valor: (l) => dataBR(l.data_emissao) || '—' },
        { titulo: 'Cliente', valor: (l) => l.cliente_nome },
        { titulo: 'Discriminação', valor: (l) => h('span', { class: 'texto-curto' }, l.discriminacao.split('\n')[0]), csv: (l) => l.discriminacao },
        { titulo: 'Valor', classe: 'num', valor: (l) => R$(l.valor_servicos), csv: (l) => deCentavos(l.valor_servicos) },
        { titulo: 'ISS', classe: 'num', valor: (l) => R$(l.valor_iss), csv: (l) => deCentavos(l.valor_iss) },
        { titulo: 'Situação', valor: (l) => seloNF(l.status), csv: (l) => ROTULO_STATUS[l.status] },
      ], dados, { aoClicar: (l) => { location.hash = `#/notas/${l.id}`; }, nomeArquivo: 'notas-fiscais', vazio: 'Nenhuma nota ainda. Emita a partir de um projeto, de uma parcela a receber ou pelo botão acima.' }),
    );
  }

  const cfg = estado.empresa || {};
  const modo = cfg.regime_tributario === 'mei' && cfg.nfse_provedor !== 'focusnfe'
    ? h('div', { class: 'faixa faixa-info' }, 'MEI: emita a NFS-e no Emissor Nacional (',
      h('a', { href: 'https://www.nfse.gov.br/EmissorNacional', target: '_blank', rel: 'noopener' }, 'nfse.gov.br/EmissorNacional'),
      '). Aqui o sistema prepara os dados — use "Copiar dados" — e depois você registra o número da nota. Como MEI, o ISS já é pago no DAS: não é preciso informar alíquota.')
    : cfg.nfse_provedor === 'focusnfe' && cfg.nfse_token_configurado
    ? h('div', { class: 'faixa faixa-ok' }, `Emissão automática ativa (Focus NFe — ${cfg.nfse_ambiente === 'producao' ? 'PRODUÇÃO' : 'homologação/teste'}).`)
    : h('div', { class: 'faixa faixa-info' }, 'Modo manual: o sistema prepara os dados da nota, você emite no portal da prefeitura e registra o número aqui. ',
      estado.usuario.papel === 'admin' ? h('a', { href: '#/configuracoes' }, 'Configurar emissão automática →') : null);

  trocar(raiz, cabecalho('Notas fiscais', btn('Nova nota', () => abrirNota(), 'btn-primario')), modo, f.el, area);
  await carregar();
}

export async function detalhe(raiz, { id }) {
  const n = await GET(`/notas/${id}`);
  const cfg = estado.empresa || {};
  const automatico = cfg.nfse_provedor === 'focusnfe' && cfg.nfse_token_configurado;
  const executar = (fn) => async () => { try { await fn(); estado.recarregar(); } catch (e) { aviso(e.message, 'erro'); estado.recarregar(); } };
  const editavel = ['rascunho', 'erro'].includes(n.status);

  const registrar = () => {
    const form = formulario([
      { nome: 'numero', rotulo: 'Número da NFS-e', obrigatorio: true },
      { nome: 'codigo_verificacao', rotulo: 'Código de verificação' },
      { nome: 'data_emissao', rotulo: 'Data de emissão', tipo: 'date', padrao: hoje() },
      { nome: 'url_pdf', rotulo: 'Link da nota (opcional)', largura: 'cheio' },
    ]);
    modal('Registrar nota emitida no portal da prefeitura', form.el, {
      acoes: [
        { texto: 'Cancelar', acao: () => {} },
        { texto: 'Registrar', classe: 'btn-primario', acao: async () => {
          await POST(`/notas/${id}/registrar`, form.ler());
          aviso('Nota registrada');
          estado.recarregar();
        } },
      ],
    });
  };

  const cancelar = () => {
    const form = formulario([{ nome: 'justificativa', rotulo: 'Motivo do cancelamento (mín. 15 caracteres)', tipo: 'textarea', obrigatorio: true, largura: 'cheio' }]);
    modal('Cancelar nota fiscal', h('div', {},
      h('p', {}, n.provedor === 'focusnfe' ? 'O cancelamento será enviado à prefeitura.' : 'Cancele a nota também no portal da prefeitura; aqui ela ficará marcada como cancelada.'),
      form.el), {
      acoes: [
        { texto: 'Voltar', acao: () => {} },
        { texto: 'Cancelar nota', classe: 'btn-perigo', acao: async () => {
          await POST(`/notas/${id}/cancelar`, form.ler());
          aviso('Nota cancelada');
          estado.recarregar();
        } },
      ],
    });
  };

  const copiar = async () => {
    const texto = [
      `Tomador: ${n.cliente_nome} — ${n.cliente_documento || ''}`,
      `Item LC 116: ${n.item_lista_servico || ''}`,
      n.codigo_tributario_municipio ? `Código de tributação municipal: ${n.codigo_tributario_municipio}` : null,
      `Alíquota ISS: ${n.aliquota}%${n.iss_retido ? ' (retido)' : ''}`,
      `Valor: ${R$(n.valor_servicos)}`,
      '',
      n.discriminacao,
    ].filter((l) => l !== null).join('\n');
    try { await navigator.clipboard.writeText(texto); aviso('Dados copiados. Cole no portal da prefeitura.'); } catch { aviso('Não foi possível copiar', 'erro'); }
  };

  const acoes = [btn('Voltar', () => { location.hash = '#/notas'; }, 'btn-fantasma')];
  if (editavel) {
    acoes.push(btn('Editar', () => abrirNota(n)));
    acoes.push(btn('Excluir', executar(async () => {
      if (!await confirmar('Excluir este rascunho?', 'Excluir', 'btn-perigo')) return;
      await DEL(`/notas/${id}`);
      location.hash = '#/notas';
    }), 'btn-fantasma'));
    acoes.push(btn('Copiar dados', copiar));
    acoes.push(btn('Registrar nota emitida', registrar, automatico ? '' : 'btn-primario'));
    if (automatico) {
      acoes.push(btn('Emitir NFS-e', executar(async () => {
        if (!await confirmar(`Emitir a nota de ${R$(n.valor_servicos)} para ${n.cliente_nome}${cfg.nfse_ambiente === 'producao' ? ' em PRODUÇÃO (nota com validade fiscal)' : ' em homologação (teste)'}?`, 'Emitir')) return;
        const r = await POST(`/notas/${id}/emitir`);
        aviso(r.status === 'emitida' ? 'Nota emitida!' : r.status === 'erro' ? 'A prefeitura recusou a nota; veja o motivo.' : 'Nota enviada; aguardando a prefeitura.', r.status === 'erro' ? 'erro' : 'ok');
      }), 'btn-primario'));
    }
  }
  if (n.status === 'processando') acoes.push(btn('Atualizar situação', executar(() => POST(`/notas/${id}/consultar`)), 'btn-primario'));
  if (n.status === 'emitida') {
    if (n.url_pdf) acoes.push(h('a', { class: 'btn', href: n.url_pdf, target: '_blank', rel: 'noopener' }, 'Abrir PDF'));
    acoes.push(btn('Cancelar nota', cancelar, 'btn-perigo'));
  }

  const info = (rotulo, valor) => h('div', { class: 'info' }, h('span', {}, rotulo), h('strong', {}, valor || '—'));
  trocar(raiz,
    cabecalho(n.numero ? `NFS-e nº ${n.numero}` : `Nota fiscal (rascunho #${n.id})`, ...acoes),
    n.pendencias.length ? h('div', { class: 'faixa faixa-info' }, h('strong', {}, 'Faltam dados para emitir:'),
      h('ul', {}, n.pendencias.map((p) => h('li', {}, p.includes('Configurações') ? h('a', { href: '#/configuracoes' }, p)
        : p.startsWith('Cliente') ? h('a', { href: '#/clientes' }, p) : p)))) : null,
    n.status === 'erro' && n.mensagem ? h('div', { class: 'faixa faixa-alerta', role: 'alert' }, h('strong', {}, 'Recusada: '), n.mensagem) : null,
    h('section', { class: 'cartao' }, h('div', { class: 'grade-info' },
      info('Situação', seloNF(n.status)),
      info('Tomador', n.cliente_nome),
      info('CPF/CNPJ', n.cliente_documento),
      info('Valor do serviço', R$(n.valor_servicos)),
      info('ISS', `${R$(n.valor_iss)} (${String(n.aliquota).replace('.', ',')}%${n.iss_retido ? ', retido' : ''})`),
      info('Item LC 116', n.item_lista_servico),
      n.codigo_tributario_municipio ? info('Cód. tributação municipal', n.codigo_tributario_municipio) : null,
      n.cnae ? info('CNAE', n.cnae) : null,
      n.numero ? info('Número', n.numero) : null,
      n.codigo_verificacao ? info('Código de verificação', n.codigo_verificacao) : null,
      n.data_emissao ? info('Emissão', dataBR(n.data_emissao)) : null,
      n.projeto_id ? info('Projeto', h('a', { href: `#/projetos/${n.projeto_id}` }, `#${n.projeto_id} ${n.projeto_titulo || ''}`)) : null,
      info('Emissão via', n.provedor === 'focusnfe' ? 'Focus NFe (automática)' : 'Portal da prefeitura (manual)')),
      h('div', { class: 'escopo' }, h('h3', {}, 'Discriminação'), h('p', {}, n.discriminacao)),
      n.status === 'cancelada' && n.mensagem ? h('p', { class: 'mudo' }, n.mensagem) : null),
  );
}
