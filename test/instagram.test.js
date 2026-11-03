'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { abrir } = require('../src/db');
const { garantirAdmin } = require('../src/auth');
const { criarApp } = require('../src/app');
const { hoje, somarDias } = require('../src/validar');
const { agoraLocal } = require('../src/instagram');

let servidor;
let base;
let cookie = '';
let app;

async function api(metodo, caminho, corpo) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(base + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const texto = await r.text();
  let dados = texto;
  try { dados = texto ? JSON.parse(texto) : null; } catch { /* binário */ }
  return { status: r.status, dados, tipo: r.headers.get('content-type') };
}

// Instagram falso: responde como a API oficial e guarda as chamadas.
const chamadas = [];
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
async function instagramFalso(url, init = {}) {
  const u = new URL(url);
  const corpo = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : {};
  chamadas.push({ metodo: init.method || 'GET', caminho: u.pathname, query: Object.fromEntries(u.searchParams), corpo });
  const token = u.searchParams.get('access_token') || corpo.access_token;
  if (u.hostname === 'cdn.instagram.test') return new Response(JPG, { headers: { 'Content-Type': 'image/jpeg' } });
  if (token === 'IGtokenvencido00000000000') return json({ error: { message: 'Session expired', code: 190 } }, 400);
  if (u.pathname === '/refresh_access_token') return json({ access_token: 'IGtokenrenovado0000000000', expires_in: 5184000 });
  if (u.pathname === '/v23.0/me') return json({ user_id: '1789', id: '1789', username: 'maragogilab', account_type: 'BUSINESS', followers_count: 9870 });
  if (u.pathname === '/v23.0/1789/insights') {
    const metricas = u.searchParams.get('metric').split(',');
    if (metricas.includes('profile_views') && metricas.length > 1) return json({ error: { message: 'metric not supported', code: 100 } }, 400);
    if (metricas[0] === 'profile_views') return json({ error: { message: 'metric not supported', code: 100 } }, 400);
    return json({ data: metricas.map((name) => ({ name, total_value: { value: { reach: 1200, views: 4000, total_interactions: 150, profile_links_taps: 9 }[name] } })) });
  }
  if (u.pathname === '/v23.0/1789/media' && (init.method || 'GET') === 'GET') {
    return json({ data: [
      { id: 'm1', caption: 'Drone na praia\n#maragogi', media_type: 'IMAGE', media_product_type: 'FEED', permalink: 'https://instagram.com/p/m1', timestamp: '2026-10-20T15:00:00+0000', media_url: 'https://cdn.instagram.test/m1.jpg', like_count: 80, comments_count: 5 },
      { id: 'm2', caption: 'Bastidores', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://instagram.com/reel/m2', timestamp: '2026-10-25T22:30:00+0000', thumbnail_url: 'https://cdn.instagram.test/m2.jpg', like_count: 300, comments_count: 20 },
    ] });
  }
  if (/^\/v23\.0\/m\d\/insights$/.test(u.pathname)) {
    const valores = { m1: { reach: 2500, views: 3100, likes: 80, comments: 5, shares: 3, saved: 12 }, m2: { reach: 9000, views: 15000, likes: 300, comments: 20, shares: 40, saved: 60 }, m9: { reach: 10, likes: 1, comments: 0, shares: 0, saved: 0, views: 20 } }[u.pathname.split('/')[2]];
    return json({ data: u.searchParams.get('metric').split(',').map((name) => ({ name, values: [{ value: valores[name] }] })) });
  }
  if (u.pathname === '/v23.0/1789/media' && init.method === 'POST') return json({ id: 'c1' });
  if (u.pathname === '/v23.0/c1') return json({ status_code: 'FINISHED', id: 'c1' });
  if (u.pathname === '/v23.0/1789/media_publish') return json({ id: 'm9' });
  if (u.pathname === '/v23.0/m9') return json({ permalink: 'https://instagram.com/p/m9', id: 'm9' });
  return json({ error: { message: `rota inesperada ${u.pathname}`, code: 1 } }, 404);
}

before(async () => {
  const db = abrir(':memory:');
  garantirAdmin(db, { email: 'admin@teste.com', senha: 'senha-forte-1' });
  app = criarApp(db, { log: false, fetchInstagram: instagramFalso });
  servidor = http.createServer(app);
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
  await api('POST', '/api/login', { email: 'admin@teste.com', senha: 'senha-forte-1' });
});

after(() => servidor.close());

test('conectar puxa números e importa posts com resultados', async () => {
  const perfil = (await api('POST', '/api/perfis', { rede: 'instagram', usuario: '@x' })).dados;
  assert.equal(perfil.conectado, false);
  assert.equal(perfil.token, undefined, 'token nunca vai para o navegador');

  assert.equal((await api('POST', `/api/perfis/${perfil.id}/instagram`, { token: 'curto' })).status, 400);
  const r = await api('POST', `/api/perfis/${perfil.id}/instagram`, { token: 'IGtokenoriginal000000000', url_publica: 'https://erp.exemplo.com' });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.equal(r.dados.conectado, true);
  assert.equal(r.dados.usuario, '@maragogilab');
  assert.equal(r.dados.token, undefined);
  assert.equal(r.dados.sincronizacao.dias, 30);
  assert.equal(r.dados.sincronizacao.novos, 2);
  // Usa o token renovado nas chamadas seguintes.
  assert.equal(chamadas.filter((c) => c.caminho === '/v23.0/1789/media').at(-1).query.access_token, 'IGtokenrenovado0000000000');

  const painel = (await api('GET', `/api/perfis/${perfil.id}/painel?dias=30`)).dados;
  assert.equal(painel.atual.seguidores, 9870);
  assert.equal(painel.atual.alcance, 1200 * 29, 'ontem até 29 dias atrás dentro do período');
  assert.equal(painel.atual.cliques, 9 * 29);
  assert.equal(painel.atual.visitas, null, 'métrica não suportada fica vazia sem quebrar');

  const posts = (await api('GET', '/api/posts?status=publicado')).dados;
  const reel = posts.find((p) => p.titulo === 'Bastidores');
  assert.equal(reel.formato, 'reels');
  assert.equal(reel.tem_imagem, true);
  assert.equal(reel.data, '2026-10-25');
  assert.equal(reel.hora, '19:30', 'horário convertido para o fuso de Maceió');
  assert.equal(posts.find((p) => p.titulo === 'Drone na praia').link, 'https://instagram.com/p/m1');
  const det = (await api('GET', `/api/posts/${reel.id}`)).dados;
  assert.equal(det.metricas[0].alcance, 9000);
  assert.equal(det.metricas[0].salvos, 60);

  // Sincronizar de novo não duplica.
  const s2 = await api('POST', `/api/perfis/${perfil.id}/sincronizar`);
  assert.equal(s2.dados.sincronizacao.novos, 0);
  assert.equal((await api('GET', '/api/posts?status=publicado')).dados.length, 2);
});

test('publica sozinho o post agendado quando chega a hora', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const jpg = `data:image/jpeg;base64,${JPG.toString('base64')}`;
  const agora = agoraLocal();
  const ontem = somarDias(hoje(), -1);
  const p = (await api('POST', '/api/posts', {
    titulo: 'Promo', formato: 'post', status: 'agendado', redes: ['instagram'], data: ontem, hora: '10:00', publicar_auto: true,
    legenda: 'Legenda geral', legendas_rede: { instagram: 'Legenda só do Insta' },
  })).dados;
  assert.equal(p.publicar_auto, true);
  assert.match(p.instagram_impedimento, /imagem/);

  await api('PUT', `/api/posts/${p.id}/imagem`, { arquivo: png });
  assert.match((await api('GET', `/api/posts/${p.id}`)).dados.instagram_impedimento, /JPG/);
  await api('PUT', `/api/posts/${p.id}/imagem`, { arquivo: jpg });
  assert.equal((await api('GET', `/api/posts/${p.id}`)).dados.instagram_impedimento, null);

  // Post futuro não sai antes da hora.
  const futuro = (await api('POST', '/api/posts', { titulo: 'Depois', status: 'agendado', redes: ['instagram'], data: somarDias(hoje(), 2), publicar_auto: true })).dados;

  const r = await app.instagram.executar();
  assert.equal(r.publicados, 1);
  const criar = chamadas.find((c) => c.metodo === 'POST' && c.caminho === '/v23.0/1789/media');
  assert.equal(criar.corpo.caption, 'Legenda só do Insta');
  const m = /^https:\/\/erp\.exemplo\.com\/api\/publico\/posts\/(\d+)\/([0-9a-f]+)\.jpg$/.exec(criar.corpo.image_url);
  assert.ok(m, criar.corpo.image_url);
  assert.ok(chamadas.some((c) => c.caminho === '/v23.0/1789/media_publish' && c.corpo.creation_id === 'c1'));

  // A imagem pública abre sem login só com o segredo certo.
  const semLogin = await fetch(`${base}/api/publico/posts/${m[1]}/${m[2]}.jpg`);
  assert.equal(semLogin.status, 200);
  assert.equal(semLogin.headers.get('content-type'), 'image/jpeg');
  assert.equal((await fetch(`${base}/api/publico/posts/${m[1]}/${'0'.repeat(m[2].length)}.jpg`)).status, 404);

  const depois = (await api('GET', `/api/posts/${p.id}`)).dados;
  assert.equal(depois.status, 'publicado');
  assert.equal(depois.ig_media_id, 'm9');
  assert.equal(depois.link, 'https://instagram.com/p/m9');
  assert.equal((await api('GET', `/api/posts/${futuro.id}`)).dados.status, 'agendado');
  assert.ok(agora.length === 16);

  // Não publica duas vezes.
  assert.equal((await api('POST', `/api/posts/${p.id}/publicar`)).status, 400);
});

test('token vencido vira aviso no perfil', async () => {
  const perfil = (await api('POST', '/api/perfis', { rede: 'instagram', usuario: '@cliente' })).dados;
  const r = await api('POST', `/api/perfis/${perfil.id}/instagram`, { token: 'IGtokenvencido00000000000' });
  assert.equal(r.status, 400);
  assert.match(r.dados.erro, /expirou/);
});
