'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { abrir } = require('../src/db');
const { importarPainel, separarContato, separarEndereco } = require('../src/importar');
const { lerEmpresa } = require('../src/modulos/sistema');

// Backup fictício no formato do painel antigo.
const backup = {
  tipo: 'backup-painel-maragogi-lab',
  versao: 1,
  clientes: [
    { id: 'c1', nome: 'Buffet Exemplo', contato: '@buffet (Instagram)', estagio: 'Novo lead', segmento: 'Casamentos e sociais', tipoLead: 'parceiro' },
    { id: 'c2', nome: 'Loja Teste', contato: '', estagio: 'Fechado', segmento: 'Marcas locais', prazoFaturamento: '30' },
  ],
  orcamentos: [{
    id: 'o1', categoria: 'Locação de itens / Festas', clienteNome: 'Festa Nova', clienteContato: 'Maria · (82) 99999-1234',
    dataEmissao: '2026-09-04', dataValidade: '2026-09-25', status: 'rascunho', pagamento: 'Faturamento — a prazo',
    prazo: '5 dias úteis', retirada: 'Retirada no local.', obs: 'Termo 1\nTermo 2',
    itens: [
      { nome: 'Pipoca', desc: '', medida: '', qtd: 1, valor: 319.41 },
      { nome: 'Animador', desc: 'Pintura facial', medida: '2 horas', qtd: 2, valor: 468 },
    ],
  }, {
    id: 'o2', categoria: 'Gráfica', clienteNome: 'LOJA TESTE', status: 'aprovado', dataEmissao: '2026-09-23', itens: [{ nome: 'Carimbo', qtd: 1, valor: 64 }],
  }],
  financeiro: [
    { id: 'f1', tipo: 'receita', status: 'recebido', valor: 2000, data: '2026-09-21', descricao: 'Gráficos', categoria: 'Gráfica', clienteId: 'c2', notaEmitida: true, notaFilename: 'NF 1.pdf' },
    { id: 'f2', tipo: 'despesa', status: 'pago', valor: 36.7, data: '2026-09-22', descricao: 'Uber', categoria: 'Evento', clienteId: null, notaEmitida: false },
    { id: 'f3', tipo: 'receita', status: 'a_receber', valor: 1672, data: '2026-09-25', descricao: 'Cobertura', categoria: 'Evento', vertical: 'Corporativo', clienteId: null, notaEmitida: true },
  ],
  agenda: [{ id: 'a1', titulo: 'Cobertura casamento', tipo: 'Casamento', data: '2027-09-09', hora: '', local: 'Maceió', cliente: 'Noivos X' },
    { id: 'a2', titulo: 'Inauguração', data: '2026-09-26', hora: '15:17', cliente: 'loja teste' }],
  tarefas: [{ id: 't1', titulo: 'Orçar animador', prazo: '2026-09-28', prioridade: 'alta', responsavelId: 'eu', feito: false },
    { id: 't2', titulo: 'Recolher tela', prazo: '2026-09-17', prioridade: 'alta', responsavelId: 'xyz', feito: true }],
  config: {
    empresa: 'Maragogi Lab Ltda', documento: '11.222.333/0001-81', whatsapp: '(82) 90000-0000', tetoMeiAnual: 81000,
    endereco: 'Rua Exemplo, Q A, Nº 5, Centro, Maceió/AL, CEP 57081-140', pix: 'chave-pix', titularBanco: 'Fulano',
    banco: 'Banco X', agencia: '1', conta: '2', obsPadrao: 'Valores sujeitos a alteração.',
    metaMensal: 6000, metaAnual: 60000, metasVertical: { Corporativo: 10000 }, reservaImpostoPct: 6, reservaEquipPct: 5,
    diaVencimentoDAS: 20, comissaoParceria: 10, emailNfAssunto: 'NF {descricao}',
  },
};

test('separa contato e endereço em texto livre', () => {
  assert.deepEqual(separarContato('Alessandra · (82) 99922-8153'), { contato: 'Alessandra', telefone: '(82) 99922-8153' });
  assert.deepEqual(separarContato('@perfil (Instagram)'), { contato: '@perfil (Instagram)', telefone: null });
  const e = separarEndereco('Rua Santo Antônio, Q A, Nº 5, Tabuleiro dos Martins, Maceió/AL, CEP 57081-140');
  assert.equal(e.cep, '57081140');
  assert.equal(e.numero, '5');
  assert.equal(e.bairro, 'Tabuleiro dos Martins');
  assert.equal(e.cidade, 'Maceió');
  assert.equal(e.uf, 'AL');
});

