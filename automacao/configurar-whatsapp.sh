#!/usr/bin/env bash
# Cria a instância do WhatsApp no Evolution API e liga o webhook para o n8n.
# Uso: ./configurar-whatsapp.sh [nome-da-instancia]
# Lê EVOLUTION_APIKEY, EVOLUTION_URL_PUBLICA, N8N_URL e WEBHOOK_TOKEN do arquivo .env ao lado.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Crie o arquivo .env a partir do .env.example primeiro."; exit 1; }
set -a; . ./.env; set +a

INSTANCIA="${1:-maragogi}"
EVO="${EVOLUTION_URL_PUBLICA%/}"
# Dentro do docker compose o Evolution chega no n8n pelo nome do serviço.
URL_WEBHOOK="${WEBHOOK_N8N:-http://n8n:5678/webhook/whatsapp-evolution}"

echo "1/2 Criando a instância '$INSTANCIA'..."
curl -sS -X POST "$EVO/instance/create" -H "apikey: $EVOLUTION_APIKEY" -H 'Content-Type: application/json' \
  -d "{\"instanceName\":\"$INSTANCIA\",\"integration\":\"WHATSAPP-BAILEYS\",\"qrcode\":true}" > /dev/null \
  || echo "   (a instância talvez já exista; seguindo)"

echo "2/2 Ligando o webhook em $URL_WEBHOOK..."
curl -sS -f -X POST "$EVO/webhook/set/$INSTANCIA" -H "apikey: $EVOLUTION_APIKEY" -H 'Content-Type: application/json' \
  -d "{\"webhook\":{\"enabled\":true,\"url\":\"$URL_WEBHOOK\",\"headers\":{\"x-webhook-token\":\"$WEBHOOK_TOKEN\"},\"byEvents\":false,\"base64\":false,\"events\":[\"MESSAGES_UPSERT\"]}}" > /dev/null

echo
echo "Pronto. Agora abra $EVO/manager, entre com a EVOLUTION_APIKEY,"
echo "clique na instância '$INSTANCIA' e leia o QR Code com o WhatsApp da agência"
echo "(WhatsApp > Aparelhos conectados > Conectar um aparelho)."
