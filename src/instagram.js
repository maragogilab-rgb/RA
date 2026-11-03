'use strict';

// Integração com o Instagram (API oficial "Instagram API com login do Instagram").
// - puxa os números do perfil (seguidores, alcance, visualizações, interações, cliques) dia a dia;
// - importa os posts publicados e os resultados de cada um;
// - publica sozinho os posts agendados com imagem quando chega a hora.
// O token é gerado pelo dono da conta no painel de desenvolvedores da Meta (ver INSTAGRAM.md).

const crypto = require('node:crypto');
const v = require('./validar');

const API = 'https://graph.instagram.com';
const VERSAO = 'v23.0';
const FUSO = 'America/Maceio';
const MAX_TENTATIVAS = 3;
const SYNC_HORAS = 6;
const MAX_IMAGEM = 6 * 1024 * 1024;
const FORMATOS_PUBLICAVEIS = ['post', 'carrossel'];
const CHAVE_URL = 'instagram.url_publica';

class ErroInstagram extends Error {}

// Data e hora atuais no fuso da agência ("AAAA-MM-DD HH:MM").
function agoraLocal(data = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(data).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
// Início do dia (00:00 no fuso da agência, UTC-3) em segundos Unix.
const inicioDoDia = (dia) => Math.floor(Date.parse(`${dia}T00:00:00-03:00`) / 1000);

const FORMATO_DA_MIDIA = { IMAGE: 'post', CAROUSEL_ALBUM: 'carrossel', VIDEO: 'video', REELS: 'reels', STORY: 'story' };

// Mensagens da Meta traduzidas para o que a pessoa precisa fazer.
function explicar(erro) {
  const e = erro || {};
  if (e.code === 190) return 'O acesso ao Instagram expirou ou foi revogado. Conecte o perfil de novo com um token novo.';
  if (e.code === 10 || e.code === 200) return `Permissão negada pelo Instagram: ${e.message}. Confira se o token tem as permissões de conteúdo e insights.`;
  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613) return 'Limite de uso da API do Instagram atingido. O ERP tenta de novo mais tarde.';
  if (e.code === 9004 || /media.*(download|fetch|uri)/i.test(e.message || '')) {
    return 'O Instagram não conseguiu baixar a imagem. A publicação automática só funciona com o ERP na internet (Railway), não no computador local.';
  }
  return e.error_user_msg || e.message || 'Erro desconhecido do Instagram';
}

