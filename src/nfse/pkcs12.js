'use strict';

// Leitura de certificado digital A1 (.pfx / .p12) sem bibliotecas externas.
// Suporta os formatos usados pelas certificadoras: PBES2 (PBKDF2 + AES/3DES),
// o formato PKCS#12 com 3DES e o antigo com RC2 (implementado aqui, pois o Node não traz mais o RC2).

const crypto = require('node:crypto');

const OID = {
  data: '1.2.840.113549.1.7.1',
  encryptedData: '1.2.840.113549.1.7.6',
  keyBag: '1.2.840.113549.1.12.10.1.1',
  shroudedKeyBag: '1.2.840.113549.1.12.10.1.2',
  certBag: '1.2.840.113549.1.12.10.1.3',
  x509Certificate: '1.2.840.113549.1.9.22.1',
  pbes2: '1.2.840.113549.1.5.13',
  pbkdf2: '1.2.840.113549.1.5.12',
};
// Cifras PKCS#12 (senha em BMPString + derivação própria): [cifra, tamanho da chave, bits efetivos do RC2].
const PBE_PKCS12 = {
  '1.2.840.113549.1.12.1.3': ['des-ede3-cbc', 24],
  '1.2.840.113549.1.12.1.4': ['des-ede-cbc', 16],
  '1.2.840.113549.1.12.1.5': ['rc2', 16, 128],
  '1.2.840.113549.1.12.1.6': ['rc2', 5, 40],
};
const PRF = {
  '1.2.840.113549.2.7': 'sha1', '1.2.840.113549.2.8': 'sha224', '1.2.840.113549.2.9': 'sha256',
  '1.2.840.113549.2.10': 'sha384', '1.2.840.113549.2.11': 'sha512',
};
const CIFRAS_PBES2 = {
  '2.16.840.1.101.3.4.1.2': ['aes-128-cbc', 16], '2.16.840.1.101.3.4.1.22': ['aes-192-cbc', 24],
  '2.16.840.1.101.3.4.1.42': ['aes-256-cbc', 32], '1.2.840.113549.3.7': ['des-ede3-cbc', 24],
};
const HASH_OID = {
  '1.3.14.3.2.26': 'sha1', '2.16.840.1.101.3.4.2.1': 'sha256', '2.16.840.1.101.3.4.2.2': 'sha384',
  '2.16.840.1.101.3.4.2.3': 'sha512', '2.16.840.1.101.3.4.2.4': 'sha224',
};

class ErroCertificado extends Error {}
const senhaErrada = () => new ErroCertificado('Senha do certificado incorreta');

// ---------- ASN.1 (DER, e BER com tamanho indefinido) ----------
function ler(buf, pos = 0) {
  if (pos + 2 > buf.length) throw new ErroCertificado('Arquivo de certificado inválido');
  const tag = buf[pos];
  let p = pos + 1;
  let len = buf[p++];
  const no = { buf, pos, tag, construido: Boolean(tag & 0x20), filhos: null };
  if (len === 0x80) {
    const lista = [];
    let q = p;
    while (!(buf[q] === 0 && buf[q + 1] === 0)) {
      const f = ler(buf, q);
      lista.push(f);
      q = f.fim;
    }
    Object.assign(no, { inicio: p, fimConteudo: q, fim: q + 2, filhos: lista });
    return no;
  }
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[p++];
  }
  if (p + len > buf.length) throw new ErroCertificado('Arquivo de certificado inválido');
  return Object.assign(no, { inicio: p, fimConteudo: p + len, fim: p + len });
}
function filhos(no) {
  if (!no.filhos) {
    const lista = [];
    for (let p = no.inicio; p < no.fimConteudo;) {
      const f = ler(no.buf, p);
      lista.push(f);
      p = f.fim;
    }
    no.filhos = lista;
  }
  return no.filhos;
}
const conteudo = (no) => no.buf.subarray(no.inicio, no.fimConteudo);
// OCTET STRING que pode vir partida em pedaços (BER construído).
const octetos = (no) => (no.construido ? Buffer.concat(filhos(no).map(octetos)) : Buffer.from(conteudo(no)));
const inteiro = (no) => conteudo(no).reduce((n, b) => n * 256 + b, 0);
function oid(no) {
  const b = conteudo(no);
  const partes = [Math.floor(b[0] / 40), b[0] % 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) {
    v = v * 128 + (b[i] & 0x7f);
    if (!(b[i] & 0x80)) { partes.push(v); v = 0; }
  }
  return partes.join('.');
}
const explicito = (no) => filhos(no)[0];

