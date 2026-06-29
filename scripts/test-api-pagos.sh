#!/usr/bin/env bash
# =============================================================================
# Test end-to-end de los 3 metodos de la API publica de cobranza.
# Simula ser un partner externo (Pago Express / Bancard / etc.).
#
# Uso:
#   1. Edita BASE_URL, API_KEY, NUMERO_VENTA y CI abajo.
#   2. chmod +x scripts/test-api-pagos.sh
#   3. ./scripts/test-api-pagos.sh
# =============================================================================

# -- CONFIG -------------------------------------------------------------------
BASE_URL="${BASE_URL:-https://greenland.neura.com.py}"
API_KEY="${API_KEY:-CAMBIA_ESTO_POR_TU_KEY}"           # = EXTERNAL_PAYMENT_API_KEY en Coolify
PARTNER_ID="${PARTNER_ID:-pago-express-test}"
CI="${CI:-1234567}"                                     # CI de un cliente que tiene cuotas
NUMERO_VENTA="${NUMERO_VENTA:-VTA-TEST-002}"            # numero exacto de una cuota pendiente
MONTO="${MONTO:-1500000}"
TX_ID="${TX_ID:-TEST-$(date +%s)}"                      # unico por ejecucion

# -- HELPERS ------------------------------------------------------------------
GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"; RESET="\033[0m"; BOLD="\033[1m"
hr() { printf "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"; }
say() { printf "${YELLOW}▸${RESET} ${BOLD}%s${RESET}\n" "$1"; }

# -- 1) CONSULTA DE DEUDAS ----------------------------------------------------
hr
say "1) Consulta de deudas — GET /api/public/mis-pagos?ci=${CI}"
hr
curl -s "${BASE_URL}/api/public/mis-pagos?ci=${CI}" | jq .
echo

# -- 2) PAGO ------------------------------------------------------------------
hr
say "2) Aplicar pago — POST /api/public/pagos"
echo "    transaccion_id: ${TX_ID}"
echo "    numero_venta:   ${NUMERO_VENTA}"
echo "    monto:          ${MONTO}"
hr
PAGO_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/public/pagos" \
  -H "X-Api-Key: ${API_KEY}" \
  -H "X-Partner-Id: ${PARTNER_ID}" \
  -H "Content-Type: application/json" \
  -d "{
    \"transaccion_id\": \"${TX_ID}\",
    \"numero_venta\":   \"${NUMERO_VENTA}\",
    \"monto\":          ${MONTO},
    \"moneda\":         \"GS\",
    \"metodo\":         \"transferencia\",
    \"referencia\":     \"Pago de prueba ${TX_ID}\"
  }")
echo "$PAGO_RESPONSE" | jq .
echo

# -- 2b) PAGO IDEMPOTENTE (mismo tx_id) ---------------------------------------
hr
say "2b) Reintentar mismo pago (idempotencia)"
hr
curl -s -X POST "${BASE_URL}/api/public/pagos" \
  -H "X-Api-Key: ${API_KEY}" \
  -H "X-Partner-Id: ${PARTNER_ID}" \
  -H "Content-Type: application/json" \
  -d "{
    \"transaccion_id\": \"${TX_ID}\",
    \"numero_venta\":   \"${NUMERO_VENTA}\",
    \"monto\":          ${MONTO}
  }" | jq .
echo

# -- 3) REVERSA ---------------------------------------------------------------
hr
say "3) Reversar pago — POST /api/public/pagos/reversa"
hr
curl -s -X POST "${BASE_URL}/api/public/pagos/reversa" \
  -H "X-Api-Key: ${API_KEY}" \
  -H "X-Partner-Id: ${PARTNER_ID}" \
  -H "Content-Type: application/json" \
  -d "{\"transaccion_id\": \"${TX_ID}\"}" | jq .
echo

# -- 4) CONSULTA POST-REVERSA -------------------------------------------------
hr
say "4) Consulta post-reversa — la cuota deberia volver a estar pendiente"
hr
curl -s "${BASE_URL}/api/public/mis-pagos?ci=${CI}" | jq '.data.cuotas[] | select(.numero == "'${NUMERO_VENTA}'")'
echo

hr
printf "${GREEN}✓ Test completo.${RESET}\n"
hr
