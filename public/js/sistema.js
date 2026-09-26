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
      'aria-label': `Recebimentos por mês: ${serie.map((d) => `${mesBR(d.mes)} ${R$(d.total)}`).join('; ')}`,
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
        'aria-label': `${mesBR(d.mes)}: ${R$(d.total)}, ${d.qtd} recebimento(s)`,
        onmouseenter: () => mostrar(d, cx, base - alt), onfocus: () => mostrar(d, cx, base - alt),
        onmouseleave: () => { dica.hidden = true; }, onblur: () => { dica.hidden = true; },
      }));
    });
    dica.hidden = true;
    trocar(wrap, svg, dica);
  }

  function mostrar(d, cx, topoBarra) {
    trocar(dica, h('strong', {}, mesBR(d.mes)), h('span', {}, R$(d.total)), h('span', { class: 'mudo' }, `${d.qtd} recebimento(s)`));
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
  const serie = ultimosMeses(d.recebido_por_mes);
  const hj = hoje();
  const etapa = (st) => d.projetos_por_etapa.find((e) => e.status === st)?.qtd || 0;
  trocar(raiz,
    cabecalho(`Olá, ${estado.usuario.nome.split(' ')[0]}`,
      btn('Novo orçamento', () => { location.hash = '#/projetos/novo'; }, 'btn-primario'),
      btn('Emitir NF', () => { location.hash = '#/notas'; })),
    d.contratos_sem_cobranca ? h('div', { class: 'faixa faixa-info', role: 'status' },
      `${d.contratos_sem_cobranca} contrato(s) de fee mensal ainda sem cobrança gerada neste mês. `,
      h('a', { href: '#/contratos' }, 'Gerar cobranças →')) : null,
    d.mei ? medidorMei(d.mei) : null,
    h('div', { class: 'kpis' },
      kpi('Recebido no mês', R$(d.recebido_mes), null, `Saldo do mês: ${R$(d.saldo_mes)}`),
      kpi('Receita recorrente (fee)', R$(d.receita_recorrente), null, `${d.qtd_contratos} contrato(s) ativo(s)`),
      kpi('A receber', R$(d.a_receber), null, d.receber_vencido ? `⚠ ${R$(d.receber_vencido)} vencido` : 'Nada vencido'),
      kpi('A pagar', R$(d.a_pagar), null, d.pagar_vencido ? `⚠ ${R$(d.pagar_vencido)} vencido` : 'Nada vencido'),
      kpi('Propostas em aberto', R$(d.propostas_abertas.total), null, `${d.propostas_abertas.qtd} aguardando o cliente`)),
    h('div', { class: 'painel-grade' },
      h('section', { class: 'cartao cartao-largo' },
        h('h2', { class: 'secao' }, 'Recebimentos — últimos 6 meses'),
        graficoBarras(serie),
        h('details', { class: 'ver-dados' }, h('summary', {}, 'Ver dados em tabela'),
          tabela([
            { titulo: 'Mês', valor: (l) => mesBR(l.mes) },
            { titulo: 'Recebimentos', classe: 'num', valor: (l) => l.qtd },
            { titulo: 'Total', classe: 'num', valor: (l) => R$(l.total) },
          ], serie))),
      h('section', { class: 'cartao' },
        h('div', { class: 'secao-topo' }, h('h2', { class: 'secao' }, 'Jobs em andamento'),
          h('span', { class: 'mudo' }, `${etapa('aprovado')} aprovado · ${etapa('producao')} produção · ${etapa('revisao')} revisão`)),
        d.proximas_entregas.length
          ? h('ul', { class: 'lista-simples' }, d.proximas_entregas.map((p) => h('li', {},
            h('a', { href: `#/projetos/${p.id}` },
              h('span', { class: 'cresce' }, p.titulo, h('small', { class: 'mudo' }, ` · ${p.cliente_nome}`)),
              selo(p.status),
              h('span', { class: p.prazo_entrega && p.prazo_entrega < hj ? 'txt-alerta' : 'mudo' }, p.prazo_entrega ? dataBR(p.prazo_entrega) : 'sem prazo')))))
          : h('p', { class: 'mudo' }, 'Nenhum job em andamento.')),
      h('section', { class: 'cartao' },
        h('h2', { class: 'secao' }, 'Próximos vencimentos'),
        d.proximos_vencimentos.length
          ? h('ul', { class: 'lista-simples' }, d.proximos_vencimentos.map((l) => h('li', {},
            h('a', { href: `#/financeiro/${l.tipo}` },
              h('span', { class: `txt-${l.tipo}` }, l.tipo === 'receber' ? '↓ ' : '↑ '),
              h('span', { class: 'cresce' }, l.descricao, l.pessoa ? h('small', { class: 'mudo' }, ` · ${l.pessoa}`) : null),
              h('span', { class: l.vencimento < hj ? 'txt-alerta' : 'mudo' }, dataBR(l.vencimento)),
              h('strong', {}, R$(l.valor))))))
          : h('p', { class: 'mudo' }, 'Nenhuma conta em aberto.'))),
  );
}

