// Agenda de eventos/gravações e lista de tarefas.
import {
  trocar, GET, POST, PUT, DEL, qs, h, dataBR, hoje, selo, modal, confirmar, formulario, tabela, cabecalho, filtros, btn, aviso, estado,
} from './nucleo.js';

const TIPOS_EVENTO = ['Casamento', 'Cobertura de marca', 'Evento corporativo', 'Show', 'Gravação', 'Ensaio fotográfico', 'Entrega / montagem', 'Reunião', 'Outro'];
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Link "adicionar ao Google Agenda" de um evento.
export function linkGoogleAgenda(e) {
  const dia = e.data.replace(/-/g, '');
  let datas;
  if (e.hora) {
    const [hh, mm] = e.hora.split(':').map(Number);
    const fim = Math.min(23, hh + 2);
    datas = `${dia}T${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}00/${dia}T${String(fim).padStart(2, '0')}${String(mm).padStart(2, '0')}00`;
  } else {
    const d = new Date(`${e.data}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    datas = `${dia}/${d.toISOString().slice(0, 10).replace(/-/g, '')}`;
  }
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: e.titulo, dates: datas, ctz: 'America/Maceio',
    location: e.local || '', details: [e.tipo, e.cliente_nome && `Cliente: ${e.cliente_nome}`, e.notas].filter(Boolean).join('\n'),
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export async function abrirEvento(e = {}, aoSalvar) {
  const [clientes, projetos] = await Promise.all([GET('/clientes?ativo=1'), GET('/projetos?status=andamento')]);
  const form = formulario([
    { nome: 'titulo', rotulo: 'Título', obrigatorio: true, largura: 'cheio', placeholder: 'Ex.: Cobertura fotográfica Yuri & Vitória' },
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: [['', '—'], ...TIPOS_EVENTO.map((t) => [t, t])] },
    { nome: 'data', rotulo: 'Data', tipo: 'date', obrigatorio: true, padrao: hoje() },
    { nome: 'hora', rotulo: 'Hora', tipo: 'time' },
    { nome: 'local', rotulo: 'Local' },
    { nome: 'cliente_id', rotulo: 'Cliente', tipo: 'select', opcoes: [['', '—'], ...clientes.map((c) => [c.id, c.nome])] },
    { nome: 'cliente_texto', rotulo: 'Ou nome do cliente (se não cadastrado)' },
    { nome: 'projeto_id', rotulo: 'Projeto / orçamento', tipo: 'select', largura: 'cheio',
      opcoes: [['', '—'], ...projetos.map((p) => [p.id, `#${p.id} ${p.titulo}`]), ...(e.projeto_id && !projetos.some((p) => p.id === e.projeto_id) ? [[e.projeto_id, `#${e.projeto_id} ${e.projeto_titulo || ''}`]] : [])] },
    { nome: 'notas', rotulo: 'Observações', tipo: 'textarea', largura: 'cheio' },
  ], e);
  modal(e.id ? 'Editar evento' : 'Novo evento', form.el, {
    acoes: [
      ...(e.id ? [{ texto: 'Excluir', classe: 'btn-perigo', acao: async () => {
        await DEL(`/eventos/${e.id}`);
        aviso('Evento excluído');
        aoSalvar?.();
      } }] : []),
      { texto: 'Cancelar', acao: () => {} },
      { texto: 'Salvar', classe: 'btn-primario', acao: async () => {
        const d = form.ler();
        const r = e.id ? await PUT(`/eventos/${e.id}`, d) : await POST('/eventos', d);
        aviso('Evento salvo');
        aoSalvar?.(r);
      } },
    ],
  });
}

