# Testeo de la API pública de cobranza

Tres métodos para integraciones tipo Pago Express, Aqui Pago, Practipago,
Infonet o Bancard Marketplace:

| # | Método | Endpoint | Auth |
|---|---|---|---|
| 1 | Consulta de deudas | `GET /api/public/mis-pagos?ci=...` | público |
| 2 | Pago | `POST /api/public/pagos` | `X-Api-Key` |
| 3 | Reversa | `POST /api/public/pagos/reversa` | `X-Api-Key` |

## Prerequisitos (una sola vez)

1. **Setear env var en Coolify:**
   ```
   EXTERNAL_PAYMENT_API_KEY = <string aleatorio de 32+ chars>
   ```
   Generá con: `openssl rand -hex 32`

2. **Correr migración en Supabase SQL editor** (`20260629200000_greenland_pagos_externos.sql`).

3. **Cargar datos de prueba** (cliente con CI + cuota pendiente). Ver `test-data-mis-pagos.sql` o usá uno real.

## Probar con el script bash

```bash
export BASE_URL="https://greenland.neura.com.py"
export API_KEY="tu-key-de-coolify"
export CI="1234567"                       # CI del cliente
export NUMERO_VENTA="VTA-TEST-002"        # numero exacto de una cuota pendiente
export MONTO="1500000"

chmod +x scripts/test-api-pagos.sh
./scripts/test-api-pagos.sh
```

El script hace **consulta → pago → reintento idempotente → reversa → consulta**. Si todo OK,
vas a ver:
- Paso 1: cuota en estado "pendiente" o "vencido"
- Paso 2: `success: true`, saldo restante = total - monto
- Paso 2b: `ya_aplicado: true` — sin duplicar
- Paso 3: `success: true`, saldo restablecido
- Paso 4: la cuota vuelve a "pendiente"/"vencido"

## Probar con Postman

1. Importá `test-api-pagos.postman_collection.json`
2. Editá las variables del collection (botón "Variables"): `base_url`, `api_key`, `ci`, `numero_venta`
3. Corré las 5 requests en orden

El `transaccion_id` se genera con `{{$timestamp}}` para no chocar entre ejecuciones.

## Casos de error que vale verificar

| Escenario | Esperado |
|---|---|
| Sin `X-Api-Key` | `401 Falta API key` |
| `X-Api-Key` incorrecto | `401 API key inválida` |
| `transaccion_id` ya existe con otro monto | `409 transaccion_id ya existe con otros datos` |
| `numero_venta` inexistente | `404 cuota no encontrada` |
| Monto mayor al saldo pendiente | `400 monto supera saldo pendiente` |
| Reversa de tx_id inexistente | `404 transaccion_id no encontrado` |
| Reversa de tx_id ya reversada | `200 ya_reversado: true` |

## Para entregar al partner

Pasale a tu integrador (Bancard, Pago Express, etc.) **esta misma carpeta**: el `.md`,
el `.sh`, el `.postman_collection.json`. Con eso pueden probar contra staging por su
cuenta sin pedirte que hagas nada cada vez.
