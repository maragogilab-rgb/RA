// Documento de orçamento (proposta comercial) pronto para imprimir/salvar em PDF.
import { h, R$, dataBR, num, ROTULOS, trocar } from './nucleo.js';

const doc = document.getElementById('doc');
const params = new URLSearchParams(location.search);
const id = params.get('id');
const token = params.get('t');

document.getElementById('imprimir').addEventListener('click', () => window.print());

async function carregar(caminho) {
  const r = await fetch(`/api${caminho}`, { credentials: 'same-origin' });
  if (r.status === 401 && !token) { location.href = '/'; throw new Error('Faça login'); }
  const d = await r.json();
  if (!r.ok) throw new Error(d.erro || 'Erro ao carregar');
  return d;
}

const iniciais = (nome) => (nome || 'ML').split(/\s+/).filter((p) => /^[A-Za-zÀ-ú]/.test(p)).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

function pagamento(p) {
  if (p.pagamento_texto) return p.pagamento_texto;
  const forma = ROTULOS[p.forma_pagamento] || '';
  return p.parcelas > 1 ? `${forma} — ${p.parcelas}x de ${R$(Math.floor(p.total / p.parcelas))}` : `${forma} — à vista`;
}

function prazo(p) {
  if (p.prazo_texto) return p.prazo_texto;
  return p.prazo_entrega ? `Entrega até ${dataBR(p.prazo_entrega)}` : null;
}

function render(p, e) {
  document.title = `Orçamento — ${p.cliente_fantasia || p.cliente_nome}`;
  if (token) document.getElementById('voltar').remove();
  else document.getElementById('voltar').href = `/#/projetos/${p.id}`;
  const nomeEmpresa = e.nome || e.razao_social || 'Maragogi Lab';
  const cidade = [e.cidade && `${e.cidade}${e.uf ? `, ${e.uf}` : ''}`, e.telefone].filter(Boolean).join(' · ');
  const termos = (p.termos ?? e.termos_orcamento ?? '').split('\n').map((l) => l.replace(/^[\s–—-]+/, '').trim()).filter(Boolean);
  const contato = [p.cliente_contato, p.cliente_telefone].filter(Boolean).join(' · ');
  const temMedida = p.itens.some((i) => i.medida);
  const pz = prazo(p);

  trocar(doc,
    h('header', { class: 'cab' },
      h('div', { class: 'empresa' },
        e.logo ? h('img', { class: 'logo', src: e.logo, alt: nomeEmpresa }) : h('div', { class: 'logo-texto', 'aria-hidden': 'true' }, iniciais(nomeEmpresa)),
        h('div', {},
          h('div', { class: 'empresa-nome' }, nomeEmpresa),
          e.razao_social && e.razao_social !== nomeEmpresa ? h('small', {}, e.razao_social) : null,
          e.cnpj && !(e.razao_social || '').includes(e.cnpj) ? h('small', {}, `CNPJ ${e.cnpj}`) : null,
          cidade ? h('small', {}, cidade) : null)),
      h('div', { class: 'titulo' },
        h('small', {}, ['Proposta comercial', p.categoria].filter(Boolean).join(' · ')),
        h('h1', {}, 'Orçamento'))),
    h('section', { class: 'para' },
      h('div', {},
        h('span', { class: 'rotulo' }, 'Preparado para'),
        h('div', { class: 'cliente-nome' }, p.cliente_fantasia || p.cliente_nome),
        contato ? h('div', { class: 'cliente-extra' }, contato) : null),
      h('div', { class: 'datas' },
        h('div', {}, h('span', {}, 'Emissão '), dataBR(p.data)),
        p.validade ? h('div', {}, h('span', {}, 'Validade '), dataBR(p.validade)) : null)),
    p.descricao ? h('section', { class: 'escopo' }, h('span', { class: 'rotulo' }, 'Escopo'), h('p', {}, p.descricao)) : null,
    h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Serviço'), h('th', { class: 'c' }, 'Qtd.'), temMedida ? h('th', { class: 'c' }, 'Medida') : null,
        h('th', { class: 'n' }, 'Unit.'), h('th', { class: 'n' }, 'Total'))),
      h('tbody', {}, p.itens.map((i) => h('tr', {},
        h('td', {}, i.descricao, i.detalhe ? h('span', { class: 'detalhe' }, i.detalhe) : null),
        h('td', { class: 'c' }, num(i.quantidade)),
        temMedida ? h('td', { class: 'c' }, i.medida || '—') : null,
        h('td', { class: 'n' }, R$(i.preco_unitario)),
        h('td', { class: 'n' }, R$(i.subtotal)))))),
    h('div', { class: 'totais' }, h('div', { class: 'caixa-total' },
      p.desconto ? h('div', {}, h('span', {}, 'Subtotal'), h('span', {}, R$(p.subtotal))) : null,
      p.desconto ? h('div', {}, h('span', {}, 'Desconto'), h('span', {}, `− ${R$(p.desconto)}`)) : null,
      h('div', { class: 'total' }, h('span', {}, 'Total'), h('span', {}, R$(p.total))))),
    h('section', { class: 'condicoes' },
      h('div', {}, h('span', { class: 'rotulo' }, 'Pagamento'), h('p', {}, pagamento(p))),
      pz ? h('div', {}, h('span', { class: 'rotulo' }, 'Prazo'), h('p', {}, pz)) : null,
      p.condicoes ? h('div', { class: 'largo' }, h('span', { class: 'rotulo' }, p.condicoes_titulo || 'Condições'), h('p', {}, p.condicoes)) : null),
    termos.length ? h('section', { class: 'termos' }, termos.map((t) => h('p', {}, `– ${t}`))) : null,
    e.pix_chave || e.dados_bancarios ? h('footer', { class: 'rodape' },
      [e.pix_chave && [h('b', {}, 'Pix: '), e.pix_chave], e.pix_titular && [h('b', {}, 'Titular: '), e.pix_titular], e.dados_bancarios]
        .filter(Boolean).flatMap((parte, i) => (i ? ['  ·  ', parte] : [parte])).flat()) : null,
  );
}

(async () => {
  try {
    let p;
    let e;
    if (token) {
      ({ orcamento: p, empresa: e } = await carregar(`/publico/orcamento/${encodeURIComponent(token)}`));
    } else {
      if (!id) throw new Error('Orçamento não informado');
      [p, e] = await Promise.all([carregar(`/projetos/${id}`), carregar('/empresa')]);
    }
    render(p, e);
    if (new URLSearchParams(location.search).get('imprimir') === '1') setTimeout(() => window.print(), 300);
  } catch (err) {
    doc.replaceChildren(h('p', { class: 'erro' }, err.message));
  }
})();
