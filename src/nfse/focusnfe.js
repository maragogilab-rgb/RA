'use strict';

// Integração com a API de NFS-e da Focus NFe (https://focusnfe.com.br/doc/#nfse).
// A Focus NFe faz a ponte com o sistema da prefeitura; é preciso ter conta lá,
// cadastrar a empresa e enviar o certificado digital A1 pelo painel deles.

const URLS = {
  homologacao: 'https://homologacao.focusnfe.com.br',
  producao: 'https://api.focusnfe.com.br',
};

const reais = (centavos) => Math.round(centavos) / 100;

function montarPayload({ nota, empresa, cliente }) {
  const doc = String(cliente.documento || '').replace(/\D/g, '');
  const tomador = {
    [doc.length === 11 ? 'cpf' : 'cnpj']: doc,
    razao_social: cliente.nome,
    email: cliente.email_nf || cliente.email || undefined,
    telefone: cliente.telefone ? cliente.telefone.replace(/\D/g, '') : undefined,
    inscricao_municipal: cliente.inscricao_municipal || undefined,
    endereco: {
      logradouro: cliente.logradouro,
      numero: cliente.numero || 'S/N',
      complemento: cliente.complemento || undefined,
      bairro: cliente.bairro,
      codigo_municipio: cliente.codigo_municipio,
      uf: cliente.uf,
      cep: cliente.cep,
    },
  };
  return {
    data_emissao: new Date().toISOString(),
    natureza_operacao: '1',
    optante_simples_nacional: ['simples', 'mei'].includes(empresa.regime_tributario),
    prestador: {
      cnpj: String(empresa.cnpj).replace(/\D/g, ''),
      inscricao_municipal: empresa.inscricao_municipal,
      codigo_municipio: empresa.codigo_municipio,
    },
    tomador,
    servico: {
      valor_servicos: reais(nota.valor_servicos),
      aliquota: nota.aliquota,
      iss_retido: Boolean(nota.iss_retido),
      item_lista_servico: nota.item_lista_servico,
      codigo_tributario_municipio: nota.codigo_tributario_municipio || undefined,
      codigo_cnae: nota.cnae || undefined,
      discriminacao: nota.discriminacao,
      codigo_municipio: empresa.codigo_municipio,
    },
  };
}

// Qual API da Focus usar: 'nfsen' (NFS-e Nacional, gov.br) ou 'nfse' (sistema da prefeitura).
// Sem escolha explícita, o MEI vai para a Nacional, onde ele é obrigado a emitir.
function apiDaEmpresa(empresa) {
  if (empresa.nfse_padrao === 'nacional') return 'nfsen';
  if (empresa.nfse_padrao === 'municipal') return 'nfse';
  return empresa.regime_tributario === 'mei' ? 'nfsen' : 'nfse';
}

// Código de tributação nacional (6 dígitos: item, subitem e desdobramento).
// Aceita o código pronto ("170601") ou o item da LC 116 ("17.06" vira "170601").
function codigoTributacaoNacional(item) {
  const s = String(item || '').trim();
  if (/^\d{6}$/.test(s)) return s;
  const m = /^(\d{1,2})\.(\d{2})(?:\.(\d{2}))?$/.exec(s);
  if (m) return `${m[1].padStart(2, '0')}${m[2]}${m[3] || '01'}`;
  return s.replace(/\D/g, '');
}

// Opção pelo Simples Nacional no padrão nacional: 1 = não optante, 2 = MEI, 3 = ME/EPP.
const OPCAO_SIMPLES = { mei: 2, simples: 3 };

