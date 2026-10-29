'use strict';

// Emissão direta na NFS-e Nacional (Sefin Nacional / gov.br), sem intermediários.
// Fluxo: monta a DPS (XML no leiaute oficial), assina com o certificado A1 (XMLDSig),
// compacta (GZip + Base64) e envia por HTTPS com o mesmo certificado (TLS mútuo).
// A resposta é síncrona: ou volta a NFS-e autorizada (chave de acesso), ou a lista de erros.

const crypto = require('node:crypto');
const https = require('node:https');
const tls = require('node:tls');
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');
const { lerPfx } = require('./pkcs12');

const NS = 'http://www.sped.fazenda.gov.br/nfse';
const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const VERSAO = '1.01';
const VER_APLIC = 'ERP-MaragogiLab-1.0';

const URLS = {
  producao: 'https://sefin.nfse.gov.br/SefinNacional',
  homologacao: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional',
};
// Consulta pública da nota (não precisa de certificado).
const CONSULTA_PUBLICA = 'https://www.nfse.gov.br/consultapublica/?tpc=1&chave=';
const DANFSE = {
  producao: 'https://adn.nfse.gov.br/danfse/',
  homologacao: 'https://adn.producaorestrita.nfse.gov.br/danfse/',
};

// Raízes da ICP-Brasil, além das raízes padrão, só para os servidores da NFS-e.
const CA = [...tls.rootCertificates, fs.readFileSync(path.join(__dirname, 'icp-brasil.pem'), 'utf8')];

