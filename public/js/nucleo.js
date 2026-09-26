// Utilitários compartilhados da interface: API, DOM, formatação, modais e tabelas.

export const estado = { usuario: null, empresa: null };

// ---------- API ----------
export async function api(metodo, caminho, corpo) {
  const r = await fetch(`/api${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    credentials: 'same-origin',
  });
  if (r.status === 204) return null;
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401 && caminho !== '/login') {
    window.dispatchEvent(new Event('erp:sessao-expirada'));
  }
  if (!r.ok) throw new Error(dados.erro || `Erro ${r.status}`);
  return dados;
}
export const GET = (c) => api('GET', c);
export const POST = (c, b = {}) => api('POST', c, b);
export const PUT = (c, b) => api('PUT', c, b);
export const DEL = (c) => api('DELETE', c, {});

export const qs = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== '' && v !== null && v !== undefined) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

// ---------- DOM ----------
// h('div', {class: 'x', onclick: fn}, 'texto', filho) — texto sempre como textContent (sem XSS).
export function h(tag, attrs = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...filhos) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const f of filhos.flat()) el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return el;
}

// Substitui o conteúdo de um elemento ignorando filhos nulos/falsos.
export function trocar(el, ...filhos) {
  el.replaceChildren(...filhos.flat(Infinity).filter((f) => f !== null && f !== undefined && f !== false));
}

// ---------- Formatação ----------
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numeroFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
export const R$ = (centavos) => moeda.format((centavos || 0) / 100);
export const num = (n) => numeroFmt.format(n || 0);
export const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
export const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const inicioMes = () => `${hoje().slice(0, 7)}-01`;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const mesBR = (aaaamm) => `${MESES[Number(aaaamm.slice(5, 7)) - 1]}/${aaaamm.slice(2, 4)}`;

// "1.234,56" | "1234.56" | "R$ 10" -> centavos
export function paraCentavos(texto) {
  let t = String(texto ?? '').replace(/[R$\s]/g, '');
  if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`Valor inválido: ${texto}`);
  return Math.round(n * 100);
}
export const deCentavos = (c) => ((c || 0) / 100).toFixed(2).replace('.', ',');
export const paraNumero = (texto) => {
  const n = Number(String(texto ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

export const ROTULOS = {
  proposta: 'Proposta', aprovado: 'Aprovado', producao: 'Em produção', revisao: 'Em revisão', entregue: 'Entregue',
  recusado: 'Recusado', cancelado: 'Cancelado',
  aberto: 'Em aberto', pago: 'Pago',
  receber: 'A receber', pagar: 'A pagar',
  pix: 'PIX', transferencia: 'Transferência', boleto: 'Boleto', cartao: 'Cartão', dinheiro: 'Dinheiro',
  projeto: 'projeto', hora: 'hora', diaria: 'diária', mes: 'mês', unidade: 'unidade', video: 'vídeo', post: 'post',
  admin: 'Administrador', usuario: 'Usuário', inativo: 'Inativo',
};
const TOM = {
  entregue: 'ok', pago: 'ok',
  proposta: 'info', aprovado: 'info', producao: 'aviso', revisao: 'aviso', aberto: 'aviso',
  recusado: 'neutro', cancelado: 'neutro',
};
export const selo = (status, extra) => h('span', { class: `selo selo-${extra || TOM[status] || 'neutro'}` }, ROTULOS[status] || status);

// ---------- Notificações ----------
export function aviso(msg, tipo = 'ok') {
  const area = document.getElementById('avisos');
  const el = h('div', { class: `aviso aviso-${tipo}`, role: tipo === 'erro' ? 'alert' : 'status' }, msg);
  area.append(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 6000 : 3000);
}

// Executa uma ação assíncrona exibindo erros ao usuário.
export async function tentar(fn, msgOk) {
  try {
    const r = await fn();
    if (msgOk) aviso(msgOk);
    return r;
  } catch (e) {
    aviso(e.message, 'erro');
    throw e;
  }
}

// ---------- Modal ----------
export function modal(titulo, conteudo, { acoes = [], largo = false, aoFechar } = {}) {
  const fundo = h('div', { class: 'modal-fundo' });
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc); aoFechar?.(); };
  const esc = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc);
  const caixa = h('div', { class: `modal${largo ? ' modal-largo' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
    h('header', {}, h('h2', {}, titulo), h('button', { class: 'btn-icone', 'aria-label': 'Fechar', onclick: fechar }, '×')),
    h('div', { class: 'modal-corpo' }, conteudo),
    acoes.length ? h('footer', {}, acoes.map((a) => h('button', {
      class: `btn ${a.classe || ''}`,
      onclick: async (ev) => {
        const b = ev.currentTarget;
        b.disabled = true;
        try { if ((await a.acao()) !== false) fechar(); } catch (e) { aviso(e.message, 'erro'); } finally { b.disabled = false; }
      },
    }, a.texto))) : null);
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
  fundo.append(caixa);
  document.body.append(fundo);
  caixa.querySelector('input, select, textarea')?.focus();
  return { fechar };
}

export function confirmar(mensagem, textoBotao = 'Confirmar', classe = 'btn-primario') {
  return new Promise((resolve) => {
    let ok = false;
    modal('Confirmação', h('p', {}, mensagem), {
      acoes: [
        { texto: 'Voltar', acao: () => {} },
        { texto: textoBotao, classe, acao: () => { ok = true; } },
      ],
      aoFechar: () => resolve(ok),
    });
  });
}

// ---------- Formulários ----------
// campos: [{nome, rotulo, tipo: text|email|date|number|moeda|select|textarea|checkbox, opcoes, obrigatorio, largura}]
export function formulario(campos, valores = {}) {
  const els = {};
  const grade = h('div', { class: 'form-grade' });
  for (const c of campos) {
    if (c.tipo === 'titulo') {
      grade.append(h('h3', { class: 'form-titulo' }, c.rotulo, c.ajuda ? h('small', { class: 'mudo' }, ` ${c.ajuda}`) : null));
      continue;
    }
    let input;
    const id = `f-${c.nome}-${Math.random().toString(36).slice(2, 7)}`;
    const v = valores[c.nome];
    if (c.tipo === 'select') {
      input = h('select', { id, required: c.obrigatorio },
        c.opcoes.map(([val, txt]) => h('option', { value: val, selected: String(v ?? c.padrao ?? '') === String(val) }, txt)));
    } else if (c.tipo === 'textarea') {
      input = h('textarea', { id, rows: 3 });
      input.value = v ?? '';
    } else if (c.tipo === 'checkbox') {
      input = h('input', { id, type: 'checkbox', checked: v === undefined ? c.padrao !== false : Boolean(v) });
    } else if (c.tipo === 'moeda') {
      input = h('input', { id, type: 'text', inputmode: 'decimal', placeholder: '0,00', value: v === undefined || v === null ? '' : deCentavos(v) });
    } else {
      input = h('input', {
        id, type: c.tipo || 'text', required: c.obrigatorio, step: c.tipo === 'number' ? 'any' : null,
        value: v ?? c.padrao ?? '', placeholder: c.placeholder, inputmode: c.inputmode, maxlength: c.max, autocomplete: c.autocomplete || 'off',
      });
    }
    els[c.nome] = input;
    const rotulo = h('label', { for: id }, c.rotulo, c.obrigatorio ? h('span', { class: 'obrig' }, ' *') : null,
      c.nf ? h('span', { class: 'marca-nf', title: 'Necessário para emitir nota fiscal' }, 'NF') : null);
    grade.append(h('div', { class: `campo ${c.largura ? `campo-${c.largura}` : ''} ${c.tipo === 'checkbox' ? 'campo-check' : ''}` },
      c.tipo === 'checkbox' ? [input, rotulo] : [rotulo, input], c.ajuda ? h('small', { class: 'ajuda' }, c.ajuda) : null));
  }
  const ler = () => {
    const out = {};
    for (const c of campos) {
      if (c.tipo === 'titulo') continue;
      const el = els[c.nome];
      if (c.tipo === 'checkbox') out[c.nome] = el.checked;
      else if (c.tipo === 'moeda') out[c.nome] = paraCentavos(el.value);
      else if (c.tipo === 'number') out[c.nome] = el.value === '' ? null : Number(el.value);
      else out[c.nome] = el.value;
      if (c.obrigatorio && (out[c.nome] === '' || out[c.nome] === null)) {
        el.focus();
        throw new Error(`Preencha o campo "${c.rotulo}"`);
      }
    }
    return out;
  };
  return { el: grade, ler, els };
}

// ---------- Tabelas ----------
// colunas: [{titulo, valor: (linha) => texto|Node, csv?: (linha) => texto, classe}]
export function tabela(colunas, linhas, { vazio = 'Nenhum registro encontrado.', aoClicar, nomeArquivo } = {}) {
  const corpo = linhas.length
    ? linhas.map((l) => h('tr', { class: aoClicar ? 'clicavel' : null, onclick: aoClicar ? (e) => { if (!e.target.closest('button, input, a, select, label')) aoClicar(l); } : null },
      colunas.map((c) => h('td', { class: c.classe, 'data-rotulo': c.titulo }, c.valor(l)))))
    : [h('tr', {}, h('td', { colspan: colunas.length, class: 'vazio' }, vazio))];
  const t = h('div', { class: 'tabela-wrap' },
    h('table', {}, h('thead', {}, h('tr', {}, colunas.map((c) => h('th', { class: c.classe }, c.titulo)))), h('tbody', {}, corpo)));
  if (nomeArquivo && linhas.length) {
    t.prepend(h('div', { class: 'tabela-acoes' },
      h('span', { class: 'mudo' }, `${linhas.length} registro(s)`),
      h('button', { class: 'btn btn-pequeno', onclick: () => exportarCSV(colunas, linhas, nomeArquivo) }, 'Exportar CSV')));
  }
  return t;
}

function exportarCSV(colunas, linhas, nome) {
  const cols = colunas.filter((c) => c.csv !== false);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const texto = (c, l) => {
    if (c.csv) return c.csv(l);
    const v = c.valor(l);
    return v instanceof Node ? v.textContent : v;
  };
  const csv = [cols.map((c) => esc(c.titulo)).join(';'), ...linhas.map((l) => cols.map((c) => esc(texto(c, l))).join(';'))].join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: `${nome}-${hoje()}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Cabeçalho de página com título e ações.
export const cabecalho = (titulo, ...acoes) => h('div', { class: 'pagina-topo' }, h('h1', {}, titulo), h('div', { class: 'acoes' }, acoes));

// Barra de filtros; chama aoMudar com os valores sempre que algo muda.
export function filtros(campos, aoMudar) {
  const els = {};
  let timer;
  const disparar = () => aoMudar(Object.fromEntries(Object.entries(els).map(([k, el]) => [k, el.value])));
  const barra = h('div', { class: 'filtros' }, campos.map((c) => {
    const el = c.tipo === 'select'
      ? h('select', { 'aria-label': c.rotulo, onchange: disparar }, c.opcoes.map(([v, t]) => h('option', { value: v, selected: c.padrao === v }, t)))
      : h('input', {
        type: c.tipo || 'search', placeholder: c.rotulo, 'aria-label': c.rotulo, value: c.padrao ?? '',
        oninput: () => { clearTimeout(timer); timer = setTimeout(disparar, 250); },
      });
    els[c.nome] = el;
    return c.tipo === 'date' ? h('label', { class: 'filtro-data' }, h('span', {}, c.rotulo), el) : el;
  }));
  return { el: barra, valores: () => Object.fromEntries(Object.entries(els).map(([k, el]) => [k, el.value])) };
}

export const btn = (texto, onclick, classe = '') => h('button', { class: `btn ${classe}`, onclick }, texto);
