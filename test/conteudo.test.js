'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { abrir } = require('../src/db');
const { garantirAdmin } = require('../src/auth');
const { criarApp } = require('../src/app');
const { hoje, somarDias } = require('../src/validar');

let servidor;
let base;
let cookie = '';

async function api(metodo, caminho, corpo) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(base + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const texto = await r.text();
  let dados = texto;
  try { dados = texto ? JSON.parse(texto) : null; } catch { /* resposta binária */ }
  return { status: r.status, dados, tipo: r.headers.get('content-type') };
}

before(async () => {
  const db = abrir(':memory:');
  garantirAdmin(db, { email: 'admin@teste.com', senha: 'senha-forte-1' });
  servidor = http.createServer(criarApp(db, { log: false }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
  await api('POST', '/api/login', { email: 'admin@teste.com', senha: 'senha-forte-1' });
});

after(() => servidor.close());

test('posts: criar, mover no quadro, imagem e validações', async () => {
  const cli = await api('POST', '/api/clientes', { nome: 'Cafeteria Maré', tipo_pessoa: 'PF' });
  assert.equal(cli.status, 201, JSON.stringify(cli.dados));

  const r = await api('POST', '/api/posts', {
    titulo: 'Reels bastidores', cliente_id: cli.dados.id, formato: 'reels', redes: ['instagram', 'tiktok'],
    legenda: 'Legenda principal', legendas_rede: { tiktok: 'Legenda do TikTok' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.dados.status, 'ideia');
  assert.deepEqual(r.dados.redes, ['instagram', 'tiktok']);
  assert.equal(r.dados.legendas_rede.tiktok, 'Legenda do TikTok');
  const id = r.dados.id;

  assert.equal((await api('POST', '/api/posts', { titulo: 'x', redes: ['orkut'] })).status, 400);
  assert.equal((await api('POST', '/api/posts', { titulo: 'x', status: 'agendado' })).status, 400, 'agendar exige data');
  assert.equal((await api('POST', `/api/posts/${id}/mover`, { status: 'agendado' })).status, 400);

  const mov = await api('POST', `/api/posts/${id}/mover`, { status: 'aprovacao', ordem: 0.5 });
  assert.equal(mov.dados.status, 'aprovacao');
  assert.equal(mov.dados.ordem, 0.5);

  // Imagem: 1x1 PNG.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.equal((await api('PUT', `/api/posts/${id}/imagem`, { arquivo: 'data:text/html;base64,PGI+' })).status, 400);
  const im = await api('PUT', `/api/posts/${id}/imagem`, { arquivo: png });
  assert.equal(im.dados.tem_imagem, true);
  const img = await api('GET', `/api/posts/${id}/imagem`);
  assert.equal(img.status, 200);
  assert.equal(img.tipo, 'image/png');

  // Agendado para hoje vira lembrete no painel.
  const hj = hoje();
  await api('PUT', `/api/posts/${id}`, { ...r.dados, status: 'agendado', data: hj, hora: '18:30' });
  const painel = await api('GET', '/api/dashboard');
  assert.ok(painel.dados.lembretes.some((l) => l.tipo === 'post' && l.link === `#/conteudo/${id}`), 'lembrete do post');

  const lista = await api('GET', `/api/posts?quadro=1&cliente_id=${cli.dados.id}`);
  assert.equal(lista.dados.length, 1);
  assert.equal(lista.dados[0].cliente_nome, 'Cafeteria Maré');

  const dup = await api('POST', `/api/posts/${id}/duplicar`);
  assert.equal(dup.dados.status, 'ideia');
  assert.equal(dup.dados.data, null);
  assert.equal((await api('DELETE', `/api/posts/${dup.dados.id}`)).status, 204);
});

test('resultados: perfil, números e melhores posts', async () => {
  const hj = hoje();
  const perfil = await api('POST', '/api/perfis', { rede: 'instagram', usuario: '@maragogilab' });
  assert.equal(perfil.status, 201);
  const pid = perfil.dados.id;

  assert.equal((await api('POST', `/api/perfis/${pid}/numeros`, { data: hj })).status, 400, 'exige algum número');
  await api('POST', `/api/perfis/${pid}/numeros`, { data: somarDias(hj, -40), seguidores: 1000, alcance: 5000 });
  await api('POST', `/api/perfis/${pid}/numeros`, { data: somarDias(hj, -10), seguidores: 1100, alcance: 3000 });
  await api('POST', `/api/perfis/${pid}/numeros`, { data: hj, seguidores: 1200, alcance: 4000, visitas: 50 });
  // Lançar de novo na mesma data substitui.
  await api('POST', `/api/perfis/${pid}/numeros`, { data: hj, seguidores: 1250, alcance: 4000, visitas: 50 });

  const p1 = await api('POST', '/api/posts', { titulo: 'Post A', redes: ['instagram'], status: 'publicado', data: somarDias(hj, -3) });
  const p2 = await api('POST', '/api/posts', { titulo: 'Post B', redes: ['instagram'], status: 'publicado', data: somarDias(hj, -2) });
  await api('PUT', `/api/posts/${p1.dados.id}/metricas`, { metricas: [{ rede: 'instagram', alcance: 900, curtidas: 10, comentarios: 2 }] });
  await api('PUT', `/api/posts/${p2.dados.id}/metricas`, { metricas: [{ rede: 'instagram', alcance: 300, curtidas: 80, salvos: 20 }] });
  assert.equal((await api('PUT', `/api/posts/${p1.dados.id}/metricas`, { metricas: [{ rede: 'instagram', curtidas: -1 }] })).status, 400);

  const d = (await api('GET', `/api/perfis/${pid}/painel?dias=30`)).dados;
  assert.equal(d.atual.seguidores, 1250);
  assert.equal(d.anterior.seguidores, 1000);
  assert.equal(d.atual.alcance, 7000);
  assert.equal(d.anterior.alcance, 5000);
  assert.equal(d.serie.length, 2);
  assert.equal(d.posts.length, 2);
  const b = d.posts.find((p) => p.titulo === 'Post B');
  assert.equal(b.interacoes, 100);

  const lista = (await api('GET', '/api/perfis')).dados;
  assert.equal(lista[0].seguidores, 1250);
  assert.equal(lista[0].atualizado_em, hj);
});
