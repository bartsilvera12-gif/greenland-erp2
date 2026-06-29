#!/usr/bin/env bash
# =============================================================================
# Test end-to-end de los 3 metodos del Web Service de Cobranzas para Bancard.
#
# Endpoints (todos requieren X-Api-Key + X-Partner-Id):
#   POST /api/bancard/deudas/consultar
#   POST /api/bancard/pagos
#   POST /api/bancard/pagos/reversa
#
# Uso:
#   1. Edita BASE_URL, API_KEY, DOCUMENTO, NUMERO_VENTA abajo.
#   2. chmod +x scripts/test-api-pagos.sh
#   3. ./scripts/test-api-pagos.sh
# =============================================================================

# -- CONFIG -------------------------------------------------------------------
BASE_URL="${BASE_URL:-https://greenland.neura.com.py}"
API_KEY="${API_KEY:-CAMBIA_ESTO_POR_TU_KEY}"     # = EXTERNAL_PAYMENT_API_KEY en Coolify
PARTNER_ID="${PARTNER_ID:-bancard}"
TIPO_DOC="${TIPO_DOC:-ci}"                       # ci | ruc
DOCUMENTO="${DOCUMENTO:-1111111}"
NUMERO_VENTA="${NUMERO_VENTA:-BNC-TEST-001}"
MONTO="${MONTO:-1500000}"
TX_ID="${TX_ID:-TEST-$(date +%s)}"

# -- HELPERS ------------------------------------------------------------------
GREEN="\033[32m"; YELLOW="\033[33m"; RESET="\033[0m"; BOLD="\033[1m"
hr() { printf "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"; }
say() { printf "${YELLOW}▸${RESET} ${BOLD}%s${RESET}\n" "$1"; }

# -- 1) CONSULTA --------------------------------------------------------------
hr
say "1) Consulta de deudas — POST /api/bancard/deudas/consultar"
echo "    tipo_documento: ${TIPO_DOC}"
echo "    documento:      ${DOCUMENTO}"
hr
curl -s -X POST "${BASE_URL}/api/bancard/deudas/consultar" \
  -H "X-Api-Key: ${API_KEY}" \
  -H "X-Partner-Id: ${PARTNER_ID}" \
  -H "Content-Type: application/json" \
  -d "{ \"tipo_documento\": \"${TIPO_DOC}\", \"documento\": \"${DOCUMENTO}\" }" | jq .
echo

# -- 2) PAGO ------------------------------------------------------------------
hr
say "2) Aplicar pago — POST /api/bancard/pagos"
echo "    transaccion_id: ${TX_ID}"
echo "    numero_venta:   ${NUMERO_VENTA}"
echo "    monto:          ${MONTO}"
hr
curl -s -X POST "${BASE_URL}/api/bancard/pagos" \
  -H "X-Api-Key: ${API_KEY}" \
  -H "X-Partner-Id: ${PARTNER_ID}" \
  -H "Content-Type: application/json" \
  -d "{
    \"transaccion_id\": \"${TX_ID}\",
    \"numero_venta\":   \"${NUMERO_VENTA}\",
    \"monto\":          ${MONTO},
    \"moneda\":         \"GS\",
    \"metodo\":         \"transferencia\",
    \"referencia\":     \"Pago boca Infonet ${TX_ID}\"
  }" | jq .
echo

# -- 2b) PAGO IDEMPOTENTE -----------------------------------------------------
hr
say "2b) Reintentar mismo pago (idempotencia)"
hr
curl -s -X POST "${BASE_URL}/api/bancard/pagos" \
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
say "3) Reversar pago — POST /api/bancard/pagos/reversa"
hr
curl -s -X POST "${BASE_URL}/api/bancard/pagos/reversa" \
  -H "X-Api-Key: ${API_KEY}" \
  -H "X-Partner-Id: ${PARTNER_ID}" \
  -H "Content-Type: application/json" \
  -d "{ \"transaccion_id\": \"${TX_ID}\" }" | jq .
echo

# -- 4) CONSULTA POST-REVERSA -------------------------------------------------
hr
say "4) Consulta post-reversa — la deuda debe estar nuevamente pendiente"
hr
curl -s -X POST "${BASE_URL}/api/bancard/deudas/consultar" \
  -H "X-Api-Key: ${API_KEY}" \
  -H "X-Partner-Id: ${PARTNER_ID}" \
  -H "Content-Type: application/json" \
  -d "{ \"tipo_documento\": \"${TIPO_DOC}\", \"documento\": \"${DOCUMENTO}\" }" \
  | jq '.data.cuotas[] | select(.numero == "'${NUMERO_VENTA}'")'
echo

hr
printf "${GREEN}✓ Test completo.${RESET}\n"
hr