function montarPayloadNacional({ nota, empresa, cliente, hoje = new Date().toISOString().slice(0, 10) }) {
  const doc = String(cliente.documento || '').replace(/\D/g, '');
  const mei = empresa.regime_tributario === 'mei';
  return {
    data_emissao: new Date().toISOString(),
    data_competencia: hoje,
    codigo_municipio_emissora: empresa.codigo_municipio,
    cnpj_prestador: String(empresa.cnpj).replace(/\D/g, ''),
    inscricao_municipal_prestador: empresa.inscricao_municipal || undefined,
    codigo_opcao_simples_nacional: OPCAO_SIMPLES[empresa.regime_tributario] || 1,
    regime_especial_tributacao: 0,
    [doc.length === 11 ? 'cpf_tomador' : 'cnpj_tomador']: doc,
    razao_social_tomador: cliente.nome,
    codigo_municipio_tomador: cliente.codigo_municipio,
    cep_tomador: String(cliente.cep || '').replace(/\D/g, ''),
    logradouro_tomador: cliente.logradouro,
    numero_tomador: cliente.numero || 'S/N',
    complemento_tomador: cliente.complemento || undefined,
    bairro_tomador: cliente.bairro,
    telefone_tomador: cliente.telefone ? cliente.telefone.replace(/\D/g, '') : undefined,
    email_tomador: cliente.email_nf || cliente.email || undefined,
    codigo_municipio_prestacao: empresa.codigo_municipio,
    codigo_tributacao_nacional_iss: codigoTributacaoNacional(nota.item_lista_servico),
    codigo_nbs: nota.codigo_nbs || undefined,
    descricao_servico: nota.discriminacao,
    valor_servico: reais(nota.valor_servicos),
    // 1 = operação tributável. MEI recolhe o ISS no DAS, sem alíquota na nota.
    tributacao_iss: 1,
    tipo_retencao_iss: nota.iss_retido ? 2 : 1,
    percentual_aliquota_relativa_municipio: !mei && nota.aliquota ? nota.aliquota : undefined,
  };
}

// Converte a resposta da Focus para os campos da nota no ERP.
function interpretar(r) {
  const status = r.status;
  if (status === 'autorizado') {
    return {
      status: 'emitida',
      numero: r.numero || null,
      codigo_verificacao: r.codigo_verificacao || null,
      data_emissao: (r.data_emissao || new Date().toISOString()).slice(0, 10),
      url_pdf: r.url_danfse || r.url || (r.caminho_danfse ? `${r.__base}${r.caminho_danfse}` : null),
      url_xml: r.caminho_xml_nota_fiscal ? `${r.__base}${r.caminho_xml_nota_fiscal}` : null,
      mensagem: null,
    };
  }
  if (status === 'cancelado') return { status: 'cancelada', mensagem: 'Nota cancelada na prefeitura' };
  if (status === 'erro_autorizacao') {
    const erros = (r.erros || []).map((e) => `${e.codigo ? `${e.codigo}: ` : ''}${e.mensagem}`).join(' | ');
    return { status: 'erro', mensagem: erros || r.mensagem || 'Erro na autorização' };
  }
  return { status: 'processando', mensagem: r.mensagem || 'Aguardando a prefeitura' };
}

function cliente(empresa, fetchImpl = globalThis.fetch) {
  const base = URLS[empresa.nfse_ambiente] || URLS.homologacao;
  const auth = `Basic ${Buffer.from(`${empresa.nfse_token}:`).toString('base64')}`;
  const chamar = async (metodo, caminho, corpo) => {
    let r;
    try {
      r = await fetchImpl(`${base}${caminho}`, {
        method: metodo,
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      throw new Error(`Não foi possível conectar à Focus NFe: ${e.message}`);
    }
    const texto = await r.text();
    let dados = {};
    try { dados = texto ? JSON.parse(texto) : {}; } catch { dados = { mensagem: texto }; }
    dados.__base = base;
    if (r.status === 401 || r.status === 403) throw new Error('Token da Focus NFe inválido ou sem permissão para esta empresa');
    if (!r.ok && !dados.status) throw new Error(dados.mensagem || `Focus NFe respondeu com erro ${r.status}`);
    return dados;
  };
  // `api` é 'nfse' (prefeitura) ou 'nfsen' (NFS-e Nacional).
  const caminho = (api) => `/v2/${api === 'nfsen' ? 'nfsen' : 'nfse'}`;
  return {
    emitir: async (ref, payload, api = 'nfse') => interpretar(await chamar('POST', `${caminho(api)}?ref=${encodeURIComponent(ref)}`, payload)),
    consultar: async (ref, api = 'nfse') => interpretar(await chamar('GET', `${caminho(api)}/${encodeURIComponent(ref)}`)),
    cancelar: async (ref, justificativa, api = 'nfse') => interpretar(await chamar('DELETE', `${caminho(api)}/${encodeURIComponent(ref)}`, { justificativa })),
  };
}

// Monta o corpo certo para a API escolhida.
const payloadPara = (api, dados) => (api === 'nfsen' ? montarPayloadNacional(dados) : montarPayload(dados));

module.exports = { montarPayload, montarPayloadNacional, payloadPara, apiDaEmpresa, codigoTributacaoNacional, cliente, interpretar };
