#!/usr/bin/env node
// Renderiza artes feitas em HTML/SVG para PNG, JPG ou PDF no tamanho exato.
//
// Uso:
//   node render.js <arquivo.html|.svg> <pasta-saida> [--formato png|jpg] [--pdf]
//                  [--seletor .arte] [--escala 1] [--preview]
//
// Cada elemento que casar com o seletor (padrão ".arte") vira um arquivo:
// <nome>-01.png, <nome>-02.png ... Sem elementos ".arte", a página inteira é
// capturada. --pdf gera um único PDF com uma página por arte (carrossel do
// LinkedIn, impressão). --preview também salva miniaturas a 25% para conferir
// a legibilidade no celular.
//
// Requer Playwright com Chromium (npm i -D playwright && npx playwright install chromium).

const path = require('node:path');
const fs = require('node:fs');

function args(argv) {
  const o = { formato: 'png', seletor: '.arte', escala: 1, pdf: false, preview: false, pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--formato') o.formato = argv[++i];
    else if (a === '--seletor') o.seletor = argv[++i];
    else if (a === '--escala') o.escala = Number(argv[++i]);
    else if (a === '--pdf') o.pdf = true;
    else if (a === '--preview') o.preview = true;
    else o.pos.push(a);
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  const [entrada, saida = 'saida'] = o.pos;
  if (!entrada) {
    console.error('Uso: node render.js <arquivo.html|.svg> <pasta-saida> [--formato png|jpg] [--pdf] [--preview]');
    process.exit(1);
  }
  let chromium;
  try { ({ chromium } = require('playwright')); } catch {
    console.error('Playwright não encontrado. Instale com: npm i -D playwright && npx playwright install chromium');
    process.exit(1);
  }

  const arquivo = path.resolve(entrada);
  const nome = path.basename(arquivo).replace(/\.[^.]+$/, '');
  fs.mkdirSync(saida, { recursive: true });

  const browser = await chromium.launch();
  const abrir = async (escala) => {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: escala });
    await page.goto('file://' + arquivo, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    return page;
  };

  const page = await abrir(o.escala);
  const artes = await page.$$(o.seletor);
  const gerados = [];

  if (o.pdf) {
    const box = artes.length ? await artes[0].boundingBox() : await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
    const w = +box.width.toFixed(3), h = +box.height.toFixed(3);
    await page.addStyleTag({ content:
      `@page{size:${w}px ${h}px;margin:0} html,body{background:none!important;margin:0!important;padding:0!important}
       ${o.seletor}{break-after:page;margin:0!important}` });
    const destino = path.join(saida, `${nome}.pdf`);
    await page.pdf({ path: destino, width: `${w}px`, height: `${h}px`, printBackground: true, preferCSSPageSize: true });
    gerados.push(destino);
  } else {
    const ext = o.formato === 'jpg' || o.formato === 'jpeg' ? 'jpg' : 'png';
    const opts = ext === 'jpg' ? { type: 'jpeg', quality: 92 } : { type: 'png' };
    const alvos = artes.length ? artes : [null];
    for (let i = 0; i < alvos.length; i++) {
      const sufixo = alvos.length > 1 ? `-${String(i + 1).padStart(2, '0')}` : '';
      const destino = path.join(saida, `${nome}${sufixo}.${ext}`);
      if (alvos[i]) await alvos[i].screenshot({ path: destino, ...opts });
      else await page.screenshot({ path: destino, fullPage: true, ...opts });
      gerados.push(destino);
    }
    if (o.preview) {
      const mini = await abrir(0.25);
      const peq = await mini.$$(o.seletor);
      for (let i = 0; i < peq.length; i++) {
        const destino = path.join(saida, `${nome}-${String(i + 1).padStart(2, '0')}-preview.png`);
        await peq[i].screenshot({ path: destino });
        gerados.push(destino);
      }
    }
  }

  await browser.close();
  for (const g of gerados) console.log(g);
}

main().catch((e) => { console.error(e); process.exit(1); });
