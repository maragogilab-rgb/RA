'use strict';

// Popula o banco com dados de exemplo usando a própria API (respeita todas as regras de negócio).
// Uso: npm run demo   (use ERP_DB=caminho para escolher o arquivo do banco)

const http = require('node:http');
const path = require('node:path');
const { abrir } = require('../src/db');
const { garantirAdmin } = require('../src/auth');
const { criarApp } = require('../src/app');
const { somarMeses, hoje } = require('../src/validar');

const ARQUIVO_DB = process.env.ERP_DB || path.join(__dirname, '..', 'data', 'erp.db');
const EMAIL = process.env.ERP_ADMIN_EMAIL || 'admin@empresa.com';
const SENHA = process.env.ERP_ADMIN_SENHA || 'admin123';

async function main() {
  const db = abrir(ARQUIVO_DB);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM produtos').get();
  if (n > 0) {
    console.log('O banco já possui produtos cadastrados; nada foi alterado.');
    return;
  }
  garantirAdmin(db, { email: EMAIL, senha: SENHA });
  const servidor = http.createServer(criarApp(db, { log: false }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  let cookie = '';
  const api = async (metodo, caminho, corpo) => {
    const r = await fetch(base + caminho, {
      method: metodo, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: corpo ? JSON.stringify(corpo) : undefined,
    });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    const dados = r.status === 204 ? null : await r.json();
    if (!r.ok) throw new Error(`${metodo} ${caminho}: ${dados?.erro}`);
    return dados;
  };

  try {
    await api('POST', '/login', { email: EMAIL, senha: SENHA });
    await api('PUT', '/empresa', { nome: 'Minha Empresa Ltda', cnpj: '12.345.678/0001-90', telefone: '(11) 4000-1234', email: 'contato@minhaempresa.com.br', endereco: 'Av. Paulista, 1000 - São Paulo/SP' });

    const clientes = [];
    for (const c of [
      { nome: 'Padaria Pão Quente', documento: '11.222.333/0001-44', cidade: 'São Paulo', uf: 'SP', telefone: '(11) 3333-1111' },
      { nome: 'Mercado Bom Preço', documento: '22.333.444/0001-55', cidade: 'Campinas', uf: 'SP', telefone: '(19) 3222-2222' },
      { nome: 'João da Silva', documento: '123.456.789-09', cidade: 'Santos', uf: 'SP', email: 'joao@email.com' },
      { nome: 'Escritório Contábil Exato', documento: '33.444.555/0001-66', cidade: 'Rio de Janeiro', uf: 'RJ' },
      { nome: 'Maria Oliveira', documento: '987.654.321-00', cidade: 'Belo Horizonte', uf: 'MG' },
    ]) clientes.push(await api('POST', '/clientes', c));

    const fornecedores = [];
    for (const f of [
      { nome: 'Distribuidora Central', documento: '44.555.666/0001-77', cidade: 'São Paulo', uf: 'SP' },
      { nome: 'Papelaria Atacado Sul', documento: '55.666.777/0001-88', cidade: 'Curitiba', uf: 'PR' },
    ]) fornecedores.push(await api('POST', '/fornecedores', f));

    const produtos = [];
    for (const p of [
      { sku: 'PAP-A4', nome: 'Papel A4 (resma 500 fls)', unidade: 'CX', preco_custo: 2290, preco_venda: 3490, estoque_minimo: 20, estoque_inicial: 40 },
      { sku: 'CAN-AZ', nome: 'Caneta esferográfica azul', unidade: 'UN', preco_custo: 90, preco_venda: 250, estoque_minimo: 100, estoque_inicial: 300 },
      { sku: 'GRA-01', nome: 'Grampeador de mesa', unidade: 'UN', preco_custo: 1850, preco_venda: 3990, estoque_minimo: 5, estoque_inicial: 12 },
      { sku: 'TON-85', nome: 'Toner compatível 85A', unidade: 'UN', preco_custo: 4500, preco_venda: 8990, estoque_minimo: 6, estoque_inicial: 8 },
      { sku: 'PAS-AZ', nome: 'Pasta suspensa', unidade: 'UN', preco_custo: 180, preco_venda: 450, estoque_minimo: 50, estoque_inicial: 60 },
      { sku: 'CAF-1K', nome: 'Café torrado 1kg', unidade: 'KG', preco_custo: 3200, preco_venda: 4990, estoque_minimo: 10, estoque_inicial: 15 },
    ]) produtos.push(await api('POST', '/produtos', p));

    const inicio = somarMeses(hoje(), -5);
    await api('POST', '/compras', {
      fornecedor_id: fornecedores[0].id, data: inicio, parcelas: 2, receber: true,
      itens: [{ produto_id: produtos[0].id, quantidade: 60, custo_unitario: 2250 }, { produto_id: produtos[1].id, quantidade: 500, custo_unitario: 85 }],
    });
    await api('POST', '/compras', {
      fornecedor_id: fornecedores[1].id, data: hoje(), parcelas: 3,
      itens: [{ produto_id: produtos[3].id, quantidade: 20 }, { produto_id: produtos[2].id, quantidade: 10 }],
    });

    // Vendas espalhadas pelos últimos 6 meses.
    const formas = ['pix', 'boleto', 'dinheiro', 'credito', 'prazo'];
    let seq = 0;
    for (let mes = 5; mes >= 0; mes--) {
      const vendasNoMes = 3 + ((mes * 7) % 4);
      for (let i = 0; i < vendasNoMes; i++) {
        seq++;
        const dia = String(Math.min(2 + i * 6, 28)).padStart(2, '0');
        let data = `${somarMeses(hoje(), -mes).slice(0, 7)}-${dia}`;
        if (data > hoje()) data = hoje();
        const forma = formas[seq % formas.length];
        await api('POST', '/vendas', {
          cliente_id: clientes[seq % clientes.length].id, data, forma_pagamento: forma,
          parcelas: forma === 'boleto' || forma === 'credito' ? 2 : 1, confirmar: true,
          desconto: seq % 3 === 0 ? 500 : 0,
          itens: [
            { produto_id: produtos[seq % 3 === 0 ? 0 : 1].id, quantidade: 2 + (seq % 5) },
            { produto_id: produtos[(seq % 4) + 2].id, quantidade: 1 },
          ],
        });
      }
    }
    await api('POST', '/vendas', {
      cliente_id: clientes[1].id, forma_pagamento: 'boleto', parcelas: 3,
      itens: [{ produto_id: produtos[0].id, quantidade: 10 }, { produto_id: produtos[4].id, quantidade: 30 }],
      observacoes: 'Orçamento válido por 15 dias.',
    });

    for (const [descricao, categoria, valor, meses] of [
      ['Aluguel da loja', 'Aluguel', 350000, [-2, -1, 0, 1]],
      ['Energia elétrica', 'Água/Luz/Internet', 42000, [-1, 0]],
      ['Internet fibra', 'Água/Luz/Internet', 14990, [-1, 0]],
    ]) {
      for (const m of meses) {
        const venc = `${somarMeses(hoje(), m).slice(0, 7)}-10`;
        const l = await api('POST', '/lancamentos', { tipo: 'pagar', descricao, categoria, valor, vencimento: venc });
        if (m < 0) await api('POST', `/lancamentos/${l.id}/pagar`, { data: venc });
      }
    }

    // Recebe as parcelas vencidas mais antigas para dar um fluxo de caixa realista.
    const vencidas = await api('GET', `/lancamentos?tipo=receber&status=aberto&ate=${somarMeses(hoje(), -1)}`);
    for (const l of vencidas.slice(0, Math.ceil(vencidas.length * 0.8))) {
      await api('POST', `/lancamentos/${l.id}/pagar`, { data: l.vencimento });
    }
    await api('POST', '/usuarios', { nome: 'Vendedor Exemplo', email: 'vendedor@empresa.com', senha: 'vendedor123' });
    console.log(`Dados de demonstração criados em ${ARQUIVO_DB}`);
    console.log(`Acesse com ${EMAIL} / ${SENHA}`);
  } finally {
    servidor.close();
    db.close();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
