# Web Service de Cobranzas · Green Land SRL

Integración para **Bancard / Red Infonet Cobranzas**.

- **Razón social:** Green Land SRL
- **RUC:** 80140360-0
- **Producto a integrar:** Pago de cuotas de venta de propiedades inmobiliarias (lotes en barrios cerrados)
- **Moneda:** Solo PYG (guaraníes)
- **Pagos parciales:** Sí, monto mínimo Gs. 10.000
- **Base URL producción:** `https://greenland.neura.com.py`

---

## Autenticación

**Los 3 métodos requieren los siguientes headers:**

| Header | Valor | Notas |
|---|---|---|
| `X-Api-Key` | _(clave compartida)_ | Se entrega por canal seguro |
| `X-Partner-Id` | `bancard` | Identifica al partner para audit |
| `Content-Type` | `application/json` | Todos los endpoints reciben JSON |

Errores comunes de auth:

| HTTP | Cuándo |
|---|---|
| `401 Falta token` | No vino el header `X-Api-Key` |
| `401 API key inválida` | Vino pero no matchea el secret |
| `500 EXTERNAL_PAYMENT_API_KEY no configurada` | Servidor sin la env var seteada |

---

## 1. Consulta de deudas

```
POST /api/bancard/deudas/consultar
```

### Request body

```json
{
  "tipo_documento": "ci",
  "documento": "1111111"
}
```

O por RUC:

```json
{
  "tipo_documento": "ruc",
  "documento": "80012345-6"
}
```

### Response (200) — cliente encontrado

```json
{
  "success": true,
  "partner_id": "bancard",
  "tipo_documento": "ci",
  "data": {
    "cliente": {
      "id": "uuid",
      "nombre": "Maria Lopez",
      "documento": "1111111",
      "ruc": null
    },
    "resumen": {
      "total_pendiente": 1500000,
      "total_vencido": 0,
      "cuotas_pendientes": 1,
      "proxima_cuota": {
        "numero": "BNC-TEST-001",
        "vencimiento": "2026-07-29",
        "saldo": 1500000
      }
    },
    "cuotas": [
      {
        "id": "uuid",
        "numero": "BNC-TEST-001",
        "numero_cuota": 1,
        "total_cuotas": 1,
        "fecha_emision": "2026-06-29",
        "fecha_vencimiento": "2026-07-29",
        "moneda": "GS",
        "total": 1500000,
        "pagado": 0,
        "saldo": 1500000,
        "estado": "pendiente",
        "dias_mora": 0,
        "interes": 0,
        "multa": 0
      }
    ]
  }
}
```

Cliente no encontrado o sin deudas → `200` con `data.cliente = null` y `data.cuotas = []`.

### Errores

| HTTP | Caso |
|---|---|
| `400` | `tipo_documento` distinto de `ci`/`ruc`, o `documento` menor a 4 chars |
| `401` | API key inválida o ausente |

### Valores de `estado` de cada cuota

| Estado | Significado |
|---|---|
| `pagado` | saldo = 0 |
| `vencido` | saldo > 0 y fecha_vencimiento < hoy |
| `parcial` | saldo > 0 pero ya recibió algún pago |
| `pendiente` | saldo > 0, todavía no vencida, sin pagos |

---

## 2. Aplicar pago

```
POST /api/bancard/pagos
```

Idempotente por `transaccion_id` del partner.

### Request body

```json
{
  "transaccion_id": "BNC-2026-001234",
  "numero_venta":   "BNC-TEST-001",
  "monto":          1500000,
  "moneda":         "GS",
  "fecha_pago":     "2026-06-29T15:30:00Z",
  "metodo":         "transferencia",
  "referencia":     "Pago boca Infonet Asunción"
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `transaccion_id` | string | sí | ID de la transacción en Bancard, usado como idempotency key. Max 80 chars |
| `numero_venta` | string | sí | Identificador de la cuota a pagar (viene en la consulta como `cuotas[].numero`) |
| `monto` | number | sí | Monto en PYG. Debe ser > 0 y ≤ saldo pendiente. Permite pago parcial |
| `moneda` | string | no | `GS` (default) o `USD` |
| `fecha_pago` | ISO 8601 | no | Default: hora del servidor |
| `metodo` | string | no | `efectivo` \| `transferencia` (default) \| `tarjeta` \| `otro` |
| `referencia` | string | no | Texto libre. Max 200 chars |

### Response (200) — aplicado exitosamente

```json
{
  "success": true,
  "data": {
    "transaccion_id":   "BNC-2026-001234",
    "cuenta_id":        "uuid",
    "cobro_id":         "uuid",
    "monto":            1500000,
    "saldo_restante":   0,
    "estado_cuenta":    "pagado",
    "applied_at":       "2026-06-29T15:30:00Z"
  }
}
```

### Response (200) — idempotente (reintento con mismo `transaccion_id`)

```json
{
  "success": true,
  "ya_aplicado": true,
  "data": { /* mismo shape que el caso anterior */ }
}
```

### Errores

| HTTP | Caso |
|---|---|
| `400` | Falta `transaccion_id`/`numero_venta`/`monto`; monto ≤ 0; cuenta anulada o ya pagada; monto > saldo |
| `401` | API key inválida o ausente |
| `404` | `numero_venta` no encontrado |
| `409` | Mismo `transaccion_id` ya existe pero con monto/cuota distintos |
| `409` | Pago previamente reversado — usar `transaccion_id` nuevo |

---

## 3. Reversa de pago

```
POST /api/bancard/pagos/reversa
```

Anula un pago previamente aplicado y **restaura el saldo** de la cuota para que vuelva a ser consultable y pagable. Idempotente.

> **Importante:** según la observación del correo de Bancard, este método sirve solo para casos donde falló algo posterior al cobro (timeout/error). NO sirve para anular un pago ya liquidado a la cuenta — esos van por el flujo operativo con el equipo de Anulaciones de Bancard.

### Request body

```json
{ "transaccion_id": "BNC-2026-001234" }
```

### Response (200) — reversado

```json
{
  "success": true,
  "data": {
    "transaccion_id":     "BNC-2026-001234",
    "cuenta_id":          "uuid",
    "saldo_restablecido": 1500000,
    "estado_cuenta":      "pendiente",
    "reversed_at":        "2026-06-29T15:31:12Z"
  }
}
```

### Response (200) — ya reversado (idempotente)

```json
{
  "success": true,
  "ya_reversado": true,
  "data": {
    "transaccion_id": "BNC-2026-001234",
    "cuenta_id":      "uuid",
    "reversed_at":    "2026-06-29T15:31:12Z"
  }
}
```

### Errores

| HTTP | Caso |
|---|---|
| `400` | Falta `transaccion_id` |
| `401` | API key inválida o ausente |
| `404` | `transaccion_id` no encontrado para este `partner_id` |

---

## Ejemplos cURL

### Consulta

```bash
curl -X POST "https://greenland.neura.com.py/api/bancard/deudas/consultar" \
  -H "X-Api-Key: <TU_KEY>" \
  -H "X-Partner-Id: bancard" \
  -H "Content-Type: application/json" \
  -d '{ "tipo_documento": "ci", "documento": "1111111" }'