// ---------- Derivação de chave PKCS#12 (RFC 7292, apêndice B) ----------
function senhaBmp(senha) {
  const b = Buffer.alloc((senha.length + 1) * 2);
  for (let i = 0; i < senha.length; i++) b.writeUInt16BE(senha.charCodeAt(i), i * 2);
  return b;
}
function kdfPkcs12(senha, sal, iteracoes, id, n, hash = 'sha1') {
  const u = crypto.createHash(hash).digest().length;
  const v = ['sha384', 'sha512'].includes(hash) ? 128 : 64;
  const repetir = (src, tam) => { const out = Buffer.alloc(tam); for (let i = 0; i < tam; i++) out[i] = src[i % src.length]; return out; };
  const P0 = senhaBmp(senha);
  const D = Buffer.alloc(v, id);
  const S = sal.length ? repetir(sal, v * Math.ceil(sal.length / v)) : Buffer.alloc(0);
  const P = repetir(P0, v * Math.ceil(P0.length / v));
  const I = Buffer.concat([S, P]);
  const blocos = [];
  for (let feito = 0; feito < n; feito += u) {
    let A = crypto.createHash(hash).update(D).update(I).digest();
    for (let r = 1; r < iteracoes; r++) A = crypto.createHash(hash).update(A).digest();
    blocos.push(A);
    const B = repetir(A, v);
    for (let j = 0; j < I.length; j += v) {
      let vaiUm = 1;
      for (let k = v - 1; k >= 0; k--) {
        const s = I[j + k] + B[k] + vaiUm;
        I[j + k] = s & 0xff;
        vaiUm = s >> 8;
      }
    }
  }
  return Buffer.concat(blocos).subarray(0, n);
}

// ---------- RC2 (RFC 2268): decifragem em CBC ----------
const PITABLE = Buffer.from(
  'd978f9c419ddb5ed28e9fd794aa0d89d'
  + 'c67e37832b76538e624c6488448bfba2'
  + '179a59f587b34f1361456d8d09817d32'
  + 'bd8f40eb86b77b0bf09521225c6b4e82'
  + '54d66593ce60b21c7356c014a78cf1dc'
  + '1275ca1f3bbee4d1423dd430a33cb626'
  + '6fbf0eda4669075727f21d9bbc944303'
  + 'f811c7f690ef3ee706c3d52fc8661ed7'
  + '08e8eade8052eef784aa72ac354d6a2a'
  + '961ad2715a1549744b9fd05e0418a4ec'
  + 'c2e0416e0f51cbcc2491af50a1f47039'
  + '997c3a8523b8b47afc02365b25559731'
  + '2d5dfa98e38a92ae05df2910676cbac9'
  + 'd300e6cfe19ea82c6316013f58e289a9'
  + '0d38341bab33ffb0bb480c5fb9b1cd2e'
  + 'c5f3db47e5a59c770aa62068fe7fc1ad', 'hex');

