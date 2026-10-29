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
  const teste = cfg.nfse_ambiente === 'producao' ? 'PRODUÇÃO' : 'TESTE — notas sem valor fiscal';
  const modo = cfg.nfse_automatica && cfg.nfse_provedor === 'nacional'
    ? h('div', { class: cfg.nfse_ambiente === 'producao' ? 'faixa faixa-ok' : 'faixa faixa-info' }, `Emissão automática direto no gov.br (NFS-e Nacional — ${teste}).`)
    : cfg.regime_tributario === 'mei' && !cfg.nfse_automatica
    ? h('div', { class: 'faixa faixa-info' }, 'MEI: emita a NFS-e no Emissor Nacional (',
      h('a', { href: 'https://www.nfse.gov.br/EmissorNacional', target: '_blank', rel: 'noopener' }, 'nfse.gov.br/EmissorNacional'),
      '). Aqui o sistema prepara os dados — use "Copiar dados" — e depois você registra o número da nota. Como MEI, o ISS já é pago no DAS: não é preciso informar alíquota. ',
      estado.usuario.papel === 'admin' ? h('a', { href: '#/configuracoes' }, 'Emitir automaticamente (enviar o certificado digital) →') : null)
    : cfg.nfse_automatica
    ? h('div', { class: 'faixa faixa-ok' }, `Emissão automática ativa (Focus NFe — ${teste}).`)
    : h('div', { class: 'faixa faixa-info' }, 'Modo manual: o sistema prepara os dados da nota, você emite no portal da prefeitura e registra o número aqui. ',
      estado.usuario.papel === 'admin' ? h('a', { href: '#/configuracoes' }, 'Configurar emissão automática →') : null);

  const piloto = h('div');
  const mostrarPiloto = (sit) => {
    if (!sit.configurada || sit.gatilho === 'desligado') {
      trocar(piloto, sit.configurada && estado.usuario.papel === 'admin'
        ? h('p', { class: 'mudo' }, 'Piloto automático desligado. ', h('a', { href: '#/configuracoes' }, 'Ligar a emissão automática →'))
        : null);
      return;
    }
    const quando = sit.gatilho === 'recebimento' ? 'quando o pagamento é recebido'
      : `no vencimento${sit.dias ? ` (${sit.dias} dia(s) antes)` : ''}`;
    const u = sit.ultimo;
    trocar(piloto, h('div', { class: 'faixa faixa-ok' },
      h('strong', {}, 'Piloto automático ligado: '),
      `as notas são criadas e enviadas sozinhas ${quando}, pela ${sit.padrao === 'nacional' ? 'NFS-e Nacional' : 'prefeitura'}`,
      sit.desde ? ` (contas a partir de ${dataBR(sit.desde)})` : '', '.',
      sit.fee_auto ? ' As mensalidades também são geradas todo mês.' : '',
      h('br'),
      u ? `Última verificação: ${new Date(u.quando).toLocaleString('pt-BR')}.` : 'Ainda não verificou.',
      sit.aguardando_dados ? h('span', {}, ' ', h('strong', {}, `${sit.aguardando_dados} nota(s) esperando dados do cadastro`), ' — veja os rascunhos.') : '',
      sit.recusadas ? h('span', {}, ' ', h('strong', {}, `${sit.recusadas} recusada(s) pela prefeitura`), ' — abra para ver o motivo.') : '',
      u?.falhas?.length ? h('span', {}, ' Falhas: ', u.falhas.join(' | ')) : '',
      ' ',
      btn('Verificar agora', async () => {
        try {
          const { resultado: r, situacao } = await POST('/notas/automacao/executar');
          aviso(`Notas criadas: ${r.criadas} · enviadas: ${r.enviadas} · autorizadas: ${r.emitidas}${r.recusadas ? ` · recusadas: ${r.recusadas}` : ''}`);
          mostrarPiloto(situacao);
          await carregar();
        } catch (e) { aviso(e.message, 'erro'); }
      }, 'btn-pequeno')));
  };

  trocar(raiz, cabecalho('Notas fiscais', btn('Nova nota', () => abrirNota(), 'btn-primario')), modo, piloto, f.el, area);
  await carregar();
  try { mostrarPiloto(await GET('/notas/automacao')); } catch { /* sem situação, segue sem a faixa */ }
}