// ---------- Texto no XML ----------
// O leiaute aceita apenas caracteres até U+00FF (Latin-1); troca os comuns e remove o resto.
const TROCAS = { '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '•': '-', ' ': ' ' };
function limpar(valor, { quebras = false, max = 2000 } = {}) {
  let s = String(valor ?? '').normalize('NFC').replace(/[–—‘’“”…• ]/g, (c) => TROCAS[c]);
  s = s.replace(/\r\n?/g, '\n');
  s = quebras ? s.replace(/[^\n\x20-\xff]/g, '') : s.replace(/\s+/g, ' ').replace(/[^\x20-\xff]/g, '');
  s = s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return s.slice(0, max).trim();
}
const escapar = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Elemento já no formato canônico (C14N): sem auto-fechamento; vazio = omitido.
const el = (nome, valor) => (valor === undefined || valor === null || valor === '' ? '' : `<${nome}>${valor}</${nome}>`);
const txt = (nome, valor, opcoes) => {
  const s = limpar(valor, opcoes);
  return s ? el(nome, escapar(s)) : '';
};
const digitos = (v) => String(v || '').replace(/\D/g, '');
const dinheiro = (centavos) => (Math.round(centavos) / 100).toFixed(2);

// Data e hora de Brasília (-03:00), um minuto no passado para não ficar "no futuro" para o servidor.
function horarioBrasilia(agora = new Date()) {
  const d = new Date(agora.getTime() - 3 * 3600 * 1000 - 60 * 1000);
  return { dataHora: `${d.toISOString().slice(0, 19)}-03:00`, data: d.toISOString().slice(0, 10) };
}

// Código de tributação nacional (6 dígitos). "17.06" vira "170601".
function codigoTributacaoNacional(item) {
  const s = String(item || '').trim();
  if (/^\d{6}$/.test(s)) return s;
  const m = /^(\d{1,2})\.(\d{2})(?:\.(\d{2}))?$/.exec(s);
  return m ? `${m[1].padStart(2, '0')}${m[2]}${m[3] || '01'}` : s.replace(/\D/g, '');
}

// Opção pelo Simples Nacional: 1 = não optante, 2 = MEI, 3 = ME/EPP.
const OPCAO_SIMPLES = { mei: '2', simples: '3' };

function idDps({ codigoMunicipio, cnpj, serie, numero }) {
  return `DPS${codigoMunicipio}2${digitos(cnpj).padStart(14, '0')}${String(serie).padStart(5, '0')}${String(numero).padStart(15, '0')}`;
}

// Monta a DPS sem assinatura. Ordem dos campos conforme o XSD oficial (DPS_v1.01).
function montarDps({ nota, empresa, cliente, ambiente, serie, numero, agora }) {
  const { dataHora, data } = horarioBrasilia(agora);
  const cnpj = digitos(empresa.cnpj);
  const municipio = digitos(empresa.codigo_municipio);
  const opcao = OPCAO_SIMPLES[empresa.regime_tributario] || '1';
  const id = idDps({ codigoMunicipio: municipio, cnpj, serie, numero });
  const doc = digitos(cliente.documento);
  const telefoneCliente = digitos(cliente.telefone);
  const emailCliente = limpar(cliente.email_nf || cliente.email, { max: 80 });
  const nbs = digitos(nota.codigo_nbs);
  const cTribMun = digitos(nota.codigo_tributario_municipio);

  const prest = `<prest>${el('CNPJ', cnpj)}${opcao === '2' ? '' : txt('IM', empresa.inscricao_municipal, { max: 15 })}`
    + `<regTrib>${el('opSimpNac', opcao)}${opcao === '3' ? el('regApTribSN', '1') : ''}${el('regEspTrib', '0')}</regTrib></prest>`;

  const toma = `<toma>${el(doc.length === 11 ? 'CPF' : 'CNPJ', doc)}${txt('IM', cliente.inscricao_municipal, { max: 15 })}`
    + `${txt('xNome', cliente.nome, { max: 300 })}`
    + `<end><endNac>${el('cMun', digitos(cliente.codigo_municipio))}${el('CEP', digitos(cliente.cep))}</endNac>`
    + `${txt('xLgr', cliente.logradouro, { max: 255 })}${txt('nro', cliente.numero || 'S/N', { max: 60 })}`
    + `${txt('xCpl', cliente.complemento, { max: 156 })}${txt('xBairro', cliente.bairro, { max: 60 })}</end>`
    + `${telefoneCliente.length >= 6 ? el('fone', telefoneCliente.slice(0, 20)) : ''}`
    + `${/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailCliente) ? el('email', escapar(emailCliente)) : ''}</toma>`;

  const serv = `<serv><locPrest>${el('cLocPrestacao', municipio)}</locPrest>`
    + `<cServ>${el('cTribNac', codigoTributacaoNacional(nota.item_lista_servico))}`
    + `${cTribMun.length === 3 ? el('cTribMun', cTribMun) : ''}`
    + `${txt('xDescServ', nota.discriminacao, { quebras: true, max: 2000 })}`
    + `${nbs.length === 9 ? el('cNBS', nbs) : ''}</cServ></serv>`;

  // MEI e Simples recolhem o ISS no DAS: sem alíquota na nota.
  const aliquota = opcao === '1' && nota.aliquota ? el('pAliq', Number(nota.aliquota).toFixed(2)) : '';
  const valores = `<valores><vServPrest>${el('vServ', dinheiro(nota.valor_servicos))}</vServPrest>`
    + `<trib><tribMun>${el('tribISSQN', '1')}${el('tpRetISSQN', nota.iss_retido ? '2' : '1')}${aliquota}</tribMun>`
    + `<totTrib>${el('indTotTrib', '0')}</totTrib></trib></valores>`;

  const inf = `<infDPS Id="${id}">${el('tpAmb', ambiente === 'producao' ? '1' : '2')}${el('dhEmi', dataHora)}${el('verAplic', VER_APLIC)}`
    + `${el('serie', String(serie))}${el('nDPS', String(numero))}${el('dCompet', data)}${el('tpEmit', '1')}${el('cLocEmi', municipio)}`
    + `${prest}${toma}${serv}${valores}</infDPS>`;
  return { id, xml: `<DPS xmlns="${NS}" versao="${VERSAO}">${inf}</DPS>` };
}

// ---------- Assinatura XMLDSig (RSA-SHA1, C14N, envelopada) ----------
// O XML é gerado já no formato canônico, então o trecho assinado é exatamente o texto do elemento,
// com a declaração de namespace herdada da raiz (regra do C14N para subconjuntos).
function assinar(xml, { tagRaiz, tagInfo, id }, cert) {
  const inicio = xml.indexOf(`<${tagInfo} `);
  const fim = xml.indexOf(`</${tagInfo}>`) + tagInfo.length + 3;
  const info = xml.slice(inicio, fim);
  const canonico = info.replace(`<${tagInfo} `, `<${tagInfo} xmlns="${NS}" `);
  const digest = crypto.createHash('sha1').update(canonico, 'utf8').digest('base64');
  const signedInfo = `<SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>`
    + `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>`
    + `<Reference URI="#${id}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>`
    + `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform></Transforms>`
    + `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod><DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
  const signedInfoCanonico = signedInfo.replace('<SignedInfo>', `<SignedInfo xmlns="${NS_DSIG}">`);
  const valor = crypto.sign('sha1', Buffer.from(signedInfoCanonico, 'utf8'), cert.chave).toString('base64');
  const assinatura = `<Signature xmlns="${NS_DSIG}">${signedInfo}<SignatureValue>${valor}</SignatureValue>`
    + `<KeyInfo><X509Data><X509Certificate>${cert.certificado.raw.toString('base64')}</X509Certificate></X509Data></KeyInfo></Signature>`;
  return xml.replace(`</${tagRaiz}>`, `${assinatura}</${tagRaiz}>`);
}

const compactar = (xml) => zlib.gzipSync(Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, 'utf8')).toString('base64');
const descompactar = (b64) => zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
const tag = (xml, nome) => new RegExp(`<${nome}>([^<]*)</${nome}>`).exec(xml || '')?.[1] || null;

// Pedido de cancelamento (evento e101101).
function montarCancelamento({ chave, cnpj, ambiente, justificativa, agora }) {
  const { dataHora } = horarioBrasilia(agora);
  const id = `PRE${chave}101101`;
  const xml = `<pedRegEvento xmlns="${NS}" versao="${VERSAO}"><infPedReg Id="${id}">${el('tpAmb', ambiente === 'producao' ? '1' : '2')}`
    + `${el('verAplic', VER_APLIC)}${el('dhEvento', dataHora)}${el('CNPJAutor', digitos(cnpj))}${el('chNFSe', chave)}`
    + `<e101101>${el('xDesc', 'Cancelamento de NFS-e')}${el('cMotivo', '9')}${txt('xMotivo', justificativa, { max: 255 })}</e101101>`
    + `</infPedReg></pedRegEvento>`;
  return { id, xml };
}

// Junta as mensagens de erro, que vêm com nomes de campo variados.
function mensagemDeErro(corpo, status) {
  const lista = corpo?.erros || corpo?.Erros || corpo?.erro || [];
  const itens = (Array.isArray(lista) ? lista : [lista]).map((e) => {
    if (typeof e === 'string') return e;
    const codigo = e.Codigo || e.codigo;
    const texto = e.Descricao || e.descricao || e.Mensagem || e.mensagem || '';
    const extra = e.Complemento || e.complemento;
    return `${codigo ? `${codigo}: ` : ''}${texto}${extra ? ` (${extra})` : ''}`;
  }).filter(Boolean);
  if (itens.length) return itens.join(' | ');
  return corpo?.mensagem || corpo?.message || corpo?.title || `O sistema da NFS-e respondeu com erro ${status}`;
}

// ---------- Cliente HTTPS com TLS mútuo ----------
function criarCliente(empresa, { requisitar } = {}) {
  if (!empresa.nfse_cert) throw new Error('Envie o certificado digital A1 em Configurações');
  let cert;
  try {
    cert = lerPfx(Buffer.from(empresa.nfse_cert, 'base64'), empresa.nfse_cert_senha || '');
  } catch (e) {
    throw new Error(`Certificado digital: ${e.message}`);
  }
  const ambiente = empresa.nfse_ambiente === 'producao' ? 'producao' : 'homologacao';
  const base = URLS[ambiente];

  const chamar = requisitar || ((metodo, url, corpo) => new Promise((resolve, reject) => {
    const dados = corpo ? Buffer.from(JSON.stringify(corpo)) : null;
    const req = https.request(url, {
      method: metodo,
      key: cert.chavePem,
      cert: cert.certPem,
      ca: CA,
      minVersion: 'TLSv1.2',
      headers: { Accept: 'application/json', ...(dados ? { 'Content-Type': 'application/json', 'Content-Length': dados.length } : {}) },
      timeout: 60000,
    }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => resolve({ status: res.statusCode, tipo: res.headers['content-type'] || '', corpo: Buffer.concat(partes) }));
    });
    req.on('timeout', () => req.destroy(new Error('O sistema da NFS-e demorou demais para responder')));
    req.on('error', (e) => reject(new Error(`Não foi possível conectar ao sistema da NFS-e Nacional: ${e.message}`)));
    if (dados) req.write(dados);
    req.end();
  }));
  const json = async (metodo, caminho, corpo) => {
    const r = await chamar(metodo, `${base}${caminho}`, corpo);
    let dados = {};
    try { dados = r.corpo.length ? JSON.parse(r.corpo.toString('utf8')) : {}; } catch { dados = { mensagem: r.corpo.toString('utf8').slice(0, 300) }; }
    return { status: r.status, dados };
  };

  // Converte a NFS-e devolvida pelo governo nos campos da nota no ERP.
  const autorizada = (chave, nfseXml) => ({
    status: 'emitida',
    numero: tag(nfseXml, 'nNFSe'),
    codigo_verificacao: chave,
    data_emissao: (tag(nfseXml, 'dhProc') || new Date().toISOString()).slice(0, 10),
    url_pdf: `${CONSULTA_PUBLICA}${chave}`,
    url_xml: null,
    mensagem: null,
  });

  return {
    ambiente,
    certificado: cert.certificado,
    montar: (dados) => montarDps({ ...dados, ambiente }),

    async emitir(dps) {
      const xml = assinar(dps.xml, { tagRaiz: 'DPS', tagInfo: 'infDPS', id: dps.id }, cert);
      const r = await json('POST', '/nfse', { dpsXmlGZipB64: compactar(xml) });
      if (r.status >= 200 && r.status < 300 && r.dados.chaveAcesso) {
        const nfse = r.dados.nfseXmlGZipB64 ? descompactar(r.dados.nfseXmlGZipB64) : '';
        return { ...autorizada(r.dados.chaveAcesso, nfse), xml: nfse };
      }
      return { status: 'erro', mensagem: mensagemDeErro(r.dados, r.status) };
    },

    // Descobre se uma DPS enviada virou nota (útil quando a conexão caiu no meio do envio).
    async consultar(idDpsEnviada) {
      const r = await json('GET', `/dps/${encodeURIComponent(idDpsEnviada)}`);
      if (r.status === 404) return { status: 'erro', mensagem: 'A nota não chegou ao sistema da NFS-e. Pode enviar de novo.' };
      if (r.status >= 300 || !r.dados.chaveAcesso) throw new Error(mensagemDeErro(r.dados, r.status));
      const n = await json('GET', `/nfse/${r.dados.chaveAcesso}`);
      const nfse = n.dados.nfseXmlGZipB64 ? descompactar(n.dados.nfseXmlGZipB64) : '';
      return { ...autorizada(r.dados.chaveAcesso, nfse), xml: nfse };
    },

    async cancelar(chave, justificativa) {
      const ev = montarCancelamento({ chave, cnpj: empresa.cnpj, ambiente, justificativa });
      const xml = assinar(ev.xml, { tagRaiz: 'pedRegEvento', tagInfo: 'infPedReg', id: ev.id }, cert);
      const r = await json('POST', `/nfse/${chave}/eventos`, { pedidoRegistroEventoXmlGZipB64: compactar(xml) });
      if (r.status >= 200 && r.status < 300) return { status: 'cancelada' };
      return { status: 'erro', mensagem: mensagemDeErro(r.dados, r.status) };
    },

    // PDF oficial da nota (DANFSe).
    async danfse(chave) {
      const r = await chamar('GET', `${DANFSE[ambiente]}${chave}`);
      if (r.status !== 200 || !/pdf/i.test(r.tipo)) throw new Error(`PDF da nota indisponível (${r.status})`);
      return r.corpo;
    },
  };
}

module.exports = {
  montarDps, montarCancelamento, assinar, criarCliente, codigoTributacaoNacional, idDps, limpar, compactar, descompactar, mensagemDeErro, URLS,
};