function rc2Chave(chave, bitsEfetivos) {
  const L = Buffer.alloc(128);
  chave.copy(L);
  const T = chave.length;
  for (let i = T; i < 128; i++) L[i] = PITABLE[(L[i - 1] + L[i - T]) & 0xff];
  const T8 = Math.ceil(bitsEfetivos / 8);
  const TM = 0xff % 2 ** (8 + bitsEfetivos - 8 * T8);
  L[128 - T8] = PITABLE[L[128 - T8] & TM];
  for (let i = 127 - T8; i >= 0; i--) L[i] = PITABLE[L[i + 1] ^ L[i + T8]];
  const K = new Uint16Array(64);
  for (let i = 0; i < 64; i++) K[i] = L[2 * i] | (L[2 * i + 1] << 8);
  return K;
}
function rc2DecifrarBloco(K, bloco) {
  const R = new Uint16Array(4);
  for (let i = 0; i < 4; i++) R[i] = bloco[2 * i] | (bloco[2 * i + 1] << 8);
  const S = [1, 2, 3, 5];
  let j = 63;
  const mistura = () => {
    for (let i = 3; i >= 0; i--) {
      R[i] = ((R[i] >>> S[i]) | (R[i] << (16 - S[i])));
      R[i] = R[i] - K[j] - (R[(i + 3) % 4] & R[(i + 2) % 4]) - (~R[(i + 3) % 4] & R[(i + 1) % 4]);
      j--;
    }
  };
  const amassa = () => { for (let i = 3; i >= 0; i--) R[i] = R[i] - K[R[(i + 3) % 4] & 63]; };
  for (let r = 0; r < 5; r++) mistura();
  amassa();
  for (let r = 0; r < 6; r++) mistura();
  amassa();
  for (let r = 0; r < 5; r++) mistura();
  const out = Buffer.alloc(8);
  for (let i = 0; i < 4; i++) { out[2 * i] = R[i] & 0xff; out[2 * i + 1] = R[i] >> 8; }
  return out;
}
function rc2Cbc(chave, bitsEfetivos, iv, dados) {
  if (dados.length % 8) throw senhaErrada();
  const K = rc2Chave(chave, bitsEfetivos);
  const out = Buffer.alloc(dados.length);
  let anterior = iv;
  for (let p = 0; p < dados.length; p += 8) {
    const bloco = dados.subarray(p, p + 8);
    const claro = rc2DecifrarBloco(K, bloco);
    for (let i = 0; i < 8; i++) out[p + i] = claro[i] ^ anterior[i];
    anterior = bloco;
  }
  const pad = out[out.length - 1];
  if (pad < 1 || pad > 8 || out.subarray(out.length - pad).some((b) => b !== pad)) throw senhaErrada();
  return out.subarray(0, out.length - pad);
}

function decifrar(alg, dados, senha) {
  const [noOid, params] = filhos(alg);
  const id = oid(noOid);
  try {
    if (id === OID.pbes2) {
      const [kdf, cifra] = filhos(params);
      if (oid(filhos(kdf)[0]) !== OID.pbkdf2) throw new ErroCertificado('Certificado com proteção não suportada');
      const kp = filhos(filhos(kdf)[1]);
      const sal = octetos(kp[0]);
      const iteracoes = inteiro(kp[1]);
      let tamanho = null;
      let prf = 'sha1';
      for (const extra of kp.slice(2)) {
        if (extra.tag === 0x02) tamanho = inteiro(extra);
        else if (extra.tag === 0x30) prf = PRF[oid(filhos(extra)[0])] || prf;
      }
      const [cifraOid, ivNo] = filhos(cifra);
      const def = CIFRAS_PBES2[oid(cifraOid)];
      if (!def) throw new ErroCertificado('Certificado com cifra não suportada');
      const chave = crypto.pbkdf2Sync(Buffer.from(senha, 'utf8'), sal, iteracoes, tamanho || def[1], prf);
      const d = crypto.createDecipheriv(def[0], chave, octetos(ivNo));
      return Buffer.concat([d.update(dados), d.final()]);
    }
    const def = PBE_PKCS12[id];
    if (!def) throw new ErroCertificado('Certificado com proteção não suportada');
    const [salNo, iterNo] = filhos(params);
    const sal = octetos(salNo);
    const iteracoes = inteiro(iterNo);
    const chave = kdfPkcs12(senha, sal, iteracoes, 1, def[1]);
    const iv = kdfPkcs12(senha, sal, iteracoes, 2, 8);
    if (def[0] === 'rc2') return rc2Cbc(chave, def[2], iv, dados);
    const d = crypto.createDecipheriv(def[0], chave, iv);
    return Buffer.concat([d.update(dados), d.final()]);
  } catch (e) {
    if (e instanceof ErroCertificado) throw e;
    throw senhaErrada();
  }
}

