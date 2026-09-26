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

// Converte a resposta da Focus para os campos da nota no ERP.
function interpretar(r) {
  const status = r.status;
  if (status === 'autorizado') {
    return {
      status: 'emitida',
      numero: r.numero || null,
      codigo_verificacao: r.codigo_verificacao || null,
      data_emissao: (r.data_emissao || new Date().toISOString()).slice(0, 10),
      url_pdf: r.url_danfse || r.url || null,
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
  return {
    emitir: async (ref, payload) => interpretar(await chamar('POST', `/v2/nfse?ref=${encodeURIComponent(ref)}`, payload)),
    consultar: async (ref) => interpretar(await chamar('GET', `/v2/nfse/${encodeURIComponent(ref)}`)),
    cancelar: async (ref, justificativa) => interpretar(await chamar('DELETE', `/v2/nfse/${encodeURIComponent(ref)}`, { justificativa })),
  };
}

module.exports = { montarPayload, cliente, interpretar };
