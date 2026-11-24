#!/bin/bash
# Liga o WhatsApp da agência ao ERP neste Mac (n8n + Evolution API, via Docker Desktop).
# Novo contato no WhatsApp vira lead no ERP, com tarefa para responder e boas-vindas automáticas.
#
# Para instalar ou atualizar, cole no Terminal:
#   curl -fsSL https://raw.githubusercontent.com/maragogilab-rgb/RA/HEAD/mac/instalar-whatsapp.sh | bash
#
# Funciona enquanto o Mac estiver ligado (e com o Docker aberto).
# Guia e detalhes: automacao/WHATSAPP-N8N.md

set -euo pipefail

PASTA="$HOME/WhatsApp-Maragogi-Lab"
PASTA_ERP="$HOME/ERP-Maragogi-Lab"
PORTA_ERP=3737
REPO="https://raw.githubusercontent.com/maragogilab-rgb/RA/HEAD"
CODIGO="https://github.com/maragogilab-rgb/RA/archive/HEAD.tar.gz"
INSTANCIA="maragogi"
NOME_FLUXO="WhatsApp → lead no ERP + boas-vindas"

titulo() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
aviso() { printf '\033[1;33m%s\033[0m\n' "$1"; }
falha() { printf '\n\033[1;31mErro: %s\033[0m\n' "$1"; exit 1; }
aleatorio() { openssl rand -hex 24; }

# MARAGOGI_TESTE=1 permite testar o script fora do Mac (usado no desenvolvimento).
TESTE="${MARAGOGI_TESTE:-}"
[ -n "$TESTE" ] || [ "$(uname)" = "Darwin" ] || falha "este instalador é para Mac."
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1. Docker Desktop (é ele que roda o n8n e o WhatsApp).
titulo "Verificando o Docker…"
export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin"
if ! command -v docker >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "Instalando o Docker Desktop pelo Homebrew (pode pedir a senha do Mac)…"
    brew install --cask docker </dev/tty || falha "não consegui instalar o Docker Desktop."
  else
    aviso "Falta o Docker Desktop. Vou abrir a página de download:"
    echo "  1. Baixe a versão para o seu Mac (Apple Silicon/M1-M4 ou Intel) e instale."
    echo "  2. Abra o Docker uma vez e aceite os termos."
    echo "  3. Rode este mesmo comando de novo."
    open "https://www.docker.com/products/docker-desktop/" 2>/dev/null || true
    exit 1
  fi
fi
if ! docker info >/dev/null 2>&1; then
  [ -n "$TESTE" ] || open -a Docker 2>/dev/null || true
  echo "Esperando o Docker ligar (na primeira vez ele pode pedir para aceitar os termos)…"
  for _ in $(seq 1 90); do docker info >/dev/null 2>&1 && break; sleep 2; done
  docker info >/dev/null 2>&1 || falha "o Docker não ligou. Abra o app Docker, espere ficar verde e rode o comando de novo."
fi

# 2. ERP atualizado e com a integração ligada (sem mexer nos seus dados).
ERP_URL="${ERP_URL:-}"
if [ -z "$ERP_URL" ]; then
  titulo "Atualizando o ERP e ligando a integração…"
  if [ -z "$TESTE" ]; then
    curl -fsSL "$REPO/mac/instalar.sh" -o "$TMP/instalar-erp.sh" || falha "não consegui baixar o instalador do ERP."
    ERP_NAO_ABRIR=1 bash "$TMP/instalar-erp.sh"
  fi
  [ -s "$PASTA_ERP/dados/integracao.token" ] || falha "não encontrei o token da integração do ERP."
  ERP_TOKEN=$(cat "$PASTA_ERP/dados/integracao.token")
  ERP_URL="http://host.docker.internal:$PORTA_ERP"
