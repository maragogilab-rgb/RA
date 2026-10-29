#!/bin/bash
# Instala (ou atualiza) o ERP Maragogi Lab neste Mac.
# O sistema roda só neste computador (ninguém de fora acessa), mas usa a internet
# para enviar as notas fiscais (Focus NFe) e buscar endereços pelo CEP.
#
# Para instalar ou atualizar, cole no Terminal:
#   curl -fsSL https://raw.githubusercontent.com/maragogilab-rgb/RA/HEAD/mac/instalar.sh | bash
#
# Seus dados ficam em ~/ERP-Maragogi-Lab/dados e são mantidos nas atualizações.

set -euo pipefail

PASTA="$HOME/ERP-Maragogi-Lab"
PORTA=3737
CODIGO="https://github.com/maragogilab-rgb/RA/archive/HEAD.tar.gz"
ROTULO="com.maragogilab.erp"
NOME_APP="ERP Maragogi Lab"

titulo() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
falha() { printf '\n\033[1;31mErro: %s\033[0m\n' "$1"; exit 1; }

[ "$(uname)" = "Darwin" ] || falha "este instalador é para Mac."
mkdir -p "$PASTA/dados"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1. Node.js próprio do ERP (fica dentro da pasta, não mexe no resto do Mac).
NODE="$PASTA/node/bin/node"
if [ ! -x "$NODE" ] || ! "$NODE" -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" 2>/dev/null; then
  titulo "Baixando o Node.js (motor do sistema)…"
  case "$(uname -m)" in arm64) ARQ=arm64 ;; *) ARQ=x64 ;; esac
  BASE="https://nodejs.org/dist/latest-v22.x"
  curl -fsSL "$BASE/SHASUMS256.txt" -o "$TMP/sums" || falha "sem conexão com nodejs.org. Verifique a internet."
  ARQUIVO=$(awk '{print $2}' "$TMP/sums" | grep "darwin-$ARQ.tar.gz$" | head -1)
  [ -n "$ARQUIVO" ] || falha "não encontrei o Node.js para este Mac."
  curl -fL --progress-bar "$BASE/$ARQUIVO" -o "$TMP/node.tar.gz"
  ESPERADO=$(grep " $ARQUIVO\$" "$TMP/sums" | awk '{print $1}')
  [ "$(shasum -a 256 "$TMP/node.tar.gz" | awk '{print $1}')" = "$ESPERADO" ] || falha "o download do Node.js veio corrompido. Tente de novo."
  rm -rf "$PASTA/node" && mkdir -p "$PASTA/node"
  tar -xzf "$TMP/node.tar.gz" -C "$PASTA/node" --strip-components 1
fi

# 2. Código do ERP (sempre a versão mais nova).
titulo "Baixando o ERP…"
curl -fsSL "$CODIGO" -o "$TMP/erp.tar.gz" || falha "não consegui baixar o ERP do GitHub. Se o repositório estiver privado, deixe-o público ou peça ajuda."
mkdir -p "$TMP/erp"
tar -xzf "$TMP/erp.tar.gz" -C "$TMP/erp" --strip-components 1
[ -f "$TMP/erp/server.js" ] || falha "o pacote do ERP veio incompleto."
rm -rf "$PASTA/app.antigo"
[ -d "$PASTA/app" ] && mv "$PASTA/app" "$PASTA/app.antigo"
mv "$TMP/erp" "$PASTA/app"
rm -rf "$PASTA/app.antigo"

# 3. Primeiro acesso: e-mail e senha para entrar.
if [ ! -f "$PASTA/dados/erp.db" ]; then
  titulo "Vamos criar o seu acesso ao ERP"
  printf 'Seu e-mail [maragogilab@gmail.com]: '
  read -r EMAIL </dev/tty || true
  EMAIL=${EMAIL:-maragogilab@gmail.com}
  printf 'Seu nome [Administrador]: '
  read -r NOME </dev/tty || true
  NOME=${NOME:-Administrador}
  while true; do
    printf 'Crie uma senha (mínimo 8 caracteres; ela não aparece enquanto você digita): '
    read -rs SENHA </dev/tty; echo
    printf 'Repita a senha: '
    read -rs SENHA2 </dev/tty; echo
    if [ "${#SENHA}" -lt 8 ]; then echo "A senha precisa ter pelo menos 8 caracteres."; continue; fi
    if [ "$SENHA" != "$SENHA2" ]; then echo "As senhas não conferem. Vamos de novo."; continue; fi
    break
  done
  ERP_DB="$PASTA/dados/erp.db" ERP_ADMIN_EMAIL="$EMAIL" ERP_ADMIN_SENHA="$SENHA" ERP_ADMIN_NOME="$NOME" \
    "$NODE" --disable-warning=ExperimentalWarning "$PASTA/app/scripts/criar-acesso.js"
  unset SENHA SENHA2
fi

# 4. Deixa o ERP ligado em segundo plano sempre que o Mac estiver ligado
#    (assim as notas automáticas continuam saindo mesmo com a janela fechada).
titulo "Ligando o ERP…"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ROTULO</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--disable-warning=ExperimentalWarning</string>
    <string>$PASTA/app/server.js</string>
  </array>
  <key>WorkingDirectory</key><string>$PASTA/app</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ERP_DB</key><string>$PASTA/dados/erp.db</string>
    <key>PORT</key><string>$PORTA</string>
    <key>HOST</key><string>127.0.0.1</string>
    <key>ERP_LOG</key><string>0</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$PASTA/dados/erp.log</string>
  <key>StandardErrorPath</key><string>$PASTA/dados/erp.log</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/$ROTULO" 2>/dev/null || true
sleep 1
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"

# 5. Ícone para abrir: em Aplicativos e na mesa (Mesa/Desktop).
titulo "Criando o ícone na sua mesa…"
DESTINO="/Applications"
[ -w "$DESTINO" ] || { DESTINO="$HOME/Applications"; mkdir -p "$DESTINO"; }
APP="$DESTINO/$NOME_APP.app"
rm -rf "$APP"
cat >"$TMP/abrir.applescript" <<APPLESCRIPT
do shell script "/bin/bash " & quoted form of "$PASTA/app/mac/abrir.sh"
APPLESCRIPT
osacompile -o "$APP" "$TMP/abrir.applescript"
# Usa a logo do sistema como ícone, quando possível.
if [ -f "$PASTA/app/mac/icone.icns" ]; then
  cp "$PASTA/app/mac/icone.icns" "$APP/Contents/Resources/applet.icns"
  touch "$APP"
fi
ATALHO="$HOME/Desktop/$NOME_APP"
rm -f "$ATALHO" "$ATALHO.app"
ln -s "$APP" "$ATALHO.app"

# Espera o sistema responder e abre.
for _ in $(seq 1 40); do
  curl -fs "http://127.0.0.1:$PORTA/api/saude" >/dev/null 2>&1 && break
  sleep 0.5
done
if curl -fs "http://127.0.0.1:$PORTA/api/saude" >/dev/null 2>&1; then
  titulo "Pronto! O ícone \"$NOME_APP\" está na sua mesa."
  echo "Abrindo o ERP agora…"
  /bin/bash "$PASTA/app/mac/abrir.sh" || true
else
  falha "o ERP não ligou. Veja o arquivo $PASTA/dados/erp.log e mande para quem te ajuda."
fi
