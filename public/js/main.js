import { trocar, GET, POST, h, estado, aviso } from './nucleo.js';
import * as cad from './cadastros.js';
import * as docs from './documentos.js';
import * as fin from './financeiro.js';
import * as sis from './sistema.js';

const ROTAS = [
  [/^$/, sis.painel],
  [/^clientes$/, cad.clientes],
  [/^fornecedores$/, cad.fornecedores],
  [/^produtos$/, cad.produtos],
  [/^estoque$/, cad.estoque],
  [/^vendas$/, docs.lista('vendas')],
  [/^vendas\/nova$/, docs.editor('vendas')],
  [/^vendas\/(?<id>\d+)\/editar$/, docs.editor('vendas')],
  [/^vendas\/(?<id>\d+)$/, docs.detalhe('vendas')],
  [/^compras$/, docs.lista('compras')],
  [/^compras\/nova$/, docs.editor('compras')],
  [/^compras\/(?<id>\d+)\/editar$/, docs.editor('compras')],
  [/^compras\/(?<id>\d+)$/, docs.detalhe('compras')],
  [/^financeiro(?:\/(?<tipo>receber|pagar))?$/, fin.financeiro],
  [/^fluxo$/, fin.fluxo],
  [/^relatorios$/, fin.relatorios],
  [/^configuracoes$/, sis.configuracoes],
];

const MENU = [
  ['', 'Painel', '◧'],
  ['vendas', 'Vendas', '◈'],
  ['compras', 'Compras', '◇'],
  ['financeiro', 'Financeiro', '◎'],
  ['estoque', 'Estoque', '▤'],
  ['produtos', 'Produtos', '▦'],
  ['clientes', 'Clientes', '◉'],
  ['fornecedores', 'Fornecedores', '◍'],
  ['relatorios', 'Relatórios', '▥'],
  ['configuracoes', 'Configurações', '⚙'],
];

let conteudo;
let menu;

function layout() {
  menu = h('nav', { class: 'menu', 'aria-label': 'Menu principal' },
    MENU.map(([rota, texto, icone]) => h('a', { href: `#/${rota}`, dataset: { rota } },
      h('span', { class: 'menu-icone', 'aria-hidden': 'true' }, icone), texto)));
  conteudo = h('main', { class: 'conteudo', id: 'conteudo', tabindex: -1 });
  const lateral = h('aside', { class: 'lateral' },
    h('a', { class: 'marca', href: '#/' }, h('span', { class: 'marca-icone', 'aria-hidden': 'true' }, 'E'),
      h('span', { class: 'marca-nome' }, estado.empresa?.nome || 'ERP')),
    menu,
    h('div', { class: 'usuario' },
      h('div', {}, h('strong', {}, estado.usuario.nome), h('small', {}, estado.usuario.email)),
      h('button', { class: 'btn btn-pequeno btn-fantasma', onclick: sair }, 'Sair')));
  const botaoMenu = h('button', {
    class: 'btn-menu', 'aria-label': 'Abrir menu', 'aria-expanded': 'false',
    onclick: () => {
      const aberto = document.body.classList.toggle('menu-aberto');
      botaoMenu.setAttribute('aria-expanded', String(aberto));
    },
  }, '☰');
  trocar(document.getElementById('app'),
    h('a', { class: 'pular', href: '#conteudo', onclick: (e) => { e.preventDefault(); conteudo.focus(); } }, 'Pular para o conteúdo'),
    h('header', { class: 'barra-topo' }, botaoMenu, h('span', { class: 'marca-nome' }, estado.empresa?.nome || 'ERP')),
    lateral, conteudo);
}

async function sair() {
  await POST('/logout').catch(() => {});
  estado.usuario = null;
  sis.telaLogin(iniciar);
}

async function navegar() {
  if (!estado.usuario) return;
  const caminho = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  document.body.classList.remove('menu-aberto');
  const secao = caminho.split('/')[0];
  const ativo = secao === 'fluxo' ? 'financeiro' : secao;
  for (const a of menu.children) {
    const sel = a.dataset.rota === ativo;
    a.classList.toggle('ativo', sel);
    if (sel) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const rota = ROTAS.find(([re]) => re.test(caminho));
  if (!rota) {
    trocar(conteudo, h('h1', {}, 'Página não encontrada'), h('a', { href: '#/' }, 'Voltar ao painel'));
    return;
  }
  const params = caminho.match(rota[0]).groups || {};
  trocar(conteudo, h('p', { class: 'carregando' }, 'Carregando…'));
  try {
    await rota[1](conteudo, params);
    const titulo = conteudo.querySelector('h1')?.textContent;
    document.title = titulo ? `${titulo} · ERP` : 'ERP';
  } catch (e) {
    trocar(conteudo, h('div', { class: 'faixa faixa-alerta', role: 'alert' }, `Não foi possível carregar: ${e.message}`));
  }
}

estado.recarregar = navegar;

async function iniciar() {
  estado.empresa = await GET('/empresa').catch(() => ({}));
  layout();
  await navegar();
}

window.addEventListener('hashchange', navegar);
window.addEventListener('erp:sessao-expirada', () => {
  if (!estado.usuario) return;
  estado.usuario = null;
  aviso('Sua sessão expirou. Entre novamente.', 'erro');
  sis.telaLogin(iniciar);
});

(async () => {
  try {
    estado.usuario = await GET('/me');
    await iniciar();
  } catch {
    sis.telaLogin(iniciar);
  }
})();
