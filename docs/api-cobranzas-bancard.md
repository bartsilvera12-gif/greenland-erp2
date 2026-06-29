# Web Service de Cobranzas · Green Land SRL

Integración para **Bancard / Red Infonet Cobranzas**.

- **Razón social:** Green Land SRL
- **RUC:** 80140360-0
- **Producto a integrar:** Pago de cuotas de venta de propiedades inmobiliarias (lotes en barrios cerrados)
- **Moneda:** Solo PYG (guaraníes)
- **Pagos parciales:** Sí, monto mínimo Gs. 10.000
- **Base URL producción:** `https://greenland.neura.com.py`
- **Base URL staging:** _(misma; sin staging separado por ahora)_

---

## Autenticación

Para los métodos **Pago** y **Reversa** se valida un API key en el header.

```
X-Api-Key:     <clave compartida — la entregamos por canal seguro>
X-Partner-Id:  bancard           ← identifica al partner en logs
Content-Type:  application/json
```

El **método Consulta es público** (no requiere API key).

---

## 1. Consulta de deudas

```
GET /api/public/mis-pagos?ci=<documento>
GET /api/public/mis-pagos?ruc=<ruc>
```

Devuelve datos del cliente + resumen de saldo + listado de cuotas pendientes.

### Request

| Parámetro | Tipo | Requerido | Descripción |
|---|---|---|---|
| `ci`  | string | uno de los dos | Cédula de identidad |
| `ruc` | string | uno de los dos | RUC |

### Response (200)

```json
{
  "success": true,
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
        "estado": "pendiente",       // pagado | parcial | pendiente | vencido
        "dias_mora": 0,
        "interes": 0,                // reservado para futuro
        "multa": 0                   // reservado para futuro
      }
    ]
  }
}
```

Si el cliente no existe → `200` con `cliente: null` y `cuotas: []`.

---

## 2. Aplicar pago

```
POST /api/public/pagos
```

Aplica un cobro contra una cuota específica. **Idempotente** por `transaccion_id`.

### Request body

```json
{
  "transaccion_id": "BNC-2026-001234",      // requerido, único por partner
  "numero_venta":   "BNC-TEST-001",         // requerido, número exacto de la cuota
  "monto":          1500000,                 // requerido, > 0, ≤ saldo pendiente
  "moneda":         "GS",                    // opcional, default GS
  "fecha_pago":     "2026-06-29T15:30:00Z",  // opcional, default servidor
  "metodo":         "efectivo",              // opcional: efectivo | transferencia | tarjeta | otro
  "referencia":     "Pago boca 4521"         // opcional, max 200 chars
}
```

### Response (200) — aplicado

```json
{
  "success": true,
  "data": {
    "transaccion_id":   "BNC-2026-001234",
    "cuenta_id":        "uuid",
    "cobro_id":         "uuid",
    "monto":            1500000,
    "saldo_restante":   0,
    "estado_cuenta":    "pagado",         // pendiente | parcial | pagado
    "applied_at":       "2026-06-29T15:30:00Z"
  }
}
```

### Response (200) — idempotente (mismo `transaccion_id`)

```json
{
  "success": true,
  "ya_aplicado": true,
  "data": { ... mismo shape ... }
}
```

### Errores

| Código | Cuándo |
|---|---|
| `400` | Falta `transaccion_id`/`numero_venta`/`monto`, monto ≤ 0, cuenta anulada o ya pagada, monto > saldo |
| `401` | Falta `X-Api-Key` o es inválida |
| `404` | `numero_venta` no encontrado |
| `409` | Mismo `transaccion_id` ya existe con otro monto/cuota |
| `409` | Pago previamente reversado — usar nuevo `transaccion_id` |

---

## 3. Reversa de pago

```
POST /api/public/pagos/reversa
```

Anula un pago previamente aplicado (caso timeout/error). **Idempotente**.

### Request body

```json
{
  "transaccion_id": "BNC-2026-001234"
}
```

### Response (200)

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

Si ya estaba reversado → mismo shape con `"ya_reversado": true`.

### Errores

| Código | Cuándo |
|---|---|
| `401` | API key inválida |
| `404` | `transaccion_id` no encontrado para este partner |

---

## 7 Datos de prueba

Cargados en staging con el script `scripts/seed-bancard-test-data.sql`.

| # | Cliente | CI / RUC | Cuota / N° venta | Monto | Estado |
|---|---|---|---|---|---|
| 1 | Maria Lopez | 1111111 | BNC-TEST-001 | 1.500.000 | Pendiente |
| 2 | Carlos Gimenez | 2222222 | BNC-TEST-002 | 2.000.000 | Vencido |
| 3 | Ana Martinez | 3333333 | BNC-TEST-003 | 1.200.000 (sobre 2.000.000) | Parcial |
| 4 | Pedro Rodriguez | 4444444 | BNC-TEST-004 | 0 (de 1.000.000) | Pagado |
| 5 | Constructora Aurora SA | 80012345-6 | BNC-TEST-005-C1/C2/C3 | 5.000.000 c/u | 3 cuotas |
| 6 | Rodrigo Acosta | 5555555 | BNC-TEST-006 | 50.000 | Pendiente chico |
| 7 | Lucia Benitez | 6666666 | BNC-TEST-007 | 5.000.000 | Pendiente grande |

---

## Casos de prueba sugeridos

1. **Consulta exitosa** — `GET /api/public/mis-pagos?ci=1111111` → ver 1 cuota pendiente
2. **Consulta sin resultados** — `GET /api/public/mis-pagos?ci=0000000` → `cliente: null`
3. **Pago total** — pagar BNC-TEST-001 completo → estado pasa a `pagado`
4. **Pago parcial** — pagar BNC-TEST-007 con monto 2.000.000 → estado `parcial`, saldo 3.000.000
5. **Idempotencia** — reintentar el mismo pago → `ya_aplicado: true`
6. **Conflicto** — mismo `transaccion_id` con otro monto → `409`
7. **Reversa** — reversar pago → cuota vuelve a `pendiente` con saldo original
8. **Reversa de inexistente** — `transaccion_id` que no existe → `404`

---

## Auditoría

Todos los pagos y reversas quedan registrados en `pagos_externos` con:
- `partner_id` (ej. "bancard")
- `transaccion_id` original
- `raw_request` (jsonb con el body recibido)
- `ip` del partner
- `applied_at` / `reversed_at`

---

## Contacto técnico

Para credenciales (`X-Api-Key`), URL de staging si necesitan separar, o cualquier ajuste:

- **Email:** talvarez@greenlandpy.com
- **Empresa:** Green Land SRL · RUC 80140360-0