export async function agenda(raiz) {
  const area = h('div');
  const f = filtros([
    { nome: 'periodo', tipo: 'select', rotulo: 'Período', opcoes: [['proximos', 'Próximos'], ['passados', 'Já aconteceram'], ['todos', 'Todos']] },
    { nome: 'busca', rotulo: 'Buscar evento, local ou cliente…' },
  ], carregar);

  async function carregar(filtro = f.valores()) {
    const hj = hoje();
    const q = { busca: filtro.busca };
    if (filtro.periodo === 'proximos') q.de = hj;
    if (filtro.periodo === 'passados') q.ate = hj;
    let eventos = await GET(`/eventos${qs(q)}`);
    if (filtro.periodo === 'passados') eventos = eventos.reverse();
    if (!eventos.length) {
      trocar(area, h('p', { class: 'mudo vazio-bloco' }, 'Nenhum evento. Clique em "Novo evento" para agendar uma gravação, cobertura ou entrega.'));
      return;
    }
    // Agrupa por mês.
    const grupos = new Map();
    for (const e of eventos) {
      const chave = e.data.slice(0, 7);
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(e);
    }
    trocar(area, [...grupos].map(([mes, lista]) => h('section', { class: 'cartao agenda-mes' },
      h('h2', { class: 'secao' }, `${MESES[Number(mes.slice(5)) - 1]} de ${mes.slice(0, 4)}`),
      h('ul', { class: 'agenda-lista' }, lista.map((e) => {
        const d = new Date(`${e.data}T12:00:00Z`);
        return h('li', { class: e.data === hj ? 'hoje' : e.data < hj ? 'passado' : null },
          h('div', { class: 'agenda-dia' }, h('strong', {}, String(d.getUTCDate()).padStart(2, '0')), h('small', {}, DIAS[d.getUTCDay()])),
          h('button', { class: 'agenda-info', onclick: () => abrirEvento(e, () => carregar()) },
            h('strong', {}, e.titulo),
            h('span', { class: 'mudo' }, [e.hora, e.tipo, e.local, e.cliente_nome].filter(Boolean).join(' · ') || 'Sem detalhes'),
            e.projeto_id ? h('small', {}, `Projeto #${e.projeto_id} ${e.projeto_titulo || ''}`) : null),
          h('a', { class: 'btn btn-pequeno btn-fantasma', href: linkGoogleAgenda(e), target: '_blank', rel: 'noopener', title: 'Adicionar ao Google Agenda' }, '+ Google'));
      })))));
  }

  const assinar = async () => {
    const { caminho } = await GET('/agenda/assinatura');
    const url = `${location.origin}${caminho}`;
    const campo = h('input', { value: url, readonly: true, onfocus: (ev) => ev.target.select() });
    modal('Ver a agenda no Google Agenda / celular', h('div', {},
      h('p', {}, 'Assine este link uma vez e todos os eventos do ERP aparecem automaticamente no seu Google Agenda (e no celular).'),
      campo,
      h('ol', { class: 'passos' },
        h('li', {}, 'Copie o link acima.'),
        h('li', {}, 'No computador, abra ', h('a', { href: 'https://calendar.google.com/calendar/u/0/r/settings/addbyurl', target: '_blank', rel: 'noopener' }, 'Google Agenda → Adicionar agenda → Do URL'), '.'),
        h('li', {}, 'Cole o link e clique em "Adicionar agenda". O Google atualiza sozinho (pode levar algumas horas).')),
      h('p', { class: 'mudo' }, 'Quem tiver este link vê os eventos. Não compartilhe publicamente.')), {
      acoes: [
        ...(estado.usuario.papel === 'admin' ? [{ texto: 'Gerar novo link', acao: async () => {
          if (!await confirmar('O link atual deixará de funcionar. Continuar?', 'Gerar novo link')) return false;
          const r = await POST('/agenda/assinatura');
          campo.value = `${location.origin}${r.caminho}`;
          aviso('Novo link gerado');
          return false;
        } }] : []),
        { texto: 'Copiar link', classe: 'btn-primario', acao: async () => {
          await navigator.clipboard.writeText(url).catch(() => {});
          aviso('Link copiado');
        } },
      ],
    });
  };

  trocar(raiz, cabecalho('Agenda', btn('Ver no Google Agenda', assinar), btn('Novo evento', () => abrirEvento({}, () => carregar()), 'btn-primario')), f.el, area);
  await carregar();
}

