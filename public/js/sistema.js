import {
  trocar, GET, POST, PUT, h, s, R$, num, dataBR, hoje, mesBR, selo, modal, formulario, tabela, cabecalho, btn, aviso, estado, ROTULOS,
} from './nucleo.js';
import { kpi } from './financeiro.js';

// ---------- Login ----------
export function telaLogin(aoEntrar) {
  const form = formulario([
    { nome: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true, largura: 'cheio', autocomplete: 'username' },
    { nome: 'senha', rotulo: 'Senha', tipo: 'password', obrigatorio: true, largura: 'cheio', autocomplete: 'current-password' },
  ]);
  const erro = h('p', { class: 'erro-login', role: 'alert' });
  const botao = h('button', { class: 'btn btn-primario btn-bloco', type: 'submit' }, 'Entrar');
  const el = h('form', {
    class: 'login-caixa',
    onsubmit: async (e) => {
      e.preventDefault();
      erro.textContent = '';
      botao.disabled = true;
      try {
        estado.usuario = await POST('/login', form.ler());
        aoEntrar();
      } catch (err) {
        erro.textContent = err.message;
      } finally {
        botao.disabled = false;
      }
    },
  }, h('div', { class: 'marca marca-grande' }, h('span', { class: 'marca-icone', 'aria-hidden': 'true' }, 'E'), 'ERP'),
  h('p', { class: 'mudo' }, 'Acesse com seu usuário'), form.el, erro, botao);
  trocar(document.getElementById('app'), h('main', { class: 'login' }, el));
  form.els.email.focus();
}

