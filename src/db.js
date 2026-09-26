'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// Valores monetários são armazenados em centavos (INTEGER) para evitar erros de arredondamento.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'usuario' CHECK (papel IN ('admin', 'usuario')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  documento TEXT,
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  observacoes TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fornecedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  documento TEXT,
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  observacoes TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS servicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  unidade TEXT NOT NULL DEFAULT 'projeto',
  preco INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Um projeto nasce como proposta; ao ser aprovado vira job e gera as contas a receber.
CREATE TABLE IF NOT EXISTS projetos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'proposta'
    CHECK (status IN ('proposta', 'aprovado', 'producao', 'revisao', 'entregue', 'recusado', 'cancelado')),
  data TEXT NOT NULL,
  validade TEXT,
  prazo_entrega TEXT,
  data_aprovacao TEXT,
  data_entrega TEXT,
  subtotal INTEGER NOT NULL DEFAULT 0,
  desconto INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  forma_pagamento TEXT,
  parcelas INTEGER NOT NULL DEFAULT 1,
  primeiro_vencimento TEXT,
  condicoes TEXT,
  observacoes TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projeto_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  servico_id INTEGER REFERENCES servicos(id),
  descricao TEXT NOT NULL,
  quantidade REAL NOT NULL,
  preco_unitario INTEGER NOT NULL,
  subtotal INTEGER NOT NULL
);

-- Contratos recorrentes (fee mensal): geram uma cobrança por mês de competência.
CREATE TABLE IF NOT EXISTS contratos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  descricao TEXT NOT NULL,
  valor INTEGER NOT NULL,
  dia_vencimento INTEGER NOT NULL DEFAULT 10 CHECK (dia_vencimento BETWEEN 1 AND 28),
  inicio TEXT NOT NULL,
  fim TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  observacoes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lancamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('receber', 'pagar')),
  descricao TEXT NOT NULL,
  categoria TEXT,
  valor INTEGER NOT NULL,
  vencimento TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'pago', 'cancelado')),
  pago_em TEXT,
  valor_pago INTEGER,
  origem TEXT NOT NULL DEFAULT 'manual',
  cliente_id INTEGER REFERENCES clientes(id),
  fornecedor_id INTEGER REFERENCES fornecedores(id),
  projeto_id INTEGER REFERENCES projetos(id),
  contrato_id INTEGER REFERENCES contratos(id),
  competencia TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Notas fiscais de serviço (NFS-e).
CREATE TABLE IF NOT EXISTS notas_fiscais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referencia TEXT NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  servico_id INTEGER REFERENCES servicos(id),
  projeto_id INTEGER REFERENCES projetos(id),
  lancamento_id INTEGER REFERENCES lancamentos(id),
  discriminacao TEXT NOT NULL,
  valor_servicos INTEGER NOT NULL,
  aliquota REAL NOT NULL DEFAULT 0,
  valor_iss INTEGER NOT NULL DEFAULT 0,
  iss_retido INTEGER NOT NULL DEFAULT 0,
  item_lista_servico TEXT,
  codigo_tributario_municipio TEXT,
  codigo_nbs TEXT,
  cnae TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'processando', 'emitida', 'erro', 'cancelada')),
  provedor TEXT NOT NULL DEFAULT 'manual',
  numero TEXT,
  codigo_verificacao TEXT,
  data_emissao TEXT,
  url_pdf TEXT,
  url_xml TEXT,
  mensagem TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projetos_status ON projetos(status);
CREATE INDEX IF NOT EXISTS idx_lanc_venc ON lancamentos(vencimento);
CREATE INDEX IF NOT EXISTS idx_lanc_status ON lancamentos(tipo, status);
`;

// Índices que dependem de colunas adicionadas por migração.
const INDICES_POS_MIGRACAO = `
CREATE INDEX IF NOT EXISTS idx_lanc_projeto ON lancamentos(projeto_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lanc_competencia ON lancamentos(contrato_id, competencia) WHERE contrato_id IS NOT NULL;
`;

// Colunas acrescentadas depois da criação das tabelas; bancos antigos recebem-nas automaticamente.
const COLUNAS_EXTRAS = {
  lancamentos: {
    origem: "TEXT NOT NULL DEFAULT 'manual'",
    projeto_id: 'INTEGER REFERENCES projetos(id)',
    contrato_id: 'INTEGER REFERENCES contratos(id)',
    competencia: 'TEXT',
  },
  // Dados exigidos pela NFS-e para o tomador do serviço.
  clientes: {
    tipo_pessoa: "TEXT NOT NULL DEFAULT 'PJ'",
    nome_fantasia: 'TEXT',
    inscricao_municipal: 'TEXT',
    inscricao_estadual: 'TEXT',
    cep: 'TEXT',
    logradouro: 'TEXT',
    numero: 'TEXT',
    complemento: 'TEXT',
    bairro: 'TEXT',
    codigo_municipio: 'TEXT',
    servico_padrao_id: 'INTEGER REFERENCES servicos(id)',
    email_nf: 'TEXT',
  },
  fornecedores: {
    tipo_pessoa: "TEXT NOT NULL DEFAULT 'PJ'",
    chave_pix: 'TEXT',
    cep: 'TEXT',
    logradouro: 'TEXT',
    numero: 'TEXT',
    complemento: 'TEXT',
    bairro: 'TEXT',
    codigo_municipio: 'TEXT',
  },
  // Enquadramento fiscal do serviço.
  servicos: {
    item_lista_servico: 'TEXT',
    codigo_tributario_municipio: 'TEXT',
    codigo_nbs: 'TEXT',
    cnae: 'TEXT',
    aliquota_iss: 'REAL',
  },
};

function migrar(db) {
  for (const [tabela, novas] of Object.entries(COLUNAS_EXTRAS)) {
    const colunas = new Set(db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name));
    for (const [nome, def] of Object.entries(novas)) {
      if (!colunas.has(nome)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${nome} ${def}`);
    }
  }
}

function abrir(arquivo) {
  if (arquivo !== ':memory:') {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  }
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA foreign_keys = ON;');
  if (arquivo !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrar(db);
  db.exec(INDICES_POS_MIGRACAO);
  return db;
}

// Executa fn dentro de uma transação; desfaz tudo se fn lançar exceção.
function transacao(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { abrir, transacao };