else
  # ERP em outro lugar (ex.: Railway): informe ERP_URL e ERP_INTEGRACAO_TOKEN ao rodar.
  ERP_TOKEN="${ERP_INTEGRACAO_TOKEN:?defina ERP_INTEGRACAO_TOKEN com o mesmo valor do ERP}"
fi

# 3. Arquivos do n8n e do WhatsApp.
titulo "Baixando os arquivos da automação…"
mkdir -p "$PASTA"
if [ -n "${MARAGOGI_ORIGEM:-}" ]; then
  cp "$MARAGOGI_ORIGEM"/{docker-compose.yml,fluxo-whatsapp-lead.json,configurar-whatsapp.sh,WHATSAPP-N8N.md} "$PASTA/"
else
  curl -fsSL "$CODIGO" -o "$TMP/codigo.tar.gz" || falha "não consegui baixar do GitHub."
  mkdir -p "$TMP/codigo" && tar -xzf "$TMP/codigo.tar.gz" -C "$TMP/codigo" --strip-components 1
  cp "$TMP/codigo/automacao"/{docker-compose.yml,fluxo-whatsapp-lead.json,configurar-whatsapp.sh,WHATSAPP-N8N.md} "$PASTA/"
fi
chmod +x "$PASTA/configurar-whatsapp.sh"

# Senhas: criadas uma vez e mantidas nas atualizações.
ENV="$PASTA/.env"
if [ ! -f "$ENV" ]; then
  cat >"$ENV" <<EOF
# Gerado por instalar-whatsapp.sh. Não compartilhe este arquivo.
ERP_URL=$ERP_URL
ERP_INTEGRACAO_TOKEN=$ERP_TOKEN
EVOLUTION_APIKEY=$(aleatorio)
EVOLUTION_URL_PUBLICA=http://localhost:8080
WEBHOOK_TOKEN=$(aleatorio)
POSTGRES_SENHA=$(aleatorio)
N8N_HOST=localhost
N8N_URL=http://localhost:5678
N8N_SECURE_COOKIE=false
MENSAGEM_BOAS_VINDAS=
EOF
  chmod 600 "$ENV"
else
  # Mantém as senhas, mas acompanha o endereço e o token do ERP.
  sed -i.bak -e "s|^ERP_URL=.*|ERP_URL=$ERP_URL|" -e "s|^ERP_INTEGRACAO_TOKEN=.*|ERP_INTEGRACAO_TOKEN=$ERP_TOKEN|" "$ENV" && rm -f "$ENV.bak"
fi
# shellcheck disable=SC1090
set -a; . "$ENV"; set +a

# 4. Liga tudo.
titulo "Ligando o n8n e o WhatsApp (na primeira vez baixa ~4 GB, pode demorar)…"
cd "$PASTA"
docker compose up -d --quiet-pull 2>&1 | grep -v "^ *$" | tail -5
echo "Esperando o n8n responder…"
for _ in $(seq 1 90); do curl -fs http://localhost:5678/healthz >/dev/null 2>&1 && break; sleep 2; done
curl -fs http://localhost:5678/healthz >/dev/null 2>&1 || falha "o n8n não ligou. Rode: cd $PASTA && docker compose logs n8n"
for _ in $(seq 1 60); do curl -fs http://localhost:8080 >/dev/null 2>&1 && break; sleep 2; done
curl -fs http://localhost:8080 >/dev/null 2>&1 || falha "o Evolution API não ligou. Rode: cd $PASTA && docker compose logs evolution"

