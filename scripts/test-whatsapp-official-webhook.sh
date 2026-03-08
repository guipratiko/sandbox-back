#!/usr/bin/env bash
# Testa o webhook WhatsApp Oficial: GET (verificação) e POST (evento messages).
# Uso:
#   GET:  ./scripts/test-whatsapp-official-webhook.sh get
#   POST: META_APP_SECRET=seu_app_secret ./scripts/test-whatsapp-official-webhook.sh post
#   POST (local): META_APP_SECRET=xxx ./scripts/test-whatsapp-official-webhook.sh post http://localhost:4331

set -e
BASE_URL="${2:-${WEBHOOK_URL:-https://back-sandbox.onlyflow.com.br}}"
# Se a URL não contém /webhook/, acrescenta o path
if [[ "$BASE_URL" != *"/webhook/"* ]]; then
  BASE_URL="${BASE_URL%/}/webhook/whatsapp-official"
fi
WEBHOOK_URL="$BASE_URL"
VERIFY_TOKEN="${VERIFY_TOKEN:-ScKt4j2Op39Psz12e3}"

case "${1:-get}" in
  get)
    echo "=== GET (verificação do webhook) ==="
    curl -s -i "${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=test_challenge_123"
    echo ""
    ;;
  post)
    if [ -z "$META_APP_SECRET" ]; then
      echo "Para POST, defina META_APP_SECRET (ex: export META_APP_SECRET=seu_app_secret)"
      exit 1
    fi
    # Payload mínimo estilo Meta com evento "messages"
    BODY='{"object":"whatsapp_business_account","entry":[{"id":"1025584987296396","time":1734567890,"changes":[{"value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"15550000000","phone_number_id":"123456789"},"contacts":[{"profile":{"name":"Teste"},"wa_id":"5511999999999"}],"messages":[{"from":"5511999999999","id":"wamid.test123","timestamp":"1734567890","type":"text","text":{"body":"ola"}}]},"field":"messages"}]}]}'
    SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$META_APP_SECRET" -binary | xxd -p -c 256)
    echo "=== POST (evento messages) ==="
    echo "Body (resumo): object=whatsapp_business_account, field=messages"
    curl -s -i -X POST "$WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -H "x-hub-signature-256: sha256=$SIG" \
      -d "$BODY"
    echo ""
    ;;
  *)
    echo "Uso: $0 get | post"
    echo "  get  - verificação (hub.mode=subscribe)"
    echo "  post - envia evento messages (requer META_APP_SECRET)"
    exit 1
    ;;
esac