```

### Pago

```bash
curl -X POST "https://greenland.neura.com.py/api/bancard/pagos" \
  -H "X-Api-Key: <TU_KEY>" \
  -H "X-Partner-Id: bancard" \
  -H "Content-Type: application/json" \
  -d '{
    "transaccion_id": "BNC-2026-001234",
    "numero_venta":   "BNC-TEST-001",
    "monto":          1500000,
    "moneda":         "GS",
    "metodo":         "transferencia",
    "referencia":     "Pago boca Infonet"
  }'
```

### Reversa

```bash
curl -X POST "https://greenland.neura.com.py/api/bancard/pagos/reversa" \
  -H "X-Api-Key: <TU_KEY>" \
  -H "X-Partner-Id: bancard" \
  -H "Content-Type: application/json" \
  -d '{ "transaccion_id": "BNC-2026-001234" }'
```

---

## 7 datos de prueba

Cargados con `scripts/seed-bancard-test-data.sql`. Casos cubiertos:

| # | Cliente | CI / RUC | numero_venta | Saldo | Estado | Caso |
|---|---|---|---|---|---|---|
| 1 | Maria Lopez | 1111111 | BNC-TEST-001 | 1.500.000 | Pendiente | Pago normal |
| 2 | Carlos Gimenez | 2222222 | BNC-TEST-002 | 2.000.000 | Vencido | Pago de mora |
| 3 | Ana Martinez | 3333333 | BNC-TEST-003 | 1.200.000 (de 2.000.000) | Parcial | Saldo remanente |
| 4 | Pedro Rodriguez | 4444444 | BNC-TEST-004 | 0 (de 1.000.000) | Pagado | Rechazar pago de cuota saldada |
| 5 | Constructora Aurora SA | 80012345-6 | BNC-TEST-005-C1/C2/C3 | 5.000.000 c/u | 3 cuotas | Multi-cuota, búsqueda por RUC |
| 6 | Rodrigo Acosta | 5555555 | BNC-TEST-006 | 50.000 | Pendiente | Monto chico |
| 7 | Lucia Benitez | 6666666 | BNC-TEST-007 | 5.000.000 | Pendiente | Monto grande |

---

## Casos de prueba sugeridos

1. **Consulta exitosa por CI** — `tipo_documento: ci`, `documento: 1111111` → 1 cuota pendiente
2. **Consulta por RUC** — `tipo_documento: ruc`, `documento: 80012345-6` → 3 cuotas
3. **Consulta sin resultados** — `documento: 0000000` → `cliente: null`
4. **Pago total** — cuota BNC-TEST-001 con monto 1.500.000 → `estado_cuenta: pagado`
5. **Pago parcial** — cuota BNC-TEST-007 con monto 2.000.000 → `estado_cuenta: parcial`, `saldo_restante: 3.000.000`
6. **Idempotencia** — reintentar el mismo `transaccion_id` → `ya_aplicado: true`
7. **Conflicto** — mismo `transaccion_id` con otro monto → `409`
8. **Pago sobre saldo** — monto > saldo → `400`
9. **Reversa exitosa** — pago previo → vuelve a `pendiente` con saldo original
10. **Reversa idempotente** — reversar dos veces → `ya_reversado: true`
11. **Reversa de tx inexistente** — `404`
12. **Re-pago tras reversa** — mismo `transaccion_id` después de reversado → `409` (debe usar nuevo)

---

## Auditoría

Todas las transacciones (pagos + reversas) quedan en `pagos_externos` con:
- `partner_id` (ej. `bancard`)
- `transaccion_id` original
- `raw_request` (jsonb con el body completo recibido)
- `ip` del partner
- `applied_at` / `reversed_at`
- `cobro_id` (FK lógica al registro contable en `cobros_clientes`)

---

## Contacto técnico

- **Email:** talvarez@greenlandpy.com
- **Empresa:** Green Land SRL · RUC 80140360-0

Para `X-Api-Key`, ajustes a la API o credenciales de staging separado, escribir al email de arriba.