function criarInstagram(db, { fetch = globalThis.fetch, log = console.log, esperarMs = 2000 } = {}) {
  let timer = null;
  let emAndamento = null;

  async function chamar(caminho, { token, metodo = 'GET', params = {}, versao = true } = {}) {
    const url = new URL(`${API}/${versao ? `${VERSAO}/` : ''}${caminho}`);
    const corpo = new URLSearchParams();
    const destino = metodo === 'GET' ? url.searchParams : corpo;
    for (const [k, val] of Object.entries(params)) if (val !== undefined && val !== null) destino.set(k, String(val));
    destino.set('access_token', token);
    let r;
    try {
      r = await fetch(url.toString(), metodo === 'GET' ? { method: 'GET' } : {
        method: metodo, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo.toString(),
      });
    } catch (e) {
      throw new ErroInstagram(`Sem conexão com o Instagram: ${e.message}`);
    }
    const dados = await r.json().catch(() => ({}));
    if (!r.ok || dados.error) {
      const err = new ErroInstagram(explicar(dados.error || { message: `Erro ${r.status}` }));
      err.codigo = dados.error?.code;
      throw err;
    }
    return dados;
  }

  const perfil = (id) => db.prepare('SELECT * FROM perfis_sociais WHERE id = ?').get(id);
  const urlPublica = () => (process.env.ERP_URL_PUBLICA || db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(CHAVE_URL)?.valor || '').replace(/\/+$/, '');

  // ---------- Conexão ----------
  async function conectar(perfilId, token, { url } = {}) {
    token = String(token || '').trim();
    if (!/^[A-Za-z0-9_|.-]{20,}$/.test(token)) throw new ErroInstagram('Cole o token de acesso gerado no painel da Meta (um texto longo, sem espaços).');
    const eu = await chamar('me', { token, params: { fields: 'user_id,username,account_type,followers_count' } });
    let final = token;
    // Troca por um token renovado (vale 60 dias). Tokens muito novos (menos de 24 h) não renovam: tudo bem.
    try {
      const r = await chamar('refresh_access_token', { token, versao: false, params: { grant_type: 'ig_refresh_token' } });
      if (r.access_token) final = r.access_token;
    } catch { /* mantém o token original */ }
    db.prepare(`UPDATE perfis_sociais SET token = ?, ig_user_id = ?, usuario = ?, rede = 'instagram', token_renovado_em = datetime('now'),
      sync_erro = NULL WHERE id = ?`).run(final, String(eu.user_id || eu.id), `@${eu.username}`, perfilId);
    if (url && /^https?:\/\//.test(url)) {
      db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor').run(CHAVE_URL, url);
    }
    return { usuario: eu.username, tipo: eu.account_type, seguidores: eu.followers_count };
  }

  function desconectar(perfilId) {
    db.prepare('UPDATE perfis_sociais SET token = NULL, ig_user_id = NULL, token_renovado_em = NULL, sync_erro = NULL WHERE id = ?').run(perfilId);
  }

  // Renova o token toda semana para ele nunca chegar aos 60 dias.
  async function renovarTokens() {
    const lista = db.prepare(`SELECT * FROM perfis_sociais WHERE token IS NOT NULL
      AND (token_renovado_em IS NULL OR token_renovado_em < datetime('now', '-7 days'))`).all();
    for (const p of lista) {
      try {
        const r = await chamar('refresh_access_token', { token: p.token, versao: false, params: { grant_type: 'ig_refresh_token' } });
        db.prepare("UPDATE perfis_sociais SET token = ?, token_renovado_em = datetime('now') WHERE id = ?").run(r.access_token || p.token, p.id);
      } catch (e) {
        db.prepare('UPDATE perfis_sociais SET sync_erro = ? WHERE id = ?').run(e.message, p.id);
      }
    }
  }

  // ---------- Números do perfil ----------
  const salvarNumeros = db.prepare(`INSERT INTO perfil_numeros (perfil_id, data, seguidores, alcance, visualizacoes, interacoes, visitas, cliques)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(perfil_id, data) DO UPDATE SET
      seguidores = COALESCE(excluded.seguidores, seguidores), alcance = COALESCE(excluded.alcance, alcance),
      visualizacoes = COALESCE(excluded.visualizacoes, visualizacoes), interacoes = COALESCE(excluded.interacoes, interacoes),
      visitas = COALESCE(excluded.visitas, visitas), cliques = COALESCE(excluded.cliques, cliques)`);

  const METRICAS_CONTA = { reach: 'alcance', views: 'visualizacoes', total_interactions: 'interacoes', profile_links_taps: 'cliques', profile_views: 'visitas' };

  async function numerosDoDia(p, dia) {
    const params = { period: 'day', metric_type: 'total_value', since: inicioDoDia(dia), until: inicioDoDia(dia) + 86400 };
    const ler = (dados) => {
      const out = {};
      for (const m of dados.data || []) if (METRICAS_CONTA[m.name]) out[METRICAS_CONTA[m.name]] = m.total_value?.value ?? m.values?.[0]?.value ?? null;
      return out;
    };
    try {
      return ler(await chamar(`${p.ig_user_id}/insights`, { token: p.token, params: { ...params, metric: Object.keys(METRICAS_CONTA).join(',') } }));
    } catch (e) {
      if (e.codigo === 190) throw e;
      // Alguma métrica não é suportada para a conta: pede uma por uma e fica com as que vierem.
      const out = {};
      for (const m of Object.keys(METRICAS_CONTA)) {
        try { Object.assign(out, ler(await chamar(`${p.ig_user_id}/insights`, { token: p.token, params: { ...params, metric: m } }))); } catch { /* ignora */ }
      }
      return out;
    }
  }

  // ---------- Posts e resultados ----------
  async function baixarImagem(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const tipo = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
      if (!tipo.startsWith('image/')) return null;
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.length > MAX_IMAGEM) return null;
      return db.prepare('INSERT INTO arquivos (nome, tipo, tamanho, conteudo) VALUES (?, ?, ?, ?)').run('instagram.jpg', tipo, bytes.length, bytes).lastInsertRowid;
    } catch { return null; }
  }

  const salvarMetricas = db.prepare(`INSERT INTO post_metricas (post_id, rede, alcance, visualizacoes, curtidas, comentarios, compartilhamentos, salvos)
    VALUES (?, 'instagram', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_id, rede) DO UPDATE SET alcance = excluded.alcance, visualizacoes = excluded.visualizacoes, curtidas = excluded.curtidas,
      comentarios = excluded.comentarios, compartilhamentos = excluded.compartilhamentos, salvos = excluded.salvos`);

  async function resultadosDaMidia(p, m) {
    const valores = {};
    for (const metricas of ['reach,views,likes,comments,shares,saved', 'reach,likes,comments,shares,saved']) {
      try {
        const r = await chamar(`${m.id}/insights`, { token: p.token, params: { metric: metricas } });
        for (const x of r.data || []) valores[x.name] = x.values?.[0]?.value ?? x.total_value?.value ?? 0;
        break;
      } catch (e) { if (e.codigo === 190) throw e; }
    }
    return {
      alcance: valores.reach || 0, visualizacoes: valores.views || 0,
      curtidas: valores.likes ?? m.like_count ?? 0, comentarios: valores.comments ?? m.comments_count ?? 0,
      compartilhamentos: valores.shares || 0, salvos: valores.saved || 0,
    };
  }

  async function importarPosts(p, limite = 25) {
    const r = await chamar(`${p.ig_user_id}/media`, {
      token: p.token,
      params: { fields: 'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count', limit: limite },
    });
    let novos = 0;
    for (const m of r.data || []) {
      let post = db.prepare('SELECT id FROM posts WHERE ig_media_id = ?').get(m.id);
      if (!post) {
        const local = m.timestamp ? agoraLocal(new Date(m.timestamp)) : `${v.hoje()} 00:00`;
        const legenda = (m.caption || '').slice(0, 5000) || null;
        const titulo = (legenda?.split('\n').find((l) => l.trim()) || 'Post do Instagram').trim().slice(0, 80);
        const formato = m.media_product_type === 'REELS' ? 'reels' : FORMATO_DA_MIDIA[m.media_type] || 'post';
        const capa = m.thumbnail_url || (m.media_type === 'VIDEO' ? null : m.media_url);
        const arquivo = capa ? await baixarImagem(capa) : null;
        const ordem = (db.prepare("SELECT MAX(ordem) AS o FROM posts WHERE status = 'publicado'").get().o ?? 0) + 1;
        const id = db.prepare(`INSERT INTO posts (titulo, cliente_id, formato, status, redes, legenda, data, hora, link, arquivo_id, ig_media_id, ordem)
          VALUES (?, ?, ?, 'publicado', '["instagram"]', ?, ?, ?, ?, ?, ?, ?)`)
          .run(titulo, p.cliente_id, formato, legenda, local.slice(0, 10), local.slice(11), m.permalink || null, arquivo, m.id, ordem).lastInsertRowid;
        post = { id };
        novos++;
      }
      const res = await resultadosDaMidia(p, m);
      salvarMetricas.run(post.id, res.alcance, res.visualizacoes, res.curtidas, res.comentarios, res.compartilhamentos, res.salvos);
    }
    return { posts: (r.data || []).length, novos };
  }

  async function sincronizar(perfilId, { dias } = {}) {
    const p = perfil(perfilId);
    if (!p?.token) throw new ErroInstagram('Este perfil ainda não está conectado ao Instagram.');
    try {
      const eu = await chamar('me', { token: p.token, params: { fields: 'username,followers_count' } });
      const hoje = v.hoje();
      salvarNumeros.run(p.id, hoje, eu.followers_count ?? null, null, null, null, null, null);
      // Primeira vez: 30 dias para já ter gráfico. Depois, só os últimos dias (os números de ontem ainda mudam um pouco).
      const qtd = dias ?? (p.sincronizado_em ? 3 : 30);
      for (let i = 1; i <= qtd; i++) {
        const dia = v.somarDias(hoje, -i);
        const n = await numerosDoDia(p, dia);
        if (Object.keys(n).length) salvarNumeros.run(p.id, dia, null, n.alcance ?? null, n.visualizacoes ?? null, n.interacoes ?? null, n.visitas ?? null, n.cliques ?? null);
      }
      const posts = await importarPosts(p);
      db.prepare("UPDATE perfis_sociais SET usuario = ?, sincronizado_em = datetime('now'), sync_erro = NULL WHERE id = ?").run(`@${eu.username}`, p.id);
      return { seguidores: eu.followers_count, dias: qtd, ...posts };
    } catch (e) {
      db.prepare("UPDATE perfis_sociais SET sync_erro = ?, sincronizado_em = datetime('now') WHERE id = ?").run(e.message, p.id);
      throw e;
    }
  }

  // ---------- Publicação ----------
  function perfilDoPost(post) {
    return db.prepare(`SELECT * FROM perfis_sociais WHERE rede = 'instagram' AND token IS NOT NULL AND cliente_id IS ?
      ORDER BY id LIMIT 1`).get(post.cliente_id);
  }

  function legendaInstagram(post) {
    let extra = {};
    try { extra = JSON.parse(post.legendas_rede || '{}'); } catch { /* ignora */ }
    return (extra.instagram || post.legenda || '').slice(0, 2200);
  }

  // Link público (com segredo) para o Instagram baixar a imagem do post.
  function urlImagem(post) {
    let segredo = post.imagem_token;
    if (!segredo) {
      segredo = crypto.randomBytes(18).toString('hex');
      db.prepare('UPDATE posts SET imagem_token = ? WHERE id = ?').run(segredo, post.id);
    }
    return `${urlPublica()}/api/publico/posts/${post.id}/${segredo}.jpg`;
  }

  // Motivo pelo qual o post não pode ser publicado sozinho (ou null se pode).
  function impedimento(post) {
    const redes = JSON.parse(post.redes || '[]');
    if (!redes.includes('instagram')) return 'O post não está marcado para o Instagram.';
    if (!FORMATOS_PUBLICAVEIS.includes(post.formato)) return 'A publicação automática funciona para posts com imagem. Reels, vídeos e stories: publique pelo app.';
    if (!post.arquivo_id) return 'Adicione a imagem do post para publicar automaticamente.';
    const tipo = db.prepare('SELECT tipo FROM arquivos WHERE id = ?').get(post.arquivo_id)?.tipo;
    if (tipo !== 'image/jpeg') return 'O Instagram só aceita imagem JPG. Troque a imagem do post (o ERP converte ao enviar).';
    if (!perfilDoPost(post)) return 'Nenhum perfil do Instagram conectado para este cliente. Conecte em Conteúdo → Resultados.';
    const url = urlPublica();
    if (!/^https:\/\//.test(url) || /localhost|127\.0\.0\.1|\.local\b|192\.168\./.test(url)) {
      return 'A publicação automática precisa do ERP na internet (Railway). No computador local o Instagram não consegue baixar a imagem.';
    }
    return null;
  }

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  async function publicar(postId) {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    if (!post) throw new ErroInstagram('Post não encontrado');
    if (post.ig_media_id) throw new ErroInstagram('Este post já foi publicado no Instagram.');
    const motivo = impedimento(post);
    if (motivo) throw new ErroInstagram(motivo);
    const p = perfilDoPost(post);
    try {
      const container = await chamar(`${p.ig_user_id}/media`, {
        token: p.token, metodo: 'POST', params: { image_url: urlImagem(post), caption: legendaInstagram(post) },
      });
      // Espera o Instagram processar a imagem.
      for (let i = 0; i < 10; i++) {
        const st = await chamar(container.id, { token: p.token, params: { fields: 'status_code' } });
        if (st.status_code === 'FINISHED' || !st.status_code) break;
        if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new ErroInstagram('O Instagram recusou a imagem (formato ou tamanho). Use JPG entre 320 e 1440 px, proporção entre 4:5 e 1,91:1.');
        await esperar(esperarMs);
      }
      const pub = await chamar(`${p.ig_user_id}/media_publish`, { token: p.token, metodo: 'POST', params: { creation_id: container.id } });
      let link = null;
      try { link = (await chamar(pub.id, { token: p.token, params: { fields: 'permalink' } })).permalink; } catch { /* sem link */ }
      const agora = agoraLocal();
      db.prepare(`UPDATE posts SET status = 'publicado', ig_media_id = ?, link = COALESCE(?, link), publicacao_erro = NULL,
        data = COALESCE(data, ?), hora = COALESCE(hora, ?) WHERE id = ?`).run(pub.id, link, agora.slice(0, 10), agora.slice(11), post.id);
      log(`[Instagram] post #${post.id} publicado em ${p.usuario}`);
      return { id: pub.id, link };
    } catch (e) {
      db.prepare('UPDATE posts SET publicacao_erro = ?, publicacao_tentativas = publicacao_tentativas + 1 WHERE id = ?').run(e.message, post.id);
      throw e;
    }
  }

  // ---------- Ciclo automático ----------
  async function ciclo() {
    await renovarTokens();
    const agora = agoraLocal();
    const vencidos = db.prepare(`SELECT id FROM posts WHERE status = 'agendado' AND publicar_auto = 1 AND ig_media_id IS NULL
      AND publicacao_tentativas < ? AND data IS NOT NULL AND (data || ' ' || COALESCE(hora, '09:00')) <= ? ORDER BY data, hora LIMIT 10`).all(MAX_TENTATIVAS, agora);
    let publicados = 0;
    for (const { id } of vencidos) {
      try { await publicar(id); publicados++; } catch (e) { log(`[Instagram] post #${id} não publicado: ${e.message}`); }
    }
    const paraSincronizar = db.prepare(`SELECT id FROM perfis_sociais WHERE token IS NOT NULL
      AND (sincronizado_em IS NULL OR sincronizado_em < datetime('now', ?))`).all(`-${SYNC_HORAS} hours`);
    for (const { id } of paraSincronizar) {
      try { await sincronizar(id); } catch (e) { log(`[Instagram] perfil #${id}: ${e.message}`); }
    }
    return { publicados, sincronizados: paraSincronizar.length };
  }

  function executar() {
    if (!emAndamento) emAndamento = ciclo().finally(() => { emAndamento = null; });
    return emAndamento;
  }
  const seguro = () => executar().catch((e) => log(`[Instagram] erro no ciclo: ${e.message}`));

  return {
    conectar, desconectar, sincronizar, publicar, impedimento, executar, urlPublica,
    rodando: () => Boolean(timer),
    iniciar(intervaloMs = 5 * 60 * 1000) {
      if (timer) return;
      timer = setInterval(seguro, intervaloMs);
      timer.unref?.();
      setTimeout(seguro, 15000).unref?.();
    },
    parar() { clearInterval(timer); timer = null; },
  };
}

module.exports = { criarInstagram, ErroInstagram, agoraLocal };
