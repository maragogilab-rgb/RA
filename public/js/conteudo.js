// Conteúdo para redes sociais: quadro de demandas, editor com prévia, calendário da semana e resultados.
import {
  trocar, GET, POST, PUT, DEL, qs, h, s, hoje, dataBR, modal, confirmar, formulario, cabecalho, btn, aviso, estado, tentar,
} from './nucleo.js';

export const REDES = {
  instagram: { nome: 'Instagram', sigla: 'IG', cor: '#d62976' },
  facebook: { nome: 'Facebook', sigla: 'f', cor: '#1877f2' },
  tiktok: { nome: 'TikTok', sigla: 'TT', cor: '#161616' },
  youtube: { nome: 'YouTube', sigla: 'YT', cor: '#e62117' },
  linkedin: { nome: 'LinkedIn', sigla: 'in', cor: '#0a66c2' },
};
const STATUS = [
  ['ideia', 'Ideias', '#8a8a85'],
  ['producao', 'Em produção', '#7c4dff'],
  ['aprovacao', 'Aprovação', '#f08c00'],
  ['agendado', 'Agendado', '#2f9e44'],
  ['publicado', 'Publicado', '#2a78d6'],
];
const NOME_STATUS = Object.fromEntries(STATUS.map(([k, n]) => [k, n]));
const COR_STATUS = Object.fromEntries(STATUS.map(([k, , c]) => [k, c]));
const FORMATOS = [['post', 'Post (imagem)'], ['carrossel', 'Carrossel'], ['reels', 'Reels / vídeo curto'], ['story', 'Story'], ['video', 'Vídeo longo'], ['texto', 'Só texto']];
const NOME_FORMATO = Object.fromEntries(FORMATOS);
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const inteiro = new Intl.NumberFormat('pt-BR');

// Valores pré-preenchidos ao abrir "novo post" a partir do quadro ou do calendário.
let rascunho = {};
let clienteFiltro = '';
let semana = null;
let perfilAtual = null;
let diasResultado = '30';

const imagemUrl = (p) => `/api/posts/${p.id}/imagem?v=${p.arquivo_id}`;

export function seloRede(rede, { grande = false } = {}) {
  const r = REDES[rede];
  return h('span', { class: `rede-selo${grande ? ' rede-selo-grande' : ''}`, style: `--rede:${r.cor}`, title: r.nome, 'aria-label': r.nome }, r.sigla);
}

function abas(atual) {
  return h('nav', { class: 'abas', 'aria-label': 'Seções de conteúdo' }, [
    ['conteudo', 'Quadro'], ['conteudo/calendario', 'Calendário'], ['conteudo/resultados', 'Resultados'],
  ].map(([rota, nome]) => h('a', { href: `#/${rota}`, class: rota === atual ? 'ativa' : null, 'aria-current': rota === atual ? 'page' : null }, nome)));
}

function novo(valores = {}) {
  rascunho = { cliente_id: clienteFiltro || undefined, ...valores };
  location.hash = '#/conteudo/novo';
}

async function seletorCliente(aoMudar) {
  const clientes = await GET('/clientes?ativo=1');
  return h('select', {
    'aria-label': 'Cliente',
    onchange: (ev) => { clienteFiltro = ev.target.value; aoMudar(); },
  }, h('option', { value: '' }, 'Todos os clientes'), clientes.map((c) => h('option', { value: c.id, selected: String(c.id) === String(clienteFiltro) }, c.nome)));
}

// ---------- Quadro (kanban) ----------
function cartaoPost(p) {
  const hj = hoje();
  const atrasado = p.status !== 'publicado' && p.data && p.data < hj;
  const card = h('a', {
    class: 'post-card', href: `#/conteudo/${p.id}`, draggable: 'true', dataset: { id: p.id, ordem: p.ordem },
    ondragstart: (ev) => { ev.dataTransfer.setData('text/plain', String(p.id)); ev.dataTransfer.effectAllowed = 'move'; card.classList.add('arrastando'); },
    ondragend: () => card.classList.remove('arrastando'),
  },
  p.tem_imagem ? h('img', { class: 'post-card-img', src: imagemUrl(p), alt: '', loading: 'lazy' }) : null,
  h('div', { class: 'post-card-corpo' },
    h('strong', { class: 'post-card-titulo' }, p.titulo),
    p.cliente_nome ? h('span', { class: 'mudo post-card-cliente' }, p.cliente_nome) : null,
    h('div', { class: 'post-card-rodape' },
      h('span', { class: 'chip' }, NOME_FORMATO[p.formato] || p.formato),
      p.data ? h('span', { class: `chip${atrasado ? ' chip-alerta' : p.data === hj ? ' chip-hoje' : ''}` },
        `${atrasado ? '⚠ ' : ''}${p.data === hj ? 'Hoje' : dataBR(p.data).slice(0, 5)}${p.hora ? ` ${p.hora}` : ''}`) : null,
      h('span', { class: 'post-card-redes' }, p.redes.map((r) => seloRede(r))))));
  return card;
}