// ---------- Tarefas ----------
export async function abrirTarefa(t = {}, aoSalvar) {
  const [usuarios, projetos] = await Promise.all([GET('/usuarios/nomes'), GET('/projetos')]);
  const form = formulario([
    { nome: 'titulo', rotulo: 'O que precisa ser feito', obrigatorio: true, largura: 'cheio' },
    { nome: 'prazo', rotulo: 'Prazo', tipo: 'date' },
    { nome: 'prioridade', rotulo: 'Prioridade', tipo: 'select', padrao: 'media', opcoes: [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']] },
    { nome: 'responsavel_id', rotulo: 'Responsável', tipo: 'select', padrao: estado.usuario.id, opcoes: [['', 'Ninguém'], ...usuarios.map((u) => [u.id, u.nome])] },
    { nome: 'projeto_id', rotulo: 'Projeto (opcional)', tipo: 'select', opcoes: [['', '—'], ...projetos.slice(0, 200).map((p) => [p.id, `#${p.id} ${p.titulo}`])] },
  ], t);
  modal(t.id ? 'Editar tarefa' : 'Nova tarefa', form.el, {
    acoes: [
      ...(t.id ? [{ texto: 'Excluir', classe: 'btn-perigo', acao: async () => { await DEL(`/tarefas/${t.id}`); aviso('Tarefa excluída'); aoSalvar?.(); } }] : []),
      { texto: 'Cancelar', acao: () => {} },
      { texto: 'Salvar', classe: 'btn-primario', acao: async () => {
        const d = form.ler();
        if (t.id) await PUT(`/tarefas/${t.id}`, d); else await POST('/tarefas', d);
        aviso('Tarefa salva');
        aoSalvar?.();
      } },
    ],
  });
}

export async function tarefas(raiz) {
  const area = h('div');
  const f = filtros([
    { nome: 'feito', tipo: 'select', rotulo: 'Situação', padrao: '0', opcoes: [['0', 'A fazer'], ['1', 'Concluídas'], ['', 'Todas']] },
    { nome: 'responsavel', tipo: 'select', rotulo: 'Responsável', opcoes: [['', 'De todos'], ['eu', 'Minhas']] },
  ], carregar);

  async function carregar(filtro = f.valores()) {
    const lista = await GET(`/tarefas${qs(filtro)}`);
    const hj = hoje();
    const tomPrioridade = { alta: 'erro', media: 'aviso', baixa: 'neutro' };
    trocar(area, tabela([
      { titulo: '', classe: 'col-check', csv: false, valor: (t) => h('input', {
        type: 'checkbox', checked: Boolean(t.feito), 'aria-label': `Concluir: ${t.titulo}`,
        onchange: async (ev) => {
          try { await POST(`/tarefas/${t.id}/feito`, { feito: ev.target.checked }); carregar(); } catch (e) { aviso(e.message, 'erro'); }
        },
      }) },
      { titulo: 'Tarefa', valor: (t) => h('div', { class: t.feito ? 'riscado' : null }, t.titulo,
        t.projeto_id ? h('a', { class: 'mudo bloco', href: `#/projetos/${t.projeto_id}` }, `Projeto #${t.projeto_id} ${t.projeto_titulo || ''}`) : null), csv: (t) => t.titulo },
      { titulo: 'Prazo', valor: (t) => (t.prazo ? h('span', { class: !t.feito && t.prazo < hj ? 'txt-alerta' : null }, !t.feito && t.prazo < hj ? '⚠ ' : '', dataBR(t.prazo)) : '—'), csv: (t) => dataBR(t.prazo) },
      { titulo: 'Prioridade', valor: (t) => selo({ alta: 'Alta', media: 'Média', baixa: 'Baixa' }[t.prioridade], tomPrioridade[t.prioridade]), csv: (t) => t.prioridade },
      { titulo: 'Responsável', valor: (t) => t.responsavel_nome || '—' },
    ], lista, { aoClicar: (t) => abrirTarefa(t, () => carregar()), nomeArquivo: 'tarefas', vazio: 'Nenhuma tarefa aqui. 🎉' }));
  }

  trocar(raiz, cabecalho('Tarefas', btn('Nova tarefa', () => abrirTarefa({}, () => carregar()), 'btn-primario')), f.el, area);
  await carregar();
}
