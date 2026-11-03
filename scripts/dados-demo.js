'use strict';

// Popula o banco com dados de exemplo usando a própria API (respeita todas as regras de negócio).
// Uso: npm run demo   (use ERP_DB=caminho para escolher o arquivo do banco)

const http = require('node:http');
const path = require('node:path');
const { abrir } = require('../src/db');
const { garantirAdmin } = require('../src/auth');
const { criarApp } = require('../src/app');
const { somarMeses, somarDias, hoje } = require('../src/validar');

const ARQUIVO_DB = process.env.ERP_DB || path.join(__dirname, '..', 'data', 'erp.db');
const EMAIL = process.env.ERP_ADMIN_EMAIL || 'admin@empresa.com';
const SENHA = process.env.ERP_ADMIN_SENHA || 'admin123';

async function main() {
  const db = abrir(ARQUIVO_DB);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM clientes').get();
  if (n > 0) {
    console.log('O banco já possui clientes cadastrados; nada foi alterado.');
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
    await api('PUT', '/empresa', {
      nome: 'Maragogi Lab', razao_social: 'Maragogi Lab Agência de Marketing e Produção Audiovisual Ltda',
      telefone: '(82) 99999-0000', email: 'contato@maragogilab.com.br', regime_tributario: 'simples',
      cep: '57955000', cidade: 'Maragogi', uf: 'AL', codigo_municipio: '2704500',
      item_lista_servico: '17.06', aliquota_iss: '2', nfse_provedor: 'manual', nfse_ambiente: 'homologacao',
    });

    const servicos = {};
    for (const s of [
      { nome: 'Gestão de redes sociais', categoria: 'Social media', unidade: 'mes', preco: 180000, item_lista_servico: '17.06', aliquota_iss: 2,
        descricao: 'Planejamento de conteúdo, criação de posts e stories, gestão de perfis e relatório mensal.' },
      { nome: 'Vídeo institucional', categoria: 'Audiovisual', unidade: 'projeto', preco: 650000, item_lista_servico: '13.03', aliquota_iss: 2,
        descricao: 'Roteiro, captação em 4K, edição, trilha licenciada e color grading.' },
      { nome: 'Reels / vídeo curto', categoria: 'Audiovisual', unidade: 'video', preco: 45000, item_lista_servico: '13.03', aliquota_iss: 2 },
      { nome: 'Diária de filmagem', categoria: 'Audiovisual', unidade: 'diaria', preco: 220000, item_lista_servico: '13.03', aliquota_iss: 2 },
      { nome: 'Imagens aéreas com drone', categoria: 'Audiovisual', unidade: 'diaria', preco: 120000, item_lista_servico: '13.03', aliquota_iss: 2 },
      { nome: 'Ensaio fotográfico', categoria: 'Fotografia', unidade: 'projeto', preco: 180000, item_lista_servico: '13.03', aliquota_iss: 2 },
      { nome: 'Gestão de tráfego pago', categoria: 'Tráfego pago', unidade: 'mes', preco: 150000, item_lista_servico: '17.06', aliquota_iss: 2 },
      { nome: 'Identidade visual', categoria: 'Branding', unidade: 'projeto', preco: 350000, item_lista_servico: '23.01', aliquota_iss: 2 },
    ]) servicos[s.nome] = await api('POST', '/servicos', s);

    const clientes = [];
    for (const c of [
      { nome: 'Pousada Recanto das Águas Ltda', nome_fantasia: 'Recanto das Águas', documento: '11.222.333/0001-81', tipo_pessoa: 'PJ',
        cep: '57955000', logradouro: 'Rodovia AL-101 Norte', numero: 'km 128', bairro: 'Barra Grande', cidade: 'Maragogi', uf: 'AL', codigo_municipio: '2704500',
        email: 'financeiro@recantodasaguas.com.br', telefone: '(82) 3296-1000', servico_padrao_id: servicos['Gestão de redes sociais'].id },
      { nome: 'Restaurante Sabor do Mar Ltda', nome_fantasia: 'Sabor do Mar', documento: '11.444.777/0001-61', tipo_pessoa: 'PJ',
        cep: '57955000', logradouro: 'Avenida Senador Rui Palmeira', numero: '500', bairro: 'Centro', cidade: 'Maragogi', uf: 'AL', codigo_municipio: '2704500',
        email: 'contato@sabordomar.com.br', servico_padrao_id: servicos['Gestão de tráfego pago'].id },
      { nome: 'Galés Passeios Turísticos Ltda', documento: '45.723.174/0001-10', tipo_pessoa: 'PJ', cidade: 'Maragogi', uf: 'AL',
        servico_padrao_id: servicos['Vídeo institucional'].id },
      { nome: 'Ana Beatriz Souza', documento: '529.982.247-25', tipo_pessoa: 'PF', cidade: 'Maceió', uf: 'AL', email: 'ana@email.com',
        servico_padrao_id: servicos['Ensaio fotográfico'].id },
    ]) clientes.push(await api('POST', '/clientes', c));

    const freelas = [];
    for (const f of [
      { nome: 'Carlos Lima (piloto de drone)', tipo_pessoa: 'PF', telefone: '(82) 98888-1111', chave_pix: 'carlos@drone.com' },
      { nome: 'Juliana Rocha (editora de vídeo)', tipo_pessoa: 'PF', telefone: '(82) 98888-2222' },
      { nome: 'Locadora Cine Nordeste', tipo_pessoa: 'PJ' },
    ]) freelas.push(await api('POST', '/fornecedores', f));

    // Contratos de fee mensal e cobranças dos últimos meses.
    await api('POST', '/contratos', { cliente_id: clientes[0].id, descricao: 'Gestão de redes sociais (16 posts/mês)', valor: 180000, dia_vencimento: 10, inicio: `${somarMeses(hoje(), -5).slice(0, 7)}-01` });
    await api('POST', '/contratos', { cliente_id: clientes[1].id, descricao: 'Gestão de tráfego pago (Meta Ads)', valor: 150000, dia_vencimento: 5, inicio: `${somarMeses(hoje(), -3).slice(0, 7)}-01` });
    for (let m = 5; m >= 0; m--) await api('POST', '/contratos/gerar-cobrancas', { competencia: somarMeses(hoje(), -m).slice(0, 7) });

    const item = (nome, quantidade = 1) => ({ servico_id: servicos[nome].id, quantidade });
    const projetos = [
      { cli: 2, titulo: 'Vídeo institucional dos passeios', meses: -4, etapa: 'entregue', itens: [item('Vídeo institucional'), item('Imagens aéreas com drone', 2)], parcelas: 2,
        custos: [['Diárias de drone', 0, 150000], ['Edição e finalização', 1, 120000]] },
      { cli: 0, titulo: 'Campanha de alta temporada — 8 reels', meses: -2, etapa: 'entregue', itens: [item('Reels / vídeo curto', 8), item('Diária de filmagem')], parcelas: 1,
        custos: [['Edição dos reels', 1, 80000]] },
      { cli: 3, titulo: 'Ensaio fotográfico pessoal', meses: -1, etapa: 'entregue', itens: [item('Ensaio fotográfico')], parcelas: 1, custos: [] },
      { cli: 1, titulo: 'Nova identidade visual do restaurante', meses: 0, etapa: 'producao', itens: [item('Identidade visual')], parcelas: 3, custos: [], prazo: 20 },
      { cli: 0, titulo: 'Vídeo do casamento na praia (parceria)', meses: 0, etapa: 'revisao', itens: [item('Diária de filmagem', 2), item('Imagens aéreas com drone')], parcelas: 2,
        custos: [['Locação de lentes', 2, 45000]], prazo: 7 },
    ];
    for (const p of projetos) {
      const data = somarMeses(hoje(), p.meses);
      const prazo = p.prazo ? somarMeses(hoje(), 0).slice(0, 8) + String(Math.min(28, Number(hoje().slice(8)) + p.prazo)).padStart(2, '0') : somarMeses(data, 1);
      const criado = await api('POST', '/projetos', {
        cliente_id: clientes[p.cli].id, titulo: p.titulo, data, prazo_entrega: prazo, parcelas: p.parcelas, forma_pagamento: 'pix',
        primeiro_vencimento: data, condicoes: 'Pagamento via PIX. Inclui até 2 rodadas de ajustes.', itens: p.itens,
      });
      await api('POST', `/projetos/${criado.id}/aprovar`, { primeiro_vencimento: data });
      await api('POST', `/projetos/${criado.id}/etapa`, { status: p.etapa, data_entrega: prazo < hoje() ? prazo : hoje() });
      for (const [descricao, f, valor] of p.custos) {
        await api('POST', '/lancamentos', { tipo: 'pagar', descricao, categoria: f === 2 ? 'Locação de equipamentos' : 'Freelancers', valor, vencimento: data,
          fornecedor_id: freelas[f].id, projeto_id: criado.id, pago: data <= hoje(), pago_em: data });
      }
    }
    await api('POST', '/projetos', {
      cliente_id: clientes[1].id, titulo: 'Cardápio fotografado + 4 reels', validade: somarMeses(hoje(), 1), parcelas: 2, forma_pagamento: 'pix',
      descricao: 'Fotos profissionais de 20 pratos para cardápio e redes, e 4 reels de bastidores.',
      condicoes: '50% na aprovação e 50% na entrega. Inclui 2 rodadas de ajustes.',
      itens: [item('Ensaio fotográfico'), item('Reels / vídeo curto', 4)],
    });

    for (const [descricao, categoria, valor, meses] of [
      ['Adobe Creative Cloud', 'Softwares e assinaturas', 29000, [-3, -2, -1, 0]],
      ['Internet fibra', 'Água/Luz/Internet', 14990, [-2, -1, 0]],
      ['Contabilidade', 'Contabilidade', 45000, [-2, -1, 0, 1]],
    ]) {
      for (const m of meses) {
        const venc = `${somarMeses(hoje(), m).slice(0, 7)}-15`;
        const l = await api('POST', '/lancamentos', { tipo: 'pagar', descricao, categoria, valor, vencimento: venc });
        if (m < 0) await api('POST', `/lancamentos/${l.id}/pagar`, { data: venc });
      }
    }

    // Recebe a maior parte do que já venceu.
    const vencidas = await api('GET', `/lancamentos?tipo=receber&status=aberto&ate=${somarMeses(hoje(), 0).slice(0, 8)}01`);
    for (const l of vencidas.slice(0, Math.ceil(vencidas.length * 0.85))) {
      await api('POST', `/lancamentos/${l.id}/pagar`, { data: l.vencimento });
    }

    // Uma nota já registrada e um rascunho.
    const sug = await api('GET', `/notas/sugestao?projeto_id=1`);
    const nf = await api('POST', '/notas', sug);
    await api('POST', `/notas/${nf.id}/registrar`, { numero: '2026000045', codigo_verificacao: 'A1B2C3D4', data_emissao: somarMeses(hoje(), -4) });
    const rec = (await api('GET', '/lancamentos?tipo=receber&busca=redes')).at(-1);
    await api('POST', '/notas', await api('GET', `/notas/sugestao?lancamento_id=${rec.id}`));

    // Conteúdo para redes sociais: quadro da semana, perfis e resultados.
    const dia = (n) => somarDias(hoje(), n);
    const posts = [
      { titulo: 'Carrossel: 5 erros ao gravar com celular', formato: 'carrossel', status: 'ideia', redes: ['instagram', 'linkedin'] },
      { titulo: 'Bastidores da cobertura do casamento', formato: 'reels', status: 'producao', redes: ['instagram', 'tiktok'], data: dia(2), hora: '19:00', cli: 0 },
      { titulo: 'Cardápio novo — fotos dos pratos', formato: 'carrossel', status: 'producao', redes: ['instagram', 'facebook'], data: dia(3), hora: '11:30', cli: 1 },
      { titulo: 'Depoimento de cliente (vídeo)', formato: 'video', status: 'aprovacao', redes: ['instagram', 'youtube'], data: dia(1), hora: '18:00' },
      { titulo: 'Promo de fim de semana', formato: 'post', status: 'agendado', redes: ['instagram', 'facebook'], data: dia(0), hora: '17:00', cli: 1 },
      { titulo: 'Antes e depois da edição', formato: 'reels', status: 'agendado', redes: ['instagram', 'tiktok'], data: dia(4), hora: '20:00' },
    ];
    for (const p of posts) {
      await api('POST', '/posts', { ...p, cliente_id: p.cli === undefined ? null : clientes[p.cli].id, legenda: `${p.titulo}.\n\nFale com a gente pelo link da bio. #maragogi #audiovisual` });
    }
    const publicados = ['Making of do clipe', 'Drone na praia de Antunes', 'Dica rápida: luz natural', 'Tour pelo estúdio', 'Reels com trend do momento'];
    for (const [i, titulo] of publicados.entries()) {
      const p = await api('POST', '/posts', { titulo, formato: i % 2 ? 'post' : 'reels', status: 'publicado', redes: ['instagram'], data: dia(-3 - i * 5) });
      const alcance = 2000 + ((i * 7919) % 9000);
      await api('PUT', `/posts/${p.id}/metricas`, { metricas: [{ rede: 'instagram', alcance, visualizacoes: alcance * 2, curtidas: Math.round(alcance / 12), comentarios: 10 + i * 7, compartilhamentos: 5 + i * 3, salvos: 8 + ((i * 13) % 40) }] });
    }
    const ig = await api('POST', '/perfis', { rede: 'instagram', usuario: '@maragogilab' });
    await api('POST', '/perfis', { rede: 'tiktok', usuario: '@maragogilab' });
    for (let s = 12; s >= 0; s--) {
      const onda = Math.round(Math.sin(s / 2) * 800);
      await api('POST', `/perfis/${ig.id}/numeros`, {
        data: dia(-s * 7), seguidores: 8200 + (12 - s) * 140 + Math.round(onda / 4), alcance: 9000 + (12 - s) * 400 + onda,
        visualizacoes: 30000 + (12 - s) * 1500 + onda * 3, interacoes: 900 + (12 - s) * 30, visitas: 400 + (12 - s) * 15, cliques: 40 + (12 - s) * 2,
      });
    }

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