test('importa backup do painel antigo sem duplicar', () => {
  const db = abrir(':memory:');
  assert.throws(() => importarPainel(db, { tipo: 'outro' }, null), /não reconhecido/);

  const r = importarPainel(db, backup, null);
  assert.equal(r.clientes, 3); // 2 do cadastro + "Festa Nova" criada pelo orçamento
  assert.equal(r.orcamentos, 2);
  assert.equal(r.lancamentos, 3);
  assert.equal(r.notas, 1);
  assert.equal(r.eventos, 2);
  assert.equal(r.tarefas, 2);
  const ev = db.prepare('SELECT * FROM eventos ORDER BY data').all();
  assert.equal(ev[0].hora, '15:17');
  assert.equal(ev[0].cliente_id, db.prepare("SELECT id FROM clientes WHERE nome = 'Loja Teste'").get().id);
  assert.equal(ev[1].cliente_texto, 'Noivos X');
  const tf = db.prepare('SELECT * FROM tarefas ORDER BY id').all();
  assert.equal(tf[1].feito, 1);

  const parceiro = db.prepare("SELECT * FROM clientes WHERE nome = 'Buffet Exemplo'").get();
  assert.equal(parceiro.relacao, 'parceiro');
  assert.equal(parceiro.estagio, 'Novo lead');

  const festa = db.prepare("SELECT * FROM clientes WHERE nome = 'Festa Nova'").get();
  assert.equal(festa.contato, 'Maria');
  assert.equal(festa.telefone, '(82) 99999-1234');

  const orc = db.prepare("SELECT * FROM projetos WHERE categoria = 'Locação de itens / Festas'").get();
  assert.equal(orc.status, 'proposta');
  assert.equal(orc.total, 31941 + 93600);
  assert.equal(orc.condicoes_titulo, 'Retirada / devolução');
  assert.equal(orc.termos, 'Termo 1\nTermo 2');
  const itens = db.prepare('SELECT * FROM projeto_itens WHERE projeto_id = ? ORDER BY id').all(orc.id);
  assert.equal(itens[1].medida, '2 horas');
  assert.equal(itens[1].detalhe, 'Pintura facial');

  // Orçamento aprovado entra sem gerar parcelas (o financeiro importado já tem os valores).
  const aprovado = db.prepare("SELECT * FROM projetos WHERE categoria = 'Gráfica'").get();
  assert.equal(aprovado.status, 'aprovado');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lancamentos WHERE projeto_id = ?').get(aprovado.id).n, 0);
  assert.equal(aprovado.cliente_id, db.prepare("SELECT id FROM clientes WHERE nome = 'Loja Teste'").get().id);

  const lanc = db.prepare('SELECT * FROM lancamentos ORDER BY id').all();
  assert.deepEqual(lanc.map((l) => [l.tipo, l.status, l.valor]), [['receber', 'pago', 200000], ['pagar', 'pago', 3670], ['receber', 'aberto', 167200]]);
  assert.match(lanc[2].descricao, /\[NF emitida\]/);
  assert.equal(lanc[2].categoria, 'Evento');
  assert.equal(lanc[2].area, 'Corporativo');

  const emp = lerEmpresa(db);
  assert.equal(emp.regime_tributario, 'mei');
  assert.equal(emp.cnpj, '11.222.333/0001-81');
  assert.equal(emp.codigo_municipio, '2704302');
  assert.equal(emp.dados_bancarios, 'Banco X Ag. 1 Conta 2');
  assert.equal(emp.meta_mensal, '6000');
  assert.deepEqual(JSON.parse(emp.metas_area), { Corporativo: 10000 });
  assert.equal(emp.comissao_parceiro_pct, '10');

  // Segunda importação não duplica.
  const r2 = importarPainel(db, backup, null);
  assert.equal(r2.clientes + r2.orcamentos + r2.lancamentos + r2.notas + r2.eventos + r2.tarefas, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM clientes').get().n, 3);
});
