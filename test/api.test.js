'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { abrir } = require('../src/db');
const { garantirAdmin } = require('../src/auth');
const { criarApp } = require('../src/app');
const { somarMeses, dividirParcelas, hoje } = require('../src/validar');

let servidor;
let base;
let cookie = '';

async function api(metodo, caminho, corpo, { semCookie = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie && !semCookie) headers.Cookie = cookie;
  const r = await fetch(base + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const texto = await r.text();
  return { status: r.status, dados: texto ? JSON.parse(texto) : null };
}

// Simula a API da Focus NFe e guarda as chamadas recebidas.
const chamadasFocus = [];
let respostaFocus = { status: 'processando_autorizacao' };
async function fetchFocusFalso(url, init) {
  chamadasFocus.push({ url, metodo: init.method, corpo: init.body ? JSON.parse(init.body) : null, auth: init.headers.Authorization });
  return new Response(JSON.stringify(respostaFocus), { status: 200 });
}

before(async () => {
  const db = abrir(':memory:');
  garantirAdmin(db, { email: 'admin@teste.com', senha: 'senha-forte-1' });
  servidor = http.createServer(criarApp(db, { log: false, fetchNfse: fetchFocusFalso }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor.close());

test('utilitários de data e parcelas', () => {
  assert.equal(somarMeses('2026-01-31', 1), '2026-02-28');
  assert.equal(somarMeses('2026-11-15', 2), '2027-01-15');
  assert.equal(somarMeses('2026-03-10', -3), '2025-12-10');
  assert.deepEqual(dividirParcelas(1000, 3), [334, 333, 333]);
});

test('exige autenticação e rejeita senha errada', async () => {
  assert.equal((await api('GET', '/api/clientes')).status, 401);
  assert.equal((await api('POST', '/api/login', { email: 'admin@teste.com', senha: 'errada' })).status, 401);
  const ok = await api('POST', '/api/login', { email: 'admin@teste.com', senha: 'senha-forte-1' });
  assert.equal(ok.status, 200);
  assert.equal(ok.dados.papel, 'admin');
  assert.equal((await api('GET', '/api/me')).dados.email, 'admin@teste.com');
});

test('bloqueia mutações sem JSON (CSRF)', async () => {
  const r = await fetch(`${base}/api/clientes`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'nome=x',
  });
  assert.equal(r.status, 415);
});

let clienteId;
let fornecedorId;
let servicoId;
let projetoId;

test('cadastros de clientes, fornecedores e serviços', async () => {
  assert.equal((await api('POST', '/api/clientes', {})).status, 400);
  assert.equal((await api('POST', '/api/clientes', { nome: 'X', documento: '12.345.678/0001-90' })).status, 400);
  assert.equal((await api('POST', '/api/clientes', { nome: 'X', tipo_pessoa: 'PF', documento: '111.111.111-11' })).status, 400);
  const c = await api('POST', '/api/clientes', {
    nome: 'Pousada Mar Azul Ltda', documento: '11.222.333/0001-81', uf: 'al', cep: '57955-000', codigo_municipio: '2704500',
  });
  assert.equal(c.status, 201);
  assert.equal(c.dados.uf, 'AL');
  assert.equal(c.dados.cep, '57955000');
  clienteId = c.dados.id;
  fornecedorId = (await api('POST', '/api/fornecedores', { nome: 'Carlos (drone freelancer)' })).dados.id;
  const s = await api('POST', '/api/servicos', { nome: 'Vídeo institucional', categoria: 'Audiovisual', unidade: 'projeto', preco: 450000 });
  assert.equal(s.status, 201);
  servicoId = s.dados.id;
  assert.equal((await api('POST', '/api/servicos', { nome: 'X', unidade: 'litro' })).status, 400);
  assert.equal((await api('GET', '/api/clientes?busca=mar azul')).dados.length, 1);
});

test('proposta -> aprovação gera parcelas a receber', async () => {
  const prop = await api('POST', '/api/projetos', {
    cliente_id: clienteId, titulo: 'Vídeo institucional da pousada', parcelas: 2, desconto: 50000,
    primeiro_vencimento: '2026-01-15',
    itens: [{ servico_id: servicoId }, { descricao: 'Imagens aéreas com drone', quantidade: 1, preco_unitario: 80000 }],
  });
  assert.equal(prop.status, 201);
  assert.equal(prop.dados.status, 'proposta');
  assert.equal(prop.dados.itens[0].descricao, 'Vídeo institucional');
  assert.equal(prop.dados.subtotal, 530000);
  assert.equal(prop.dados.total, 480000);
  projetoId = prop.dados.id;

  const ap = await api('POST', `/api/projetos/${projetoId}/aprovar`, {});
  assert.equal(ap.dados.status, 'aprovado');
  assert.deepEqual(ap.dados.receitas.map((l) => [l.valor, l.vencimento]), [[240000, '2026-01-15'], [240000, '2026-02-15']]);
  assert.equal((await api('POST', `/api/projetos/${projetoId}/aprovar`, {})).status, 409);
  assert.equal((await api('PUT', `/api/projetos/${projetoId}`, { cliente_id: clienteId, titulo: 'x', itens: [{ descricao: 'a' }] })).status, 409);
});

test('custos do projeto e lucro', async () => {
  const custo = await api('POST', '/api/lancamentos', {
    tipo: 'pagar', descricao: 'Diária drone', categoria: 'Freelancers', valor: 60000, vencimento: hoje(),
    fornecedor_id: fornecedorId, projeto_id: projetoId, pago: true,
  });
  assert.equal(custo.status, 201);
  assert.equal(custo.dados.status, 'pago');
  const p = await api('GET', `/api/projetos/${projetoId}`);
  assert.equal(p.dados.resumo.receita, 480000);
  assert.equal(p.dados.resumo.custos, 60000);
  assert.equal(p.dados.resumo.lucro, 420000);
  assert.equal(p.dados.resumo.margem, 87.5);
});

test('etapas de produção e cancelamento', async () => {
  assert.equal((await api('POST', `/api/projetos/${projetoId}/etapa`, { status: 'producao' })).dados.status, 'producao');
  const ent = await api('POST', `/api/projetos/${projetoId}/etapa`, { status: 'entregue' });
  assert.equal(ent.dados.data_entrega, hoje());

  const parcela = ent.dados.receitas[0];
  assert.equal((await api('POST', `/api/lancamentos/${parcela.id}/cancelar`)).status, 409);
  await api('POST', `/api/lancamentos/${parcela.id}/pagar`, {});
  assert.equal((await api('POST', `/api/projetos/${projetoId}/cancelar`)).status, 409);
  await api('POST', `/api/lancamentos/${parcela.id}/estornar`);

  const dup = await api('POST', `/api/projetos/${projetoId}/duplicar`);
  assert.equal(dup.status, 201);
  assert.equal(dup.dados.status, 'proposta');
  assert.equal(dup.dados.itens.length, 2);
  assert.equal((await api('POST', `/api/projetos/${dup.dados.id}/recusar`)).dados.status, 'recusado');

  const canc = await api('POST', `/api/projetos/${projetoId}/cancelar`);
  assert.equal(canc.dados.status, 'cancelado');
  assert.ok(canc.dados.receitas.every((l) => l.status === 'cancelado'));
});

test('contratos de fee mensal geram cobranças sem duplicar', async () => {
  const c = await api('POST', '/api/contratos', {
    cliente_id: clienteId, descricao: 'Gestão de redes sociais', valor: 180000, dia_vencimento: 5, inicio: '2026-01-01',
  });
  assert.equal(c.status, 201);
  assert.equal((await api('POST', '/api/contratos', { cliente_id: clienteId, descricao: 'x', valor: 1, dia_vencimento: 31 })).status, 400);
  await api('POST', '/api/contratos', { cliente_id: clienteId, descricao: 'Encerrado', valor: 1000, inicio: '2025-01-01', fim: '2025-06-30' });

  const g = await api('POST', '/api/contratos/gerar-cobrancas', { competencia: '2026-03' });
  assert.equal(g.dados.geradas, 1);
  assert.equal(g.dados.total, 180000);
  assert.equal((await api('POST', '/api/contratos/gerar-cobrancas', { competencia: '2026-03' })).dados.geradas, 0);
  const l = (await api('GET', '/api/lancamentos?tipo=receber&busca=redes')).dados;
  assert.equal(l[0].vencimento, '2026-03-05');
  assert.equal(l[0].descricao, 'Gestão de redes sociais - 03/2026');
  assert.equal((await api('POST', '/api/contratos/gerar-cobrancas', { competencia: '2025-12' })).dados.geradas, 0);
});

test('lançamentos manuais, fluxo de caixa, painel e relatórios', async () => {
  const l = await api('POST', '/api/lancamentos', { tipo: 'pagar', descricao: 'Aluguel', categoria: 'Aluguel', valor: 150000, vencimento: hoje() });
  await api('POST', `/api/lancamentos/${l.dados.id}/pagar`, { data: hoje() });
  const mes = (await api('GET', '/api/financeiro/fluxo')).dados.find((m) => m.mes === hoje().slice(0, 7));
  assert.equal(mes.saidas, 210000);

  const d = await api('GET', '/api/dashboard');
  assert.equal(d.status, 200);
  assert.equal(d.dados.receita_recorrente, 180000);
  assert.equal(d.dados.saldo_mes, -210000);

  for (const r of ['lucro-por-projeto', 'faturamento-por-cliente', 'faturamento-por-servico', 'despesas-por-categoria']) {
    assert.equal((await api('GET', `/api/relatorios/${r}?de=2025-01-01&ate=2027-12-31`)).status, 200, r);
  }
  const porCliente = (await api('GET', '/api/relatorios/faturamento-por-cliente?de=2026-01-01&ate=2026-12-31')).dados;
  assert.equal(porCliente[0].recorrente, 180000);
});

test('nota fiscal: pendências, emissão manual e automática (Focus NFe)', async () => {
  const cli = (await api('POST', '/api/clientes', { nome: 'Restaurante Sabor do Mar Ltda', tipo_pessoa: 'PJ', documento: '11.444.777/0001-61' })).dados;
  const serv = (await api('POST', '/api/servicos', {
    nome: 'Gestão de redes sociais', preco: 150000, item_lista_servico: '17.06', aliquota_iss: 2, cnae: '7311-4/00',
  })).dados;
  assert.equal(serv.cnae, '7311400');

  const sug = await api('GET', `/api/notas/sugestao?projeto_id=${projetoId}`);
  assert.equal(sug.status, 200);
  assert.equal(sug.dados.valor_servicos, 480000);
  assert.match(sug.dados.discriminacao, /Imagens aéreas com drone/);
  assert.ok(sug.dados.pendencias.some((p) => p.includes('Empresa: CNPJ')));

  const nota = await api('POST', '/api/notas', {
    cliente_id: cli.id, servico_id: serv.id, discriminacao: 'Gestão de redes sociais - setembro', valor_servicos: 150000,
    aliquota: 2, item_lista_servico: '17.06',
  });
  assert.equal(nota.status, 201);
  assert.equal(nota.dados.valor_iss, 3000);
  assert.ok(nota.dados.pendencias.includes('Cliente: CEP'));
  assert.equal((await api('POST', `/api/notas/${nota.dados.id}/emitir`)).status, 400);

  // Emissão manual (portal da prefeitura)
  const man = await api('POST', `/api/notas/${nota.dados.id}/registrar`, { numero: '123', codigo_verificacao: 'ABC' });
  assert.equal(man.dados.status, 'emitida');
  assert.equal((await api('POST', `/api/notas/${nota.dados.id}/cancelar`, { justificativa: 'curta' })).status, 400);
  assert.equal((await api('POST', `/api/notas/${nota.dados.id}/cancelar`, { justificativa: 'Valor emitido incorretamente' })).dados.status, 'cancelada');

  // Completa os dados e configura a emissão automática
  await api('PUT', `/api/clientes/${cli.id}`, {
    ...cli, cep: '57955-000', logradouro: 'Rua da Praia', numero: '10', bairro: 'Centro', cidade: 'Maragogi', uf: 'AL', codigo_municipio: '2704500',
  });
  const emp = await api('PUT', '/api/empresa', {
    nome: 'Maragogi Lab', razao_social: 'Maragogi Lab Ltda', cnpj: '11.222.333/0001-81', inscricao_municipal: '1234',
    regime_tributario: 'simples', codigo_municipio: '2704500', nfse_provedor: 'focusnfe', nfse_ambiente: 'homologacao', nfse_token: 'token-secreto',
  });
  assert.equal(emp.dados.nfse_token, undefined);
  assert.equal(emp.dados.nfse_token_configurado, true);

  const n2 = (await api('POST', '/api/notas', {
    cliente_id: cli.id, discriminacao: 'Gestão de redes sociais - outubro', valor_servicos: 150000, aliquota: 2, item_lista_servico: '17.06',
  })).dados;
  assert.deepEqual(n2.pendencias, []);
  const env = await api('POST', `/api/notas/${n2.id}/emitir`);
  assert.equal(env.dados.status, 'processando');
  const chamada = chamadasFocus.at(-1);
  assert.match(chamada.url, /^https:\/\/homologacao\.focusnfe\.com\.br\/v2\/nfse\?ref=nf-/);
  assert.equal(chamada.auth, `Basic ${Buffer.from('token-secreto:').toString('base64')}`);
  assert.equal(chamada.corpo.servico.valor_servicos, 1500);
  assert.equal(chamada.corpo.tomador.cnpj, '11444777000161');
  assert.equal(chamada.corpo.prestador.inscricao_municipal, '1234');
  assert.equal(chamada.corpo.optante_simples_nacional, true);

  respostaFocus = { status: 'autorizado', numero: '987', codigo_verificacao: 'XYZ', url_danfse: 'https://exemplo/nf.pdf' };
  const cons = await api('POST', `/api/notas/${n2.id}/consultar`);
  assert.equal(cons.dados.status, 'emitida');
  assert.equal(cons.dados.numero, '987');
  assert.equal(cons.dados.url_pdf, 'https://exemplo/nf.pdf');

  respostaFocus = { status: 'erro_autorizacao', erros: [{ codigo: 'E1', mensagem: 'Alíquota inválida' }] };
  const n3 = (await api('POST', '/api/notas', { cliente_id: cli.id, discriminacao: 'x', valor_servicos: 100, aliquota: 2, item_lista_servico: '17.06' })).dados;
  const errada = await api('POST', `/api/notas/${n3.id}/emitir`);
  assert.equal(errada.dados.status, 'erro');
  assert.match(errada.dados.mensagem, /Alíquota inválida/);
});

test('agenda, assinatura .ics e tarefas', async () => {
  assert.equal((await api('POST', '/api/eventos', { titulo: 'X', data: '2026-10-10', hora: '25:00' })).status, 400);
  const ev = await api('POST', '/api/eventos', { titulo: 'Casamento Ana, praia', tipo: 'Casamento', data: '2026-10-10', hora: '16:30', local: 'Maragogi', cliente_id: clienteId });
  assert.equal(ev.status, 201);
  assert.equal(ev.dados.cliente_nome, 'Pousada Mar Azul Ltda');
  const { dados: { caminho } } = await api('GET', '/api/agenda/assinatura');
  const r = await fetch(base + caminho);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/calendar/);
  const texto = await r.text();
  assert.match(texto, /SUMMARY:Casamento Ana\\, praia/);
  assert.match(texto, /DTSTART;TZID=America\/Maceio:20261010T163000/);
  assert.equal((await fetch(`${base}/api/publico/agenda/errado.ics`)).status, 404);

  const t = await api('POST', '/api/tarefas', { titulo: 'Ligar para cliente', prazo: '2020-01-01', prioridade: 'alta', responsavel_id: 1 });
  assert.equal(t.status, 201);
  assert.equal(t.dados.responsavel_nome, 'Administrador');
  const d = await api('GET', '/api/dashboard');
  assert.ok(d.dados.lembretes.some((l) => l.tipo === 'tarefa' && l.texto.includes('Ligar para cliente')));
  assert.equal((await api('POST', `/api/tarefas/${t.dados.id}/feito`, { feito: true })).dados.feito, 1);
  assert.equal((await api('GET', '/api/tarefas?feito=0')).dados.length, 0);
});

test('comissão de parceiro, área, link público do orçamento e PDF da nota', async () => {
  const parceiro = (await api('POST', '/api/clientes', { nome: 'Cerimonial Parceiro', relacao: 'parceiro' })).dados;
  const prop = (await api('POST', '/api/projetos', {
    cliente_id: clienteId, titulo: 'Cobertura casamento', area: 'Eventos sociais (casamentos)', parceiro_id: parceiro.id, comissao_pct: 10,
    observacoes: 'segredo interno', itens: [{ descricao: 'Cobertura', preco_unitario: 300000 }],
  })).dados;
  const ap = (await api('POST', `/api/projetos/${prop.id}/aprovar`, {})).dados;
  assert.equal(ap.receitas[0].area, 'Eventos sociais (casamentos)');
  assert.equal(ap.custos.length, 1);
  assert.equal(ap.custos[0].valor, 30000);
  assert.equal(ap.resumo.lucro, 270000);

  const link = (await api('POST', `/api/projetos/${prop.id}/link`)).dados;
  assert.equal((await api('POST', `/api/projetos/${prop.id}/link`)).dados.token, link.token);
  const pub = await (await fetch(`${base}/api/publico/orcamento/${link.token}`)).json();
  assert.equal(pub.orcamento.total, 300000);
  const json = JSON.stringify(pub);
  for (const proibido of ['segredo interno', 'custos', 'resumo', 'receitas', 'nfse_token', 'parceiro']) assert.ok(!json.includes(proibido), proibido);
  assert.equal((await fetch(`${base}/api/publico/orcamento/${'x'.repeat(24)}`)).status, 404);

  // Cancelar o projeto cancela também a comissão em aberto.
  const canc = (await api('POST', `/api/projetos/${prop.id}/cancelar`)).dados;
  assert.ok(canc.custos.every((l) => l.status === 'cancelado'));

  const nota = (await api('POST', '/api/notas', { cliente_id: clienteId, discriminacao: 'x', valor_servicos: 100, item_lista_servico: '17.06' })).dados;
  assert.equal((await api('POST', `/api/notas/${nota.id}/arquivo`, { nome: 'nf.txt', conteudo: 'data:text/plain;base64,eA==' })).status, 400);
  const pdf = Buffer.from('%PDF-1.4 teste').toString('base64');
  const anexo = await api('POST', `/api/notas/${nota.id}/arquivo`, { nome: 'NF 12.pdf', conteudo: `data:application/pdf;base64,${pdf}` });
  assert.equal(anexo.dados.arquivo_nome, 'NF 12.pdf');
  const r = await fetch(`${base}/api/notas/${nota.id}/arquivo`, { headers: { Cookie: cookie } });
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.equal(await r.text(), '%PDF-1.4 teste');
  assert.equal((await fetch(`${base}/api/notas/${nota.id}/arquivo`)).status, 401);
});

test('painel: metas por área e reservas do caixa', async () => {
  await api('PUT', '/api/empresa', { meta_mensal: 6000, metas_area: { 'Eventos sociais (casamentos)': 5000 }, reserva_imposto_pct: 6, reserva_equip_pct: 5 });
  assert.equal((await api('PUT', '/api/empresa', { metas_area: '[1,2]' })).status, 400);
  const d = (await api('GET', '/api/dashboard')).dados;
  assert.equal(d.metas.mensal, 600000);
  assert.ok(d.metas.areas.some((a) => a.area === 'Eventos sociais (casamentos)' && a.meta === 500000));
  assert.equal(d.reservas.imposto, Math.round(d.reservas.recebido * 0.06));
  assert.equal(d.reservas.disponivel, d.reservas.recebido - d.reservas.despesas - d.reservas.imposto - d.reservas.equipamento);
  assert.ok((await api('GET', '/api/areas')).dados.includes('Serviços gráficos (impressão, papelaria, sinalização)'));
});

test('usuários: somente admin gerencia, usuário comum é bloqueado', async () => {
  const u = await api('POST', '/api/usuarios', { nome: 'Sócio', email: 'socio@teste.com', senha: 'curta' });
  assert.equal(u.status, 400);
  const ok = await api('POST', '/api/usuarios', { nome: 'Sócio', email: 'socio@teste.com', senha: 'senha-do-socio' });
  assert.equal(ok.status, 201);

  const adminCookie = cookie;
  await api('POST', '/api/login', { email: 'socio@teste.com', senha: 'senha-do-socio' }, { semCookie: true });
  assert.equal((await api('GET', '/api/usuarios')).status, 403);
  assert.equal((await api('GET', '/api/clientes')).status, 200);
  await api('POST', '/api/logout');
  assert.equal((await api('GET', '/api/clientes')).status, 401);
  cookie = adminCookie;
});

test('servidor de arquivos não permite sair da pasta pública', async () => {
  const r = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.notEqual((await r.text()).includes('"name": "erp-empresa"'), true);
});
