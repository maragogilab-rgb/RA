// Página pública de captação: envia o pedido como lead para o ERP.
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const origem = params.get('origem') || params.get('utm_source') || (document.referrer.includes('instagram') ? 'instagram' : 'site');
let empresa = {};

function linkZap(texto) {
  let n = (empresa.telefone || '').replace(/\D/g, '');
  if (!n) return null;
  if (n.length <= 11) n = '55' + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

fetch('/api/publico/empresa').then((r) => r.json()).then((e) => {
  empresa = e;
  if (e.nome) {
    document.title = `Orçamento · ${e.nome}`;
    $('titulo').textContent = `Peça seu orçamento${e.nome ? ' — ' + e.nome : ''}`;
  }
  if (e.logo && /^data:image\//.test(e.logo)) { $('logo').src = e.logo; $('logo').alt = e.nome; $('logo').hidden = false; }
  for (const s of e.servicos || []) $('servicos').append(new Option(s.nome, s.id));
  $('servicos').append(new Option('Outro / não sei ainda', ''));
}).catch(() => {});

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const dados = Object.fromEntries(new FormData(f));
  $('erro').textContent = '';
  if (!dados.nome.trim()) return ($('erro').textContent = 'Informe seu nome.');
  if (dados.telefone.replace(/\D/g, '').length < 10) return ($('erro').textContent = 'Informe o WhatsApp com DDD.');
  $('enviar').disabled = true;
  try {
    const r = await fetch('/api/publico/pedido', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...dados, origem }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Não foi possível enviar.');
    f.hidden = true;
    $('ok').hidden = false;
    const servico = f.servico_id.selectedOptions[0]?.text;
    const zap = linkZap(`Olá! Sou ${dados.nome} e acabei de pedir um orçamento${servico && f.servico_id.value ? ` de ${servico}` : ''}.`);
    if (zap) { $('zap').href = zap; $('zap').hidden = false; }
  } catch (e) {
    $('erro').textContent = e.message;
    $('enviar').disabled = false;
  }
});