export async function quadro(raiz) {
  const area = h('div', { class: 'kanban' });
  const busca = h('input', { type: 'search', placeholder: 'Buscar post…', 'aria-label': 'Buscar post', oninput: () => { clearTimeout(busca.t); busca.t = setTimeout(carregar, 250); } });

  async function carregar() {
    const posts = await GET(`/posts${qs({ quadro: 1, cliente_id: clienteFiltro, busca: busca.value })}`);
    trocar(area, STATUS.map(([status, nome, cor]) => {
      const lista = posts.filter((p) => p.status === status);
      const cards = h('div', { class: 'kanban-cards' }, lista.map(cartaoPost));
      const col = h('section', {
        class: 'kanban-coluna', style: `--cor:${cor}`, 'aria-label': nome,
        ondragover: (ev) => { ev.preventDefault(); col.classList.add('alvo-drop'); },
        ondragleave: (ev) => { if (!col.contains(ev.relatedTarget)) col.classList.remove('alvo-drop'); },
        ondrop: async (ev) => {
          ev.preventDefault();
          col.classList.remove('alvo-drop');
          const id = Number(ev.dataTransfer.getData('text/plain'));
          if (!id) return;
          // Posição de soltura: entre os cards vizinhos (ordem fracionária).
          const outros = [...cards.children].filter((c) => Number(c.dataset.id) !== id);
          const depois = outros.find((c) => ev.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
          const i = depois ? outros.indexOf(depois) : outros.length;
          const ant = outros[i - 1] ? Number(outros[i - 1].dataset.ordem) : null;
          const prox = outros[i] ? Number(outros[i].dataset.ordem) : null;
          const ordem = ant === null && prox === null ? 1 : ant === null ? prox - 1 : prox === null ? ant + 1 : (ant + prox) / 2;
          try {
            await POST(`/posts/${id}/mover`, { status, ordem });
          } catch (e) { aviso(e.message, 'erro'); }
          carregar();
        },
      },
      h('header', { class: 'kanban-topo' }, h('span', { class: 'kanban-nome' }, nome), h('span', { class: 'kanban-qtd' }, lista.length)),
      cards,
      status !== 'publicado' ? h('button', { class: 'kanban-novo', onclick: () => novo({ status }) }, '+ Nova demanda') : null);
      return col;
    }));
  }

  trocar(raiz,
    cabecalho('Conteúdo', btn('+ Nova demanda', () => novo(), 'btn-primario')),
    abas('conteudo'),
    h('div', { class: 'filtros' }, await seletorCliente(carregar), busca),
    h('p', { class: 'mudo nota-quadro' }, 'Arraste os cards entre as colunas para mudar a etapa. No celular, abra o post e troque a etapa.'),
    area);
  await carregar();
}

// ---------- Editor do post com prévia ----------
function redimensionar(arquivo, max = 1440) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('Não foi possível ler a imagem'));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo de imagem inválido'));
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

function previa({ rede, nome, legenda, formato, imagem }) {
  const vertical = ['reels', 'story'].includes(formato) || rede === 'tiktok';
  const largo = rede === 'youtube' || formato === 'video';
  const proporcao = vertical ? 'previa-vertical' : largo ? 'previa-larga' : '';
  const texto = legenda || 'A legenda aparece aqui…';
  const curta = texto.length > 180 ? `${texto.slice(0, 180)}…` : texto;
  return h('div', { class: 'previa', style: `--rede:${REDES[rede]?.cor || 'var(--acento)'}` },
    h('div', { class: 'previa-topo' },
      h('span', { class: 'previa-avatar', 'aria-hidden': 'true' }, (nome || '?').trim().charAt(0).toUpperCase()),
      h('div', {}, h('strong', {}, nome || 'Nome do perfil'), h('small', { class: 'mudo' }, REDES[rede]?.nome || 'Prévia'))),
    formato === 'texto' && !imagem ? null : h('div', { class: `previa-midia ${proporcao}` },
      imagem ? h('img', { src: imagem, alt: 'Prévia da imagem do post' }) : h('span', { class: 'mudo' }, 'Sem imagem'),
      ['reels', 'video', 'story'].includes(formato) ? h('span', { class: 'previa-play', 'aria-hidden': 'true' }, '▶') : null),
    h('div', { class: 'previa-acoes', 'aria-hidden': 'true' }, '♡  💬  ↗', h('span', { class: 'cresce' }), '⌑'),
    h('p', { class: 'previa-legenda' }, h('strong', {}, `${nome || 'perfil'} `), curta));
}