// Faturamento do ano em relação ao teto do MEI.
function medidorMei({ teto, faturado_ano: fat, a_receber_ano: prev }) {
  const pct = teto ? Math.round((fat / teto) * 100) : 0;
  const pctPrev = teto ? Math.min(100, Math.round(((fat + prev) / teto) * 100)) : 0;
  const tom = pct >= 90 ? 'critico' : pct >= 70 ? 'aviso' : 'ok';
  return h('section', { class: 'cartao medidor-mei' },
    h('div', { class: 'secao-topo' },
      h('h2', { class: 'secao' }, `Teto do MEI ${hoje().slice(0, 4)}`),
      h('span', {}, h('strong', {}, R$(fat)), h('span', { class: 'mudo' }, ` de ${R$(teto)} · ${pct}%`))),
    h('div', { class: 'barra-progresso', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Faturamento do ano em relação ao teto do MEI' },
      h('div', { class: 'previsto', style: `width:${pctPrev}%` }),
      h('div', { class: `feito tom-${tom}`, style: `width:${Math.min(100, pct)}%` })),
    h('small', { class: 'mudo' }, `Recebido no ano (regime de caixa). Com o que falta receber este ano: ${R$(fat + prev)}. Restam ${R$(Math.max(0, teto - fat))} até o teto.`,
      pct >= 70 ? ' ⚠ Converse com seu contador sobre o desenquadramento do MEI.' : ''));
}

// ---------- Configurações ----------
export async function configuracoes(raiz) {
  const admin = estado.usuario.papel === 'admin';
  const secoes = [];

  const formEmpresa = formulario([
    { tipo: 'titulo', rotulo: 'Identificação' },
    { nome: 'nome', rotulo: 'Nome fantasia', largura: 'cheio' },
    { nome: 'razao_social', rotulo: 'Razão social', largura: 'cheio', nf: true },
    { nome: 'cnpj', rotulo: 'CNPJ', nf: true },
    { nome: 'inscricao_municipal', rotulo: 'Inscrição municipal', nf: true },
    { nome: 'regime_tributario', rotulo: 'Regime tributário', tipo: 'select', nf: true,
      opcoes: [['', '—'], ['simples', 'Simples Nacional'], ['mei', 'MEI'], ['presumido', 'Lucro Presumido'], ['real', 'Lucro Real']] },
    { nome: 'telefone', rotulo: 'Telefone' },
    { nome: 'email', rotulo: 'E-mail', tipo: 'email', largura: 'cheio' },
    { tipo: 'titulo', rotulo: 'Endereço', ajuda: '— digite o CEP para preencher' },
    { nome: 'cep', rotulo: 'CEP' },
    { nome: 'logradouro', rotulo: 'Logradouro' },
    { nome: 'numero', rotulo: 'Número' },
    { nome: 'complemento', rotulo: 'Complemento' },
    { nome: 'bairro', rotulo: 'Bairro' },
    { nome: 'cidade', rotulo: 'Cidade' },
    { nome: 'uf', rotulo: 'UF', max: 2 },
    { nome: 'codigo_municipio', rotulo: 'Código IBGE do município', nf: true },
    { tipo: 'titulo', rotulo: 'Padrões da nota fiscal', ajuda: '— usados quando o serviço não define os seus' },
    { nome: 'item_lista_servico', rotulo: 'Item LC 116 padrão', placeholder: 'Ex.: 17.06' },
    { nome: 'aliquota_iss', rotulo: 'Alíquota ISS padrão (%)', tipo: 'number', placeholder: 'Ex.: 2' },
    { nome: 'codigo_tributario_municipio', rotulo: 'Código de tributação municipal' },
    { nome: 'cnae', rotulo: 'CNAE principal', placeholder: 'Ex.: 7311-4/00' },
    { tipo: 'titulo', rotulo: 'Orçamento (PDF)' },
    { nome: 'termos_orcamento', rotulo: 'Termos padrão do orçamento (um por linha)', tipo: 'textarea', largura: 'cheio' },
    { nome: 'pix_chave', rotulo: 'Chave PIX' },
    { nome: 'pix_titular', rotulo: 'Titular' },
    { nome: 'dados_bancarios', rotulo: 'Dados bancários', largura: 'cheio', placeholder: 'Ex.: Banco do Brasil Ag. 0000-0 Conta 00000-0' },
    { nome: 'teto_mei', rotulo: 'Teto anual do MEI (R$)', tipo: 'number', ajuda: 'Usado no painel quando o regime é MEI' },
    { tipo: 'titulo', rotulo: 'Emissão automática (opcional)' },
    { nome: 'nfse_provedor', rotulo: 'Forma de emissão', tipo: 'select',
      opcoes: [['manual', 'Manual — emito no portal da prefeitura'], ['focusnfe', 'Automática — Focus NFe']] },
    { nome: 'nfse_ambiente', rotulo: 'Ambiente', tipo: 'select', opcoes: [['homologacao', 'Homologação (teste)'], ['producao', 'Produção (validade fiscal)']] },
    { nome: 'nfse_token', rotulo: 'Token da API Focus NFe', tipo: 'password', largura: 'cheio', autocomplete: 'off',
      placeholder: estado.empresa?.nfse_token_configurado ? '•••••••• (configurado — deixe vazio para manter)' : 'Cole aqui o token da Focus NFe' },
  ], estado.empresa || {});
  formEmpresa.els.cep.addEventListener('change', async () => {
    const cep = formEmpresa.els.cep.value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const d = await GET(`/cep/${cep}`);
      for (const k of ['logradouro', 'bairro', 'cidade', 'uf', 'codigo_municipio']) if (d[k]) formEmpresa.els[k].value = d[k];
    } catch (e) { aviso(e.message, 'erro'); }
  });
  // Logo: guardada como imagem embutida (data URL), exibida no orçamento.
  let logo = estado.empresa?.logo || '';
  const previa = h('img', { class: 'previa-logo', alt: 'Logo atual', src: logo || null, hidden: !logo });
  const inLogo = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', id: 'logo-arquivo' });
  inLogo.addEventListener('change', () => {
    const f = inLogo.files[0];
    if (!f) return;
    if (f.size > 500000) { aviso('Use uma imagem de até 500 KB', 'erro'); inLogo.value = ''; return; }
    const r = new FileReader();
    r.onload = () => { logo = r.result; previa.src = logo; previa.hidden = false; };
    r.readAsDataURL(f);
  });
  const campoLogo = h('div', { class: 'campo campo-cheio' }, h('label', { for: 'logo-arquivo' }, 'Logo (aparece no orçamento)'),
    h('div', { class: 'linha-logo' }, previa, inLogo,
      btn('Remover', () => { logo = ''; previa.hidden = true; inLogo.value = ''; }, 'btn-pequeno btn-fantasma')));
  formEmpresa.el.prepend(campoLogo);
  if (!admin) Object.values(formEmpresa.els).forEach((el) => { el.disabled = true; });
  secoes.push(h('section', { class: 'cartao' }, h('h2', { class: 'secao' }, 'Dados da empresa e nota fiscal'),
    h('p', { class: 'mudo' }, 'Os campos marcados com NF são exigidos pela prefeitura para emitir a NFS-e. Confirme os códigos fiscais com seu contador.'),
    formEmpresa.el,
    admin ? btn('Salvar dados da empresa', async () => {
      try {
        estado.empresa = await PUT('/empresa', { ...formEmpresa.ler(), logo });
        formEmpresa.els.nfse_token.value = '';
        document.querySelectorAll('.marca-nome').forEach((el) => { el.textContent = estado.empresa.nome || 'ERP'; });
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
      h('p', { class: 'mudo' }, 'Dê acesso a sócios ou ao seu contador. Administradores gerenciam usuários e dados da empresa.'),
      areaUsuarios));
    await carregarUsuarios();
  }

  if (admin) secoes.push(secaoImportar());
  trocar(raiz, cabecalho('Configurações'), ...secoes);
}

// Importa o backup JSON do painel antigo.
function secaoImportar() {
  const arq = h('input', { type: 'file', accept: 'application/json,.json', id: 'backup-arquivo' });
  const resultado = h('div');
  return h('section', { class: 'cartao' },
    h('h2', { class: 'secao' }, 'Importar dados do painel antigo'),
    h('p', { class: 'mudo' }, 'Selecione o arquivo de backup (.json) exportado do painel Maragogi Lab. Clientes, orçamentos, financeiro e configurações são importados; o que já foi importado antes é ignorado.'),
    h('div', { class: 'linha-logo' }, arq, btn('Importar', async () => {
      const f = arq.files[0];
      if (!f) { aviso('Escolha o arquivo de backup', 'erro'); return; }
      try {
        const r = await POST('/importar/painel', JSON.parse(await f.text()));
        estado.empresa = await GET('/empresa');
        trocar(resultado, h('div', { class: 'faixa faixa-ok' },
          `Importado: ${r.clientes} cliente(s), ${r.orcamentos} orçamento(s), ${r.lancamentos} lançamento(s), ${r.notas} nota(s).`,
          r.ignorados ? ` ${r.ignorados} já existiam.` : '',
          r.nao_importados.agenda || r.nao_importados.tarefas ? ` Agenda (${r.nao_importados.agenda}) e tarefas (${r.nao_importados.tarefas}) não foram importadas.` : ''));
        aviso('Importação concluída');
      } catch (e) {
        aviso(e instanceof SyntaxError ? 'Arquivo JSON inválido' : e.message, 'erro');
      }
    }, 'btn-primario')),
    resultado);
}