# 5. Fluxo do n8n: importa uma vez e publica.
titulo "Instalando o fluxo no n8n…"
n8n() { docker compose exec -T n8n n8n "$@" 2>&1 | grep -v "telemetry\|getaddrinfo\|onlookup" || true; }
ID=$(n8n list:workflow | grep -F "|$NOME_FLUXO" | head -1 | cut -d'|' -f1 || true)
if [ -z "$ID" ]; then
  docker compose cp fluxo-whatsapp-lead.json n8n:/tmp/fluxo.json >/dev/null 2>&1
  n8n import:workflow --input=/tmp/fluxo.json >/dev/null
  ID=$(n8n list:workflow | grep -F "|$NOME_FLUXO" | head -1 | cut -d'|' -f1 || true)
  [ -n "$ID" ] || falha "não consegui importar o fluxo no n8n."
  n8n publish:workflow --id="$ID" >/dev/null
  docker compose restart n8n >/dev/null 2>&1
  for _ in $(seq 1 60); do curl -fs http://localhost:5678/healthz >/dev/null 2>&1 && break; sleep 2; done
  echo "Fluxo instalado e ligado."
else
  echo "O fluxo já estava instalado."
fi

# 6. WhatsApp: instância e webhook.
titulo "Preparando o WhatsApp…"
./configurar-whatsapp.sh "$INSTANCIA" >/dev/null
ESTADO=$(curl -fs "http://localhost:8080/instance/connectionState/$INSTANCIA" -H "apikey: $EVOLUTION_APIKEY" || true)

if printf '%s' "$ESTADO" | grep -q '"state":"open"'; then
  titulo "Pronto! O WhatsApp já está conectado e a automação está ligada."
else
  # Página com o QR Code, que se atualiza sozinha.
  QR="$PASTA/conectar-whatsapp.html"
  cat >"$QR" <<HTML
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Conectar WhatsApp</title>
<style>body{font-family:-apple-system,sans-serif;text-align:center;padding:32px;background:#f6f7f9;color:#111}
img{width:320px;height:320px;background:#fff;padding:12px;border-radius:12px}p{max-width:460px;margin:12px auto;line-height:1.5}</style></head>
<body><h1>Conectar o WhatsApp da Maragogi Lab</h1>
<p>No celular: <b>WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho</b> e aponte para o código.</p>
<img id="qr" alt="Carregando o QR Code…"><p id="st">Carregando…</p>
<script>
const H={apikey:'$EVOLUTION_APIKEY'};let tentativas=0;
async function tick(){
  try{
    const e=await (await fetch('http://localhost:8080/instance/connectionState/$INSTANCIA',{headers:H})).json();
    if((e.instance||{}).state==='open'){document.body.innerHTML='<h1>✅ WhatsApp conectado!</h1><p>Pode fechar esta página. Novos contatos vão aparecer como leads no ERP.</p>';return;}
    const r=await (await fetch('http://localhost:8080/instance/connect/$INSTANCIA',{headers:H})).json();
    if(r.base64){document.getElementById('qr').src=r.base64;document.getElementById('st').textContent='O código muda a cada poucos segundos. É normal.';}
    else if(++tentativas>=4){document.getElementById('st').innerHTML='O código está demorando. Plano B: abra <a href="http://localhost:8080/manager" target="_blank">localhost:8080/manager</a>, entre com a chave <code>$EVOLUTION_APIKEY</code>, clique em <b>$INSTANCIA</b> e depois em <b>Get QR Code</b>.';}
  }catch(err){document.getElementById('st').textContent='Esperando o WhatsApp responder…';}
  setTimeout(tick,15000);
}
tick();
</script></body></html>
HTML
  chmod 600 "$QR"
  titulo "Falta só ler o QR Code com o celular da agência"
  echo "Abrindo a página do QR Code no navegador…"
  [ -n "$TESTE" ] || open "$QR" 2>/dev/null || echo "Abra no navegador: $QR"
fi

echo
echo "Painéis (só neste Mac):"
echo "  n8n (automações):  http://localhost:5678   (no primeiro acesso, crie seu usuário)"
echo "  WhatsApp (Evolution): http://localhost:8080/manager   (chave: veja EVOLUTION_APIKEY em $ENV)"
echo
echo "Importante: deixe o Docker abrindo junto com o Mac"
echo "(Docker → Settings → General → Start Docker Desktop when you sign in)."