export async function editor(raiz, { id } = {}) {
  const [clientes, usuarios, post] = await Promise.all([
    GET('/clientes?ativo=1'), GET('/usuarios/nomes'), id ? GET(`/posts/${id}`) : Promise.resolve(null),
  ]);
  const p = post || { status: 'ideia', formato: 'post', redes: ['instagram'], legendas_rede: {}, metricas: [], responsavel_id: estado.usuario.id, ...rascunho };
  rascunho = {};
  let redes = [...(p.redes || [])];
  let imagem = p.tem_imagem ? imagemUrl(p) : null;
  let imagemNova = null;
  let redePrevia = redes[0] || 'instagram';

  const form = formulario([
    { nome: 'titulo', rotulo: 'Título da demanda', obrigatorio: true, largura: 'cheio', placeholder: 'Ex.: Reels bastidores da gravação' },
    { nome: 'cliente_id', rotulo: 'Cliente', tipo: 'select', opcoes: [['', 'Própria agência'], ...clientes.map((c) => [c.id, c.nome])] },
    { nome: 'formato', rotulo: 'Formato', tipo: 'select', opcoes: FORMATOS },
    { nome: 'status', rotulo: 'Etapa', tipo: 'select', opcoes: STATUS.map(([k, n]) => [k, n]) },
    { nome: 'responsavel_id', rotulo: 'Responsável', tipo: 'select', opcoes: [['', 'Ninguém'], ...usuarios.map((u) => [u.id, u.nome])] },
    { nome: 'data', rotulo: 'Data de publicação', tipo: 'date' },
    { nome: 'hora', rotulo: 'Horário', tipo: 'time' },
    { nome: 'legenda', rotulo: 'Legenda', tipo: 'textarea', largura: 'cheio' },
  ], p);
  form.els.legenda.rows = 6;
  const extras = formulario([
    { nome: 'link', rotulo: 'Link do post publicado', largura: 'cheio', placeholder: 'https://…' },
    { nome: 'notas', rotulo: 'Briefing / observações', tipo: 'textarea', largura: 'cheio' },
  ], p);

  // Legenda própria por rede (opcional).
  const legendasRede = {};
  const areaLegendas = h('div', { class: 'legendas-rede' });
  const areaRedes = h('div', { class: 'redes-escolha', role: 'group', 'aria-label': 'Redes' });
  const areaPrevia = h('div', { class: 'previa-area' });
  const abasPrevia = h('div', { class: 'previa-abas', role: 'tablist' });

  // Resultado por rede (só aparece depois de publicado).
  const inputsMetricas = {};
  const areaMetricas = h('section', { class: 'cartao' });
  const CAMPOS_METRICA = [['alcance', 'Alcance'], ['visualizacoes', 'Visualizações'], ['curtidas', 'Curtidas'], ['comentarios', 'Comentários'], ['compartilhamentos', 'Compartilh.'], ['salvos', 'Salvos']];

  function desenharRedes() {
    trocar(areaRedes, Object.entries(REDES).map(([k, r]) => h('button', {
      type: 'button', class: `rede-botao${redes.includes(k) ? ' ativa' : ''}`, style: `--rede:${r.cor}`, 'aria-pressed': String(redes.includes(k)),
      onclick: () => {
        redes = redes.includes(k) ? redes.filter((x) => x !== k) : [...redes, k];
        if (!redes.includes(redePrevia)) redePrevia = redes[0] || 'instagram';
        desenharRedes();
        desenharLegendas();
        desenharMetricas();
        atualizarPrevia();
      },
    }, seloRede(k), r.nome)));
  }

  function desenharLegendas() {
    trocar(areaLegendas, redes.map((r) => {
      if (!legendasRede[r]) {
        legendasRede[r] = h('textarea', { rows: 3, placeholder: 'Deixe vazio para usar a legenda principal', oninput: atualizarPrevia });
        legendasRede[r].value = p.legendas_rede?.[r] || '';
      }
      return h('details', { class: 'legenda-rede', open: Boolean(legendasRede[r].value) },
        h('summary', {}, seloRede(r), ` Legenda própria para ${REDES[r].nome}`, legendasRede[r].value ? h('span', { class: 'chip' }, 'personalizada') : null),
        legendasRede[r]);
    }));
  }

  function desenharMetricas() {
    if (form.els.status.value !== 'publicado' || !redes.length) { areaMetricas.hidden = true; return; }
    areaMetricas.hidden = false;
    trocar(areaMetricas,
      h('h2', { class: 'secao' }, 'Resultado do post'),
      h('p', { class: 'mudo nota' }, 'Copie os números do app de cada rede (Insights / Estatísticas). Eles alimentam a aba Resultados.'),
      h('div', { class: 'metricas-grade' },
        h('span'), CAMPOS_METRICA.map(([, n]) => h('span', { class: 'metricas-cab' }, n)),
        redes.map((r) => {
          const atual = p.metricas?.find((m) => m.rede === r) || {};
          inputsMetricas[r] = {};
          return [h('span', { class: 'metricas-rede' }, seloRede(r), REDES[r].nome),
            CAMPOS_METRICA.map(([c, n]) => {
              const inp = inputsMetricas[r][c] || h('input', { type: 'number', min: 0, inputmode: 'numeric', 'aria-label': `${n} no ${REDES[r].nome}`, placeholder: n, value: atual[c] || '' });
              inputsMetricas[r][c] = inp;
              return inp;
            })];
        })));
  }

  const nomePerfil = () => clientes.find((c) => String(c.id) === form.els.cliente_id.value)?.nome || estado.empresa?.nome || 'Sua agência';
  const legendaDe = (r) => legendasRede[r]?.value.trim() || form.els.legenda.value;

  function atualizarPrevia() {
    trocar(abasPrevia, redes.length > 1 ? redes.map((r) => h('button', {
      type: 'button', role: 'tab', class: `previa-aba${r === redePrevia ? ' ativa' : ''}`, 'aria-selected': String(r === redePrevia),
      onclick: () => { redePrevia = r; atualizarPrevia(); },
    }, seloRede(r), REDES[r].nome)) : []);
    trocar(areaPrevia, previa({ rede: redePrevia, nome: nomePerfil(), legenda: legendaDe(redePrevia), formato: form.els.formato.value, imagem }));
    contador.textContent = `${form.els.legenda.value.length} / 2.200 caracteres`;
  }
  const contador = h('small', { class: 'ajuda' });
  form.els.legenda.after(contador);
  form.el.addEventListener('input', atualizarPrevia);
  form.el.addEventListener('change', () => { atualizarPrevia(); desenharMetricas(); });

  // Imagem / capa.
  const arquivo = h('input', {
    type: 'file', accept: 'image/*', class: 'oculto', 'aria-label': 'Escolher imagem',
    onchange: async (ev) => {
      const f = ev.target.files[0];
      if (!f) return;
      try {
        imagemNova = await redimensionar(f);
        imagem = imagemNova;
        atualizarPrevia();
        botaoRemover.hidden = false;
      } catch (e) { aviso(e.message, 'erro'); }
    },
  });
  const botaoRemover = h('button', {
    type: 'button', class: 'btn btn-pequeno btn-fantasma', hidden: !imagem,
    onclick: async () => {
      if (p.id && p.tem_imagem && !imagemNova) await tentar(() => DEL(`/posts/${p.id}/imagem`), 'Imagem removida');
      imagem = null; imagemNova = null; p.tem_imagem = false;
      botaoRemover.hidden = true;
      atualizarPrevia();
    },
  }, 'Remover imagem');

  async function salvar() {
    const d = { ...form.ler(), ...extras.ler(), redes, legendas_rede: Object.fromEntries(redes.map((r) => [r, legendasRede[r]?.value || ''])) };
    if (d.status === 'agendado' && !d.data) throw new Error('Para agendar, escolha a data de publicação');
    const r = p.id ? await PUT(`/posts/${p.id}`, d) : await POST('/posts', d);
    if (imagemNova) await PUT(`/posts/${r.id}/imagem`, { arquivo: imagemNova, nome: 'capa.jpg' });
    if (d.status === 'publicado' && redes.length) {
      await PUT(`/posts/${r.id}/metricas`, {
        metricas: redes.map((rede) => ({ rede, ...Object.fromEntries(Object.entries(inputsMetricas[rede] || {}).map(([c, el]) => [c, el.value === '' ? 0 : Number(el.value)])) })),
      });
    }
    return r;
  }

  const acaoSalvar = (destino) => async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true;
    try {
      const r = await salvar();
      aviso('Post salvo');
      location.hash = destino === 'quadro' ? '#/conteudo' : `#/conteudo/${r.id}`;
      if (destino !== 'quadro' && p.id) estado.recarregar();
    } catch (e) { aviso(e.message, 'erro'); } finally { b.disabled = false; }
  };

  const copiarLegenda = async () => {
    await navigator.clipboard.writeText(legendaDe(redePrevia)).then(() => aviso('Legenda copiada'), () => aviso('Não foi possível copiar', 'erro'));
  };

  desenharRedes();
  desenharLegendas();
  desenharMetricas();

  trocar(raiz,
    cabecalho(p.id ? p.titulo : 'Nova demanda',
      h('a', { class: 'btn btn-fantasma', href: '#/conteudo' }, '← Quadro'),
      p.id ? btn('Duplicar', async () => { const r = await tentar(() => POST(`/posts/${p.id}/duplicar`), 'Cópia criada em Ideias'); location.hash = `#/conteudo/${r.id}`; }) : null,
      p.id ? btn('Excluir', async () => {
        if (!await confirmar(`Excluir "${p.titulo}"?`, 'Excluir', 'btn-perigo')) return;
        await tentar(() => DEL(`/posts/${p.id}`), 'Post excluído');
        location.hash = '#/conteudo';
      }, 'btn-perigo') : null),
    h('div', { class: 'editor-post' },
      h('aside', { class: 'editor-previa' },
        abasPrevia, areaPrevia,
        h('div', { class: 'acoes' },
          h('label', { class: 'btn btn-pequeno' }, arquivo, imagem ? 'Trocar imagem' : 'Escolher imagem'),
          botaoRemover,
          btn('Copiar legenda', copiarLegenda, 'btn-pequeno')),
        p.status !== 'publicado' && p.id ? h('p', { class: 'mudo nota' },
          'Na hora marcada, abra o post, copie a legenda e publique no app da rede. Depois mude a etapa para "Publicado".') : null),
      h('div', { class: 'editor-campos' },
        h('section', { class: 'cartao' }, form.el),
        h('section', { class: 'cartao' },
          h('h2', { class: 'secao' }, 'Onde publicar'),
          areaRedes,
          areaLegendas),
        areaMetricas,
        h('section', { class: 'cartao' }, extras.el),
        h('div', { class: 'barra-final acoes' },
          h('button', { class: 'btn', onclick: acaoSalvar('ficar') }, 'Salvar'),
          h('button', { class: 'btn btn-primario', onclick: acaoSalvar('quadro') }, 'Salvar e voltar ao quadro')))));
  atualizarPrevia();
}

