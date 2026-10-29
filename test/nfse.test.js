'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { lerPfx, cnpjDoCertificado } = require('../src/nfse/pkcs12');
const nacional = require('../src/nfse/nacional');

const fixture = (nome) => fs.readFileSync(path.join(__dirname, 'fixtures', nome));

test('lê certificado A1 moderno (AES) e antigo (RC2/3DES) e recusa senha errada', () => {
  for (const nome of ['certificado-teste.pfx', 'certificado-teste-legado.pfx']) {
    const c = lerPfx(fixture(nome), 'senha123');
    assert.equal(cnpjDoCertificado(c.certificado), '11222333000181', nome);
    // A chave privada corresponde ao certificado.
    const assinatura = crypto.sign('sha256', Buffer.from('teste'), c.chave);
    assert.ok(crypto.verify('sha256', Buffer.from('teste'), c.certificado.publicKey, assinatura), nome);
    assert.throws(() => lerPfx(fixture(nome), 'errada'), /Senha do certificado incorreta/);
  }
  assert.throws(() => lerPfx(Buffer.from('não é um certificado'), 'x'), /inválido/);
});

test('DPS: texto limpo para o leiaute e assinatura XMLDSig válida', () => {
  const cert = lerPfx(fixture('certificado-teste.pfx'), 'senha123');
  const dps = nacional.montarDps({
    nota: { valor_servicos: 123456, item_lista_servico: '13.03', discriminacao: 'Vídeo “institucional” — 2 diárias\n• edição', iss_retido: 0 },
    empresa: { cnpj: '11.222.333/0001-81', codigo_municipio: '2704500', regime_tributario: 'mei' },
    cliente: { nome: 'Ana & Cia', documento: '529.982.247-25', cep: '57955-000', logradouro: 'Rua A', bairro: 'Centro', codigo_municipio: '2704500' },
    ambiente: 'producao', serie: 1, numero: 7,
  });
  assert.equal(dps.id, 'DPS270450021122233300018100001000000000000007');
  assert.match(dps.xml, /<tpAmb>1<\/tpAmb>/);
  assert.match(dps.xml, /<CPF>52998224725<\/CPF><xNome>Ana &amp; Cia<\/xNome>/);
  assert.match(dps.xml, /<nro>S\/N<\/nro>/);
  assert.match(dps.xml, /<xDescServ>Vídeo "institucional" - 2 diárias\n- edição<\/xDescServ>/);
  assert.match(dps.xml, /<cTribNac>130301<\/cTribNac>/);
  assert.match(dps.xml, /<vServ>1234.56<\/vServ>/);

  const xml = nacional.assinar(dps.xml, { tagRaiz: 'DPS', tagInfo: 'infDPS', id: dps.id }, cert);
  const info = xml.slice(xml.indexOf('<infDPS '), xml.indexOf('</infDPS>') + 9).replace('<infDPS ', '<infDPS xmlns="http://www.sped.fazenda.gov.br/nfse" ');
  const digest = /<DigestValue>([^<]+)<\/DigestValue>/.exec(xml)[1];
  assert.equal(digest, crypto.createHash('sha1').update(info).digest('base64'));
  const signedInfo = /<SignedInfo>.*<\/SignedInfo>/.exec(xml)[0].replace('<SignedInfo>', '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">');
  const valor = Buffer.from(/<SignatureValue>([^<]+)<\/SignatureValue>/.exec(xml)[1], 'base64');
  assert.ok(crypto.verify('sha1', Buffer.from(signedInfo), cert.certificado.publicKey, valor));
});

test('mensagens de erro do governo ficam legíveis', () => {
  assert.equal(nacional.mensagemDeErro({ erros: [{ codigo: 'E1', descricao: 'Falhou', complemento: 'campo X' }] }, 400), 'E1: Falhou (campo X)');
  assert.equal(nacional.mensagemDeErro({}, 500), 'O sistema da NFS-e respondeu com erro 500');
});