// ---------- Gráfico de barras (vendas por mês) ----------
// Desenhado na largura real do contêiner para manter os textos em tamanho legível.
function graficoBarras(serie) {
  const H = 240; const m = { t: 16, r: 8, b: 28, l: 64 };
  const max = Math.max(...serie.map((d) => d.total), 1);
  // Escala "redonda" para as linhas de grade.
  const passo = 10 ** Math.floor(Math.log10(max / 3));
  const topo = Math.ceil(max / (passo * 3)) * passo * 3 || 1;
  const ih = H - m.t - m.b;
  const y = (v) => m.t + ih - (v / topo) * ih;
  const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL' });
  const dica = h('div', { class: 'grafico-dica', role: 'tooltip', hidden: true });
  const wrap = h('div', { class: 'grafico-wrap' });
  let larguraAtual = 0;

  function desenhar(W) {
    larguraAtual = W;
    const iw = W - m.l - m.r;
    const banda = iw / serie.length;
    const largura = Math.min(40, banda * 0.5);
    const svg = s('svg', {
      width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'grafico', role: 'img',
      'aria-label': `Vendas confirmadas por mês: ${serie.map((d) => `${mesBR(d.mes)} ${R$(d.total)}`).join('; ')}`,
    });
    for (let i = 0; i <= 3; i++) {
      const v = (topo / 3) * i;
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: i === 0 ? 'eixo' : 'grade' }));
      svg.append(s('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'rotulo-eixo' }, compacto.format(v / 100)));
    }
    serie.forEach((d, i) => {
      const cx = m.l + banda * i + banda / 2;
      const x0 = cx - largura / 2;
      const base = y(0);
      const alt = Math.max(0, base - y(d.total));
      const r = Math.min(4, alt);
      if (alt > 0) {
        svg.append(s('path', {
          class: 'barra',
          d: `M${x0},${base} V${base - alt + r} Q${x0},${base - alt} ${x0 + r},${base - alt} H${x0 + largura - r} Q${x0 + largura},${base - alt} ${x0 + largura},${base - alt + r} V${base} Z`,
        }));
      }
      svg.append(s('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'rotulo-eixo' }, mesBR(d.mes)));
      // Área de interação maior que a barra.
      svg.append(s('rect', {
        x: m.l + banda * i, y: m.t, width: banda, height: ih, class: 'alvo', tabindex: 0,
        'aria-label': `${mesBR(d.mes)}: ${R$(d.total)}, ${d.qtd} venda(s)`,
        onmouseenter: () => mostrar(d, cx, base - alt), onfocus: () => mostrar(d, cx, base - alt),
        onmouseleave: () => { dica.hidden = true; }, onblur: () => { dica.hidden = true; },
      }));
    });
    dica.hidden = true;
    trocar(wrap, svg, dica);
  }

  function mostrar(d, cx, topoBarra) {
    trocar(dica, h('strong', {}, mesBR(d.mes)), h('span', {}, R$(d.total)), h('span', { class: 'mudo' }, `${d.qtd} venda(s)`));
    dica.hidden = false;
    dica.style.left = `${Math.min(Math.max(cx, 60), larguraAtual - 60)}px`;
    dica.style.top = `${topoBarra}px`;
  }

  desenhar(640);
  new ResizeObserver(([e]) => {
    const W = Math.floor(e.contentRect.width);
    if (W > 0 && W !== larguraAtual) desenhar(W);
  }).observe(wrap);
  return wrap;
}

function ultimosMeses(dados, n = 6) {
  const porMes = new Map(dados.map((d) => [d.mes, d]));
  const [a, m] = hoje().split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(a, m - 1 - i, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push(porMes.get(chave) || { mes: chave, total: 0, qtd: 0 });
  }
  return out;
}

// ---------- Painel ----------
export async function painel(raiz) {
  const d = await GET('/dashboard');
  const serie = ultimosMeses(d.vendas_por_mes);
  const hj = hoje();
  trocar(raiz,
    cabecalho(`Olá, ${estado.usuario.nome.split(' ')[0]}`,
      btn('Nova venda', () => { location.hash = '#/vendas/nova'; }, 'btn-primario'),
      btn('Nova compra', () => { location.hash = '#/compras/nova'; })),
    h('div', { class: 'kpis' },
      kpi('Vendas no mês', R$(d.vendas_mes), null, `${d.qtd_vendas_mes} venda(s) confirmada(s)`),
      kpi('Saldo de caixa no mês', R$(d.saldo_mes), d.saldo_mes < 0 ? 'negativo' : null, 'Recebido − pago'),
      kpi('A receber', R$(d.a_receber), null, d.receber_vencido ? `⚠ ${R$(d.receber_vencido)} vencido` : 'Nada vencido'),
      kpi('A pagar', R$(d.a_pagar), null, d.pagar_vencido ? `⚠ ${R$(d.pagar_vencido)} vencido` : 'Nada vencido'),
      kpi('Valor em estoque', R$(d.valor_estoque), null, 'Pelo preço de custo')),
    h('div', { class: 'painel-grade' },
      h('section', { class: 'cartao cartao-largo' },
        h('h2', { class: 'secao' }, 'Vendas confirmadas — últimos 6 meses'),
        graficoBarras(serie),
        h('details', { class: 'ver-dados' }, h('summary', {}, 'Ver dados em tabela'),
          tabela([
            { titulo: 'Mês', valor: (l) => mesBR(l.mes) },
            { titulo: 'Vendas', classe: 'num', valor: (l) => l.qtd },
            { titulo: 'Total', classe: 'num', valor: (l) => R$(l.total) },
          ], serie))),
      h('section', { class: 'cartao' },
        h('h2', { class: 'secao' }, 'Próximos vencimentos'),
        d.proximos_vencimentos.length
          ? h('ul', { class: 'lista-simples' }, d.proximos_vencimentos.map((l) => h('li', {},
            h('a', { href: `#/financeiro/${l.tipo}` },
              h('span', { class: `txt-${l.tipo}` }, l.tipo === 'receber' ? '↓ ' : '↑ '),
              h('span', { class: 'cresce' }, l.descricao, l.pessoa ? h('small', { class: 'mudo' }, ` · ${l.pessoa}`) : null),
              h('span', { class: l.vencimento < hj ? 'txt-alerta' : 'mudo' }, dataBR(l.vencimento)),
              h('strong', {}, R$(l.valor))))))
          : h('p', { class: 'mudo' }, 'Nenhuma conta em aberto.')),
      h('section', { class: 'cartao' },
        h('h2', { class: 'secao' }, 'Estoque baixo'),
        d.estoque_baixo.length
          ? h('ul', { class: 'lista-simples' }, d.estoque_baixo.map((p) => h('li', {},
            h('a', { href: '#/estoque' }, h('span', { class: 'cresce' }, p.nome),
              h('span', { class: 'txt-alerta' }, `▼ ${num(p.estoque_atual)} ${p.unidade}`),
              h('small', { class: 'mudo' }, `mín. ${num(p.estoque_minimo)}`)))))
          : h('p', { class: 'mudo' }, 'Todos os produtos acima do mínimo.'))),
  );
}

// ---------- Configurações ----------
export async function configuracoes(raiz) {
  const admin = estado.usuario.papel === 'admin';
  const secoes = [];

  const formEmpresa = formulario([
    { nome: 'nome', rotulo: 'Nome da empresa', largura: 'cheio' },
    { nome: 'cnpj', rotulo: 'CNPJ' },
    { nome: 'telefone', rotulo: 'Telefone' },
    { nome: 'email', rotulo: 'E-mail', tipo: 'email' },
    { nome: 'endereco', rotulo: 'Endereço', largura: 'cheio' },
  ], estado.empresa || {});
  if (!admin) Object.values(formEmpresa.els).forEach((el) => { el.disabled = true; });
  secoes.push(h('section', { class: 'cartao' }, h('h2', { class: 'secao' }, 'Dados da empresa'),
    h('p', { class: 'mudo' }, 'Aparecem no menu e nos documentos impressos.'),
    formEmpresa.el,
    admin ? btn('Salvar dados da empresa', async () => {
      try {
        estado.empresa = await PUT('/empresa', formEmpresa.ler());
        document.querySelector('.marca-nome').textContent = estado.empresa.nome || 'ERP';
        aviso('Dados salvos');
      } catch (e) { aviso(e.message, 'erro'); }
    }, 'btn-primario') : null));

  const formSenha = formulario([
    { nome: 'senha_atual', rotulo: 'Senha atual', tipo: 'password', obrigatorio: true, autocomplete: 'current-password' },
    { nome: 'nova_senha', rotulo: 'Nova senha (mín. 8 caracteres)', tipo: 'password', obrigatorio: true, autocomplete: 'new-password' },
  ]);
  secoes.push(h('section', { class: 'cartao' }, h('h2', { class: 'secao' }, 'Minha conta'),
    h('p', {}, `${estado.usuario.nome} · ${estado.usuario.email} · ${ROTULOS[estado.usuario.papel]}`),
    formSenha.el,
    btn('Alterar senha', async () => {
      try {
        await POST('/me/senha', formSenha.ler());
        Object.values(formSenha.els).forEach((el) => { el.value = ''; });
        aviso('Senha alterada');
      } catch (e) { aviso(e.message, 'erro'); }
    }, 'btn-primario')));

  if (admin) {
    const areaUsuarios = h('div');
    const carregarUsuarios = async () => {
      const us = await GET('/usuarios');
      trocar(areaUsuarios, tabela([
        { titulo: 'Nome', valor: (l) => l.nome },
        { titulo: 'E-mail', valor: (l) => l.email },
        { titulo: 'Perfil', valor: (l) => ROTULOS[l.papel] },
        { titulo: 'Situação', valor: (l) => (l.ativo ? selo('Ativo', 'ok') : selo('inativo')) },
      ], us, { aoClicar: abrirUsuario }));
    };
    const abrirUsuario = (u = {}) => {
      const form = formulario([
        { nome: 'nome', rotulo: 'Nome', obrigatorio: true, largura: 'cheio' },
        { nome: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true, largura: 'cheio' },
        { nome: 'papel', rotulo: 'Perfil', tipo: 'select', opcoes: [['usuario', 'Usuário'], ['admin', 'Administrador']] },
        { nome: 'senha', rotulo: u.id ? 'Nova senha (deixe vazio para manter)' : 'Senha (mín. 8)', tipo: 'password', obrigatorio: !u.id, autocomplete: 'new-password' },
        { nome: 'ativo', rotulo: 'Ativo', tipo: 'checkbox' },
      ], u);
      modal(u.id ? 'Editar usuário' : 'Novo usuário', form.el, {
        acoes: [
          { texto: 'Cancelar', acao: () => {} },
          { texto: 'Salvar', classe: 'btn-primario', acao: async () => {
            const d = form.ler();
            if (u.id) await PUT(`/usuarios/${u.id}`, d); else await POST('/usuarios', d);
            aviso('Usuário salvo');
            carregarUsuarios();
          } },
        ],
      });
    };
    secoes.push(h('section', { class: 'cartao' },
      h('div', { class: 'secao-topo' }, h('h2', { class: 'secao' }, 'Usuários'), btn('Novo usuário', () => abrirUsuario(), 'btn-pequeno')),
      h('p', { class: 'mudo' }, 'Administradores gerenciam usuários e dados da empresa. Usuários comuns operam todos os módulos.'),
      areaUsuarios));
    await carregarUsuarios();
  }

  trocar(raiz, cabecalho('Configurações'), ...secoes);
}