export async function detalhe(raiz, { id }) {
  const n = await GET(`/notas/${id}`);
  const cfg = estado.empresa || {};
  const automatico = Boolean(cfg.nfse_automatica);
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
          aviso('Nota registrada. Agora anexe o PDF baixado do Emissor.');
          estado.recarregar();
        } },
      ],
    });
  };

  const cancelar = () => {
    const form = formulario([{ nome: 'justificativa', rotulo: 'Motivo do cancelamento (mín. 15 caracteres)', tipo: 'textarea', obrigatorio: true, largura: 'cheio' }]);
    modal('Cancelar nota fiscal', h('div', {},
      h('p', {}, n.provedor === 'nacional' ? 'O cancelamento será enviado ao sistema da NFS-e Nacional (gov.br).'
        : n.provedor === 'focusnfe' ? 'O cancelamento será enviado à prefeitura.' : 'Cancele a nota também no portal; aqui ela ficará marcada como cancelada.'),
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

  const anexar = () => {
    const inp = h('input', { type: 'file', accept: 'application/pdf,image/png,image/jpeg' });
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { aviso('Arquivo maior que 5 MB', 'erro'); return; }
      const conteudo = await new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = falha; r.readAsDataURL(f); });
      try {
        await POST(`/notas/${id}/arquivo`, { nome: f.name, conteudo });
        aviso('PDF anexado');
        estado.recarregar();
      } catch (e) { aviso(e.message, 'erro'); }
    });
    inp.click();
  };

  // Mensagem a partir do modelo em Configurações ({empresa}, {cliente}, {descricao}, {valor}, {data}, {responsavel}, {whatsapp}).
  const mensagem = () => {
    const vars = {
      empresa: cfg.nome || cfg.razao_social || '', cliente: (n.cliente_contato || n.cliente_nome || '').split(/[·@(]/)[0].trim(),
      descricao: n.discriminacao.split('\n')[0], valor: R$(n.valor_servicos), data: dataBR(n.data_emissao || hoje()),
      responsavel: estado.usuario.nome, whatsapp: cfg.telefone || '',
    };
    const preencher = (t) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return {
      assunto: preencher(cfg.email_nf_assunto || 'Nota Fiscal — {empresa} · {descricao}'),
      corpo: preencher(cfg.email_nf_corpo || 'Olá {cliente}, tudo bem?\n\nSegue a nota fiscal referente a "{descricao}", no valor de {valor}, emitida em {data}.\n\nQualquer dúvida, estou à disposição.\n\nAtenciosamente,\n{responsavel}\n{empresa} · {whatsapp}'),
    };
  };
  const enviarEmail = () => {
    const { assunto, corpo } = mensagem();
    aviso(n.arquivo_id ? 'Lembre de anexar o PDF da nota no e-mail' : 'Anexe o PDF da nota no e-mail');
    location.href = `mailto:${encodeURIComponent(n.cliente_email_nf || n.cliente_email || '')}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  };
  const enviarWhats = () => window.open(`https://wa.me/?text=${encodeURIComponent(mensagem().corpo)}`, '_blank', 'noopener');

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
        if (!await confirmar(`Emitir a nota de ${R$(n.valor_servicos)} para ${n.cliente_nome}${cfg.nfse_ambiente === 'producao' ? ' em PRODUÇÃO (nota com validade fiscal)' : ' em TESTE (sem valor fiscal)'}?`, 'Emitir')) return;
        const r = await POST(`/notas/${id}/emitir`);
        aviso(r.status === 'emitida' ? 'Nota emitida!' : r.status === 'erro' ? 'A nota foi recusada; veja o motivo.' : 'Nota enviada; aguardando a resposta.', r.status === 'erro' ? 'erro' : 'ok');
      }), 'btn-primario'));
    }
  }
  if (n.status === 'processando') acoes.push(btn('Atualizar situação', executar(() => POST(`/notas/${id}/consultar`)), 'btn-primario'));
  if (n.status === 'emitida') {
    if (n.arquivo_id) acoes.push(h('a', { class: 'btn', href: `/api/notas/${id}/arquivo`, target: '_blank', rel: 'noopener' }, 'Abrir PDF'));
    else if (n.url_pdf) acoes.push(h('a', { class: 'btn', href: n.url_pdf, target: '_blank', rel: 'noopener' }, n.provedor === 'nacional' ? 'Ver no gov.br' : 'Abrir PDF'));
    if (n.tem_xml) acoes.push(h('a', { class: 'btn', href: `/api/notas/${id}/xml`, download: '' }, 'Baixar XML'));
    acoes.push(btn(n.arquivo_id ? 'Trocar PDF' : 'Anexar PDF', anexar, n.arquivo_id ? 'btn-fantasma' : 'btn-primario'));
    acoes.push(btn('Enviar por e-mail', enviarEmail));
    acoes.push(btn('WhatsApp', enviarWhats));
    acoes.push(btn('Cancelar nota', cancelar, 'btn-perigo'));
  }

  const info = (rotulo, valor) => h('div', { class: 'info' }, h('span', {}, rotulo), h('strong', {}, valor || '—'));
  trocar(raiz,
    cabecalho(n.numero ? `NFS-e nº ${n.numero}` : n.status === 'rascunho' ? `Nota fiscal (rascunho #${n.id})` : `Nota fiscal #${n.id}`, ...acoes),
    n.pendencias.length ? h('div', { class: 'faixa faixa-info' }, h('strong', {}, 'Faltam dados para emitir:'),
      n.automatica ? h('p', {}, 'Esta nota foi criada pelo piloto automático e será enviada sozinha assim que os dados abaixo forem completados.') : null,
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
      n.codigo_verificacao && n.provedor !== 'nacional' ? info('Código de verificação', n.codigo_verificacao) : null,
      n.data_emissao ? info('Emissão', dataBR(n.data_emissao)) : null,
      n.projeto_id ? info('Projeto', h('a', { href: `#/projetos/${n.projeto_id}` }, `#${n.projeto_id} ${n.projeto_titulo || ''}`)) : null,
      info('Emissão via', n.provedor === 'nacional' ? 'Direto no gov.br (NFS-e Nacional)'
        : n.provedor === 'focusnfe' ? `Focus NFe — ${n.api === 'nfsen' ? 'NFS-e Nacional' : 'prefeitura'}` : 'Portal / Emissor Nacional (manual)'),
      n.provedor === 'nacional' && n.codigo_verificacao ? info('Chave de acesso', h('span', { class: 'texto-curto' }, n.codigo_verificacao)) : null,
      n.automatica ? info('Origem', 'Criada pelo piloto automático') : null,
      n.arquivo_nome ? info('PDF anexado', h('a', { href: `/api/notas/${id}/arquivo`, target: '_blank', rel: 'noopener' }, n.arquivo_nome)) : null),
      h('div', { class: 'escopo' }, h('h3', {}, 'Discriminação'), h('p', {}, n.discriminacao)),
      n.status === 'cancelada' && n.mensagem ? h('p', { class: 'mudo' }, n.mensagem) : null),
  );
}