// ---------- Calendário da semana ----------
function segunda(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const somarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function calendario(raiz) {
  semana = semana || segunda(hoje());
  const area = h('div');
  const titulo = h('strong', { class: 'semana-titulo' });

  async function carregar() {
    const fim = somarDias(semana, 6);
    titulo.textContent = `${dataBR(semana).slice(0, 5)} a ${dataBR(fim)}`;
    const [posts, semData] = await Promise.all([
      GET(`/posts${qs({ de: semana, ate: fim, cliente_id: clienteFiltro })}`),
      GET(`/posts${qs({ cliente_id: clienteFiltro, quadro: 1 })}`).then((l) => l.filter((p) => !p.data && p.status !== 'publicado')),
    ]);
    const hj = hoje();
    trocar(area,
      h('div', { class: 'semana' }, Array.from({ length: 7 }, (_, i) => {
        const dia = somarDias(semana, i);
        const doDia = posts.filter((p) => p.data === dia).sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99'));
        return h('section', { class: `semana-dia${dia === hj ? ' hoje' : ''}`, 'aria-label': dataBR(dia) },
          h('header', {}, h('span', {}, DIAS[new Date(`${dia}T12:00:00Z`).getUTCDay()]), h('strong', {}, dia.slice(8))),
          doDia.map((p) => h('a', { class: 'semana-post', href: `#/conteudo/${p.id}`, style: `--cor:${COR_STATUS[p.status]}` },
            h('span', { class: 'semana-post-topo' }, h('small', {}, p.hora || '—'), h('span', { class: 'post-card-redes' }, p.redes.map((r) => seloRede(r)))),
            h('span', { class: 'semana-post-titulo' }, p.titulo),
            h('small', { class: 'mudo' }, [NOME_STATUS[p.status], p.cliente_nome].filter(Boolean).join(' · ')))),
          h('button', { class: 'kanban-novo', 'aria-label': `Novo post em ${dataBR(dia)}`, onclick: () => novo({ data: dia, status: 'producao' }) }, '+'));
      })),
      h('section', { class: 'cartao sem-data' },
        h('h2', { class: 'secao' }, `Ainda sem data (${semData.length})`),
        semData.length ? h('div', { class: 'sem-data-lista' }, semData.map(cartaoPost))
          : h('p', { class: 'mudo' }, 'Tudo com data definida.')));
  }

  const mover = (n) => { semana = somarDias(semana, n * 7); carregar(); };
  trocar(raiz,
    cabecalho('Conteúdo', btn('+ Nova demanda', () => novo(), 'btn-primario')),
    abas('conteudo/calendario'),
    h('div', { class: 'filtros' },
      await seletorCliente(carregar),
      h('div', { class: 'semana-nav' },
        h('button', { class: 'btn btn-pequeno', 'aria-label': 'Semana anterior', onclick: () => mover(-1) }, '‹'),
        titulo,
        h('button', { class: 'btn btn-pequeno', 'aria-label': 'Próxima semana', onclick: () => mover(1) }, '›'),
        h('button', { class: 'btn btn-pequeno btn-fantasma', onclick: () => { semana = segunda(hoje()); carregar(); } }, 'Hoje'))),
    area);
  await carregar();
}

// ---------- Resultados ----------
const INDICADORES = [
  ['seguidores', 'Seguidores'], ['alcance', 'Alcance'], ['visualizacoes', 'Visualizações'],
  ['interacoes', 'Interações'], ['visitas', 'Visitas ao perfil'], ['cliques', 'Cliques no link'],
];
const ORDENS_POST = [['interacoes', 'Interações'], ['alcance', 'Alcance'], ['visualizacoes', 'Visualizações'], ['curtidas', 'Curtidas'], ['comentarios', 'Comentários'], ['compartilhamentos', 'Compartilhamentos'], ['salvos', 'Salvos']];

function variacao(atual, anterior) {
  if (atual === null || atual === undefined || !anterior) return null;
  return ((atual - anterior) / anterior) * 100;
}

function sparkline(valores) {
  const pts = valores.filter((x) => x !== null && x !== undefined);
  if (pts.length < 2) return null;
  const W = 120; const H = 32;
  const min = Math.min(...pts); const max = Math.max(...pts);
  const y = (v) => H - 2 - ((v - min) / (max - min || 1)) * (H - 4);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return s('svg', { class: 'sparkline', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, s('path', { d }));
}

// Gráfico de linha desenhado na largura real do contêiner.
function graficoLinha(serie, chave, rotulo) {
  const H = 220; const m = { t: 12, r: 12, b: 28, l: 52 };
  const pts = serie.filter((d) => d[chave] !== null && d[chave] !== undefined);
  const wrap = h('div', { class: 'grafico-wrap' });
  if (pts.length < 2) {
    wrap.append(h('p', { class: 'mudo vazio-bloco' }, 'Lance os números em pelo menos duas datas para ver a evolução.'));
    return wrap;
  }
  const dica = h('div', { class: 'grafico-dica', role: 'tooltip', hidden: true });
  const max = Math.max(...pts.map((d) => d[chave]));
  const min = chave === 'seguidores' ? Math.min(...pts.map((d) => d[chave])) : 0;
  const base = chave === 'seguidores' ? min - (max - min || max) * 0.1 : 0;
  const topo = max + (max - base) * 0.08 || 1;
  let larguraAtual = 0;
  function desenhar(W) {
    larguraAtual = W;
    const iw = W - m.l - m.r; const ih = H - m.t - m.b;
    const t0 = Date.parse(pts[0].data); const t1 = Date.parse(pts[pts.length - 1].data);
    const x = (d) => m.l + ((Date.parse(d.data) - t0) / (t1 - t0 || 1)) * iw;
    const y = (v) => m.t + ih - ((v - base) / (topo - base)) * ih;
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'grafico', role: 'img',
      'aria-label': `${rotulo}: ${pts.map((d) => `${dataBR(d.data)} ${inteiro.format(d[chave])}`).join('; ')}` });
    for (let i = 0; i <= 3; i++) {
      const v = base + ((topo - base) / 3) * i;
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: i === 0 ? 'eixo' : 'grade' }));
      svg.append(s('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'rotulo-eixo' }, compacto.format(v)));
    }
    const linha = pts.map((d, i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)},${y(d[chave]).toFixed(1)}`).join(' ');
    svg.append(s('path', { class: 'area-linha', d: `${linha} L${x(pts[pts.length - 1]).toFixed(1)},${y(base)} L${x(pts[0]).toFixed(1)},${y(base)} Z` }));
    svg.append(s('path', { class: 'linha', d: linha }));
    const passo = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor(iw / 70))));
    pts.forEach((d, i) => {
      if (i % passo === 0 || i === pts.length - 1) svg.append(s('text', { x: x(d), y: H - 8, 'text-anchor': 'middle', class: 'rotulo-eixo' }, dataBR(d.data).slice(0, 5)));
      const ponto = s('circle', { cx: x(d), cy: y(d[chave]), r: 3.5, class: 'ponto', tabindex: 0, 'aria-label': `${dataBR(d.data)}: ${inteiro.format(d[chave])}` });
      const mostrar = () => {
        trocar(dica, h('strong', {}, inteiro.format(d[chave])), h('span', { class: 'mudo' }, dataBR(d.data)));
        dica.style.left = `${x(d)}px`; dica.style.top = `${y(d[chave])}px`;
        dica.hidden = false;
      };
      ponto.addEventListener('mouseenter', mostrar);
      ponto.addEventListener('focus', mostrar);
      ponto.addEventListener('mouseleave', () => { dica.hidden = true; });
      ponto.addEventListener('blur', () => { dica.hidden = true; });
      svg.append(ponto);
    });
    trocar(wrap, svg, dica);
  }
  new ResizeObserver(([e]) => {
    const W = Math.floor(e.contentRect.width);
    if (W > 0 && W !== larguraAtual) desenhar(W);
  }).observe(wrap);
  return wrap;
}

async function abrirPerfil(perfil = {}, aoSalvar) {
  const clientes = await GET('/clientes?ativo=1');
  const form = formulario([
    { nome: 'rede', rotulo: 'Rede', tipo: 'select', obrigatorio: true, opcoes: Object.entries(REDES).map(([k, r]) => [k, r.nome]) },
    { nome: 'usuario', rotulo: 'Perfil (@)', obrigatorio: true, placeholder: '@maragogilab' },
    { nome: 'cliente_id', rotulo: 'De quem é o perfil', tipo: 'select', largura: 'cheio', opcoes: [['', 'Da própria agência'], ...clientes.map((c) => [c.id, c.nome])] },
  ], perfil);
  modal(perfil.id ? 'Editar perfil' : 'Novo perfil', form.el, {
    acoes: [
      ...(perfil.id ? [{ texto: 'Excluir', classe: 'btn-perigo', acao: async () => {
        if (!await confirmar('Excluir o perfil e todo o histórico de números?', 'Excluir', 'btn-perigo')) return false;
        await DEL(`/perfis/${perfil.id}`);
        perfilAtual = null;
        aviso('Perfil excluído');
        aoSalvar?.();
      } }] : []),
      { texto: 'Cancelar', acao: () => {} },
      { texto: 'Salvar', classe: 'btn-primario', acao: async () => {
        const r = perfil.id ? await PUT(`/perfis/${perfil.id}`, form.ler()) : await POST('/perfis', form.ler());
        perfilAtual = r.id;
        aviso('Perfil salvo');
        aoSalvar?.();
      } },
    ],
  });
}

function abrirNumeros(perfil, valores = {}, aoSalvar) {
  const form = formulario([
    { nome: 'data', rotulo: 'Data', tipo: 'date', obrigatorio: true, padrao: hoje(), largura: 'cheio' },
    { nome: 'seguidores', rotulo: 'Seguidores (total hoje)', tipo: 'number' },
    { nome: 'alcance', rotulo: 'Contas alcançadas', tipo: 'number' },
    { nome: 'visualizacoes', rotulo: 'Visualizações', tipo: 'number' },
    { nome: 'interacoes', rotulo: 'Interações', tipo: 'number' },
    { nome: 'visitas', rotulo: 'Visitas ao perfil', tipo: 'number' },
    { nome: 'cliques', rotulo: 'Cliques no link', tipo: 'number' },
  ], valores);
  modal(`Lançar números · ${REDES[perfil.rede].nome} ${perfil.usuario}`, h('div', {},
    h('p', { class: 'mudo' }, 'Abra o painel profissional da rede e copie os números do período (ex.: da última semana). Deixe em branco o que não tiver. Lançar de novo na mesma data substitui.'),
    form.el), {
    acoes: [
      ...(valores.data ? [{ texto: 'Excluir', classe: 'btn-perigo', acao: async () => {
        await DEL(`/perfis/${perfil.id}/numeros/${valores.data}`);
        aviso('Lançamento excluído');
        aoSalvar?.();
      } }] : []),
      { texto: 'Cancelar', acao: () => {} },
      { texto: 'Salvar', classe: 'btn-primario', acao: async () => {
        await POST(`/perfis/${perfil.id}/numeros`, form.ler());
        aviso('Números salvos');
        aoSalvar?.();
      } },
    ],
  });
}

export async function resultados(raiz) {
  const perfis = await GET('/perfis');
  const topo = cabecalho('Conteúdo', btn('Novo perfil', () => abrirPerfil({}, () => resultados(raiz))));
  if (!perfis.length) {
    trocar(raiz, topo, abas('conteudo/resultados'),
      h('section', { class: 'cartao vazio-bloco' },
        h('h2', { class: 'secao' }, 'Acompanhe o crescimento dos perfis'),
        h('p', { class: 'mudo' }, 'Cadastre os perfis da agência e dos clientes (Instagram, TikTok, YouTube…). Depois lance os números de cada semana e veja a evolução e os posts que mais performaram.'),
        btn('Cadastrar o primeiro perfil', () => abrirPerfil({}, () => resultados(raiz)), 'btn-primario')));
    return;
  }
  if (!perfis.some((p) => p.id === perfilAtual)) perfilAtual = perfis[0].id;
  const perfil = perfis.find((p) => p.id === perfilAtual);
  const d = await GET(`/perfis/${perfil.id}/painel?dias=${diasResultado}`);
  const recarregar = () => resultados(raiz);

  const chips = h('div', { class: 'perfis-chips', role: 'tablist', 'aria-label': 'Perfis' }, perfis.map((p) => h('button', {
    role: 'tab', class: `perfil-chip${p.id === perfil.id ? ' ativo' : ''}`, 'aria-selected': String(p.id === perfil.id),
    onclick: () => { perfilAtual = p.id; recarregar(); },
  }, seloRede(p.rede, { grande: true }), h('span', {},
    h('strong', {}, p.usuario),
    h('small', { class: 'mudo' }, [p.seguidores !== null ? `${compacto.format(p.seguidores)} seguidores` : 'sem números', p.cliente_nome].filter(Boolean).join(' · '))))));

  const periodo = h('select', { 'aria-label': 'Período', onchange: (ev) => { diasResultado = ev.target.value; recarregar(); } },
    [['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['365', 'Último ano']].map(([v, t]) => h('option', { value: v, selected: v === diasResultado }, t)));

  const kpis = h('div', { class: 'kpis kpis-rede' }, INDICADORES.map(([k, nome]) => {
    const atual = d.atual[k]; const ant = d.anterior[k];
    const pct = variacao(atual, ant);
    const tom = pct === null ? '' : pct >= 0 ? 'var-alta' : 'var-baixa';
    return h('div', { class: 'kpi kpi-rede' },
      h('div', { class: 'kpi-cab' }, h('span', { class: 'kpi-rotulo' }, nome),
        pct !== null ? h('span', { class: `var ${tom}` }, `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(pct > -10 && pct < 10 ? 1 : 0).replace('.', ',')}%`) : null),
      h('span', { class: 'kpi-valor' }, atual === null || atual === undefined ? '—' : inteiro.format(atual)),
      h('span', { class: 'kpi-detalhe' }, k === 'seguidores' && atual !== null && ant !== null ? `${atual - ant >= 0 ? '+' : ''}${inteiro.format(atual - ant)} no período` : 'vs. período anterior'),
      sparkline(d.serie.map((x) => x[k])));
  }));

  // Evolução.
  let chaveGrafico = 'alcance';
  const areaGrafico = h('div');
  const desenharGrafico = () => trocar(areaGrafico, graficoLinha(d.serie, chaveGrafico, INDICADORES.find(([k]) => k === chaveGrafico)[1]));
  const seletorGrafico = h('select', { 'aria-label': 'Indicador do gráfico', onchange: (ev) => { chaveGrafico = ev.target.value; desenharGrafico(); } },
    INDICADORES.map(([k, n]) => h('option', { value: k, selected: k === chaveGrafico }, n)));
  desenharGrafico();

  // Melhores publicações.
  let ordem = 'interacoes';
  const listaPosts = h('ol', { class: 'ranking' });
  const desenharRanking = () => {
    const ordenados = [...d.posts].sort((a, b) => (b[ordem] || 0) - (a[ordem] || 0)).slice(0, 10);
    const maior = Math.max(1, ...ordenados.map((p) => p[ordem] || 0));
    if (!ordenados.length) {
      trocar(listaPosts, h('li', { class: 'mudo' }, `Nenhum post publicado com resultado lançado neste período. Ao mudar um post para "Publicado", preencha o resultado no ${REDES[perfil.rede].nome}.`));
      return;
    }
    trocar(listaPosts, ordenados.map((p, i) => h('li', {},
      h('a', { href: `#/conteudo/${p.id}`, class: 'ranking-item' },
        h('span', { class: 'ranking-pos' }, i + 1),
        p.tem_imagem ? h('img', { src: `/api/posts/${p.id}/imagem?v=${p.arquivo_id}`, alt: '', loading: 'lazy' }) : h('span', { class: 'ranking-sem-img', 'aria-hidden': 'true' }, '▣'),
        h('span', { class: 'ranking-info' },
          h('strong', {}, p.titulo),
          h('small', { class: 'mudo' }, [dataBR(p.data), NOME_FORMATO[p.formato], `${compacto.format(p.alcance)} alcance`, `${compacto.format(p.curtidas)} curtidas`, `${compacto.format(p.comentarios)} coment.`, `${compacto.format(p.salvos)} salvos`].filter(Boolean).join(' · ')),
          h('span', { class: 'ranking-barra', style: `width:${((p[ordem] || 0) / maior) * 100}%`, 'aria-hidden': 'true' })),
        h('strong', { class: 'ranking-valor' }, compacto.format(p[ordem] || 0))))));
  };
  const seletorOrdem = h('select', { 'aria-label': 'Ordenar por', onchange: (ev) => { ordem = ev.target.value; desenharRanking(); } },
    ORDENS_POST.map(([k, n]) => h('option', { value: k }, n)));
  desenharRanking();

  const lancamentos = [...d.serie].reverse();
  trocar(raiz, topo, abas('conteudo/resultados'), chips,
    h('div', { class: 'perfil-topo' },
      seloRede(perfil.rede, { grande: true }),
      h('div', { class: 'cresce' }, h('h2', {}, `${REDES[perfil.rede].nome} ${perfil.usuario}`),
        h('small', { class: 'mudo' }, perfil.atualizado_em ? `Atualizado em ${dataBR(perfil.atualizado_em)}` : 'Nenhum número lançado ainda')),
      h('div', { class: 'acoes' }, periodo,
        btn('Editar perfil', () => abrirPerfil(perfil, recarregar), 'btn-fantasma'),
        btn('Lançar números', () => abrirNumeros(perfil, {}, recarregar), 'btn-primario'))),
    kpis,
    h('section', { class: 'cartao' },
      h('div', { class: 'secao-topo' }, h('h2', { class: 'secao' }, 'Evolução'), seletorGrafico),
      areaGrafico),
    h('section', { class: 'cartao' },
      h('div', { class: 'secao-topo' }, h('h2', { class: 'secao' }, 'Melhores publicações'), seletorOrdem),
      listaPosts),
    lancamentos.length ? h('details', { class: 'cartao ver-dados' },
      h('summary', {}, `Números lançados no período (${lancamentos.length})`),
      h('ul', { class: 'lista-simples' }, lancamentos.map((x) => h('li', {},
        h('button', { class: 'link-botao', onclick: () => abrirNumeros(perfil, x, recarregar) },
          h('strong', {}, dataBR(x.data)), ' ',
          h('span', { class: 'mudo' }, INDICADORES.filter(([k]) => x[k] !== null).map(([k, n]) => `${n}: ${inteiro.format(x[k])}`).join(' · '))))))) : null);
}