function verificarMac(macData, dados, senha) {
  const [digestInfo, salNo, iterNo] = filhos(macData);
  const [alg, valor] = filhos(digestInfo);
  const hash = HASH_OID[oid(filhos(alg)[0])];
  if (!hash) return; // algoritmo desconhecido: a decifragem confirma a senha
  const esperado = octetos(valor);
  const chave = kdfPkcs12(senha, octetos(salNo), iterNo ? inteiro(iterNo) : 1, 3, esperado.length, hash);
  const calculado = crypto.createHmac(hash, chave).update(dados).digest();
  if (calculado.length !== esperado.length || !crypto.timingSafeEqual(calculado, esperado)) throw senhaErrada();
}

const spki = (chavePublica) => chavePublica.export({ type: 'spki', format: 'der' });

// Lê o .pfx e devolve a chave privada, o certificado do titular e a cadeia.
function lerPfx(pfx, senha = '') {
  let raiz;
  try { raiz = ler(Buffer.from(pfx)); } catch { throw new ErroCertificado('Arquivo de certificado inválido. Envie o arquivo .pfx ou .p12'); }
  const [, authSafe, macData] = filhos(raiz);
  if (!authSafe || oid(filhos(authSafe)[0]) !== OID.data) throw new ErroCertificado('Arquivo de certificado inválido. Envie o arquivo .pfx ou .p12');
  const dados = octetos(explicito(filhos(authSafe)[1]));
  if (macData) verificarMac(macData, dados, senha);

  const chaves = [];
  const certs = [];
  for (const info of filhos(ler(dados))) {
    const tipo = oid(filhos(info)[0]);
    let safeContents;
    if (tipo === OID.data) safeContents = octetos(explicito(filhos(info)[1]));
    else if (tipo === OID.encryptedData) {
      const encInfo = filhos(explicito(filhos(info)[1]))[1];
      const [, alg, cifrado] = filhos(encInfo);
      safeContents = decifrar(alg, octetos(cifrado), senha);
    } else continue;
    for (const bag of filhos(ler(safeContents))) {
      const id = oid(filhos(bag)[0]);
      const valor = explicito(filhos(bag)[1]);
      if (id === OID.keyBag) chaves.push(Buffer.from(valor.buf.subarray(valor.pos, valor.fim)));
      else if (id === OID.shroudedKeyBag) {
        const [alg, cifrado] = filhos(valor);
        chaves.push(decifrar(alg, octetos(cifrado), senha));
      } else if (id === OID.certBag) {
        const [certId, certValor] = filhos(valor);
        if (oid(certId) === OID.x509Certificate) certs.push(octetos(explicito(certValor)));
      }
    }
  }
  if (!chaves.length) throw new ErroCertificado('O arquivo não tem a chave privada do certificado');
  let chave;
  try { chave = crypto.createPrivateKey({ key: chaves[0], format: 'der', type: 'pkcs8' }); } catch { throw senhaErrada(); }
  const x509 = certs.map((d) => new crypto.X509Certificate(d));
  const minha = spki(crypto.createPublicKey(chave));
  const titular = x509.find((c) => spki(c.publicKey).equals(minha));
  if (!titular) throw new ErroCertificado('O arquivo não tem o certificado correspondente à chave');
  const cadeia = x509.filter((c) => c !== titular);
  return {
    chave,
    certificado: titular,
    cadeia,
    chavePem: chave.export({ type: 'pkcs8', format: 'pem' }),
    // Certificado do titular seguido da cadeia, para a conexão TLS.
    certPem: [titular, ...cadeia].map((c) => c.toString()).join(''),
  };
}

// CNPJ do titular: ICP-Brasil grava no "otherName" 2.16.76.1.3.3; o CN costuma ser "RAZAO SOCIAL:CNPJ".
function cnpjDoCertificado(cert) {
  const der = cert.raw;
  const marca = Buffer.from([0x06, 0x05, 0x60, 0x4c, 0x01, 0x03, 0x03]);
  const i = der.indexOf(marca);
  if (i >= 0) {
    const m = /\d{14}/.exec(der.subarray(i + marca.length, i + marca.length + 40).toString('latin1'));
    if (m) return m[0];
  }
  const cn = /CN=([^\n]+)/.exec(cert.subject)?.[1] || '';
  return /(\d{14})\s*$/.exec(cn)?.[1] || null;
}

module.exports = { lerPfx, cnpjDoCertificado, ErroCertificado, kdfPkcs12, rc2Cbc };
