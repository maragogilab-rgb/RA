#!/bin/bash
# Abre o ERP (chamado pelo ícone "ERP Maragogi Lab"). Liga o sistema se ele estiver parado.

URL="http://127.0.0.1:3737"
ROTULO="com.maragogilab.erp"

no_ar() { curl -fs "$URL/api/saude" >/dev/null 2>&1; }

if ! no_ar; then
  launchctl kickstart "gui/$(id -u)/$ROTULO" 2>/dev/null \
    || launchctl load -w "$HOME/Library/LaunchAgents/$ROTULO.plist" 2>/dev/null || true
  for _ in $(seq 1 30); do no_ar && break; sleep 0.5; done
fi

if ! no_ar; then
  osascript -e 'display dialog "O ERP não conseguiu ligar. Rode o instalador de novo ou peça ajuda (arquivo de registro: ERP-Maragogi-Lab/dados/erp.log)." buttons {"OK"} with icon caution with title "ERP Maragogi Lab"' >/dev/null
  exit 1
fi

# Em janela própria (como um aplicativo) se tiver Chrome ou Edge; senão, no navegador padrão.
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -na "Microsoft Edge" --args --app="$URL"
else
  open "$URL"
fi
