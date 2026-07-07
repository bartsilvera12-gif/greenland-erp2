# Web Service de Cobranzas · Green Land SRL

Integración para **Bancard / Red Infonet Cobranzas** cumpliendo la especificación
"API para Facturadores – Servicio de Cobranzas".

- **Razón social:** Green Land SRL
- **RUC:** 80140360-0
- **Producto:** Pago de cuotas de venta de propiedades inmobiliarias
- **Moneda:** Solo PYG (ISO 4217) — Green Land no acepta moneda extranjera por este canal
- **Pagos parciales:** Sí, monto mínimo Gs. 10.000
- **Base URL producción:** `https://greenland.neura.com.py`

---

## Convenciones generales

- Formato de datos: **JSON** (RFC 4627)
- Todas las respuestas incluyen los campos comunes: `status`, `tid`, `messages`
- Header de respuesta `Server: Green Land Cobranzas API v1`
- Todos los responses incluyen headers CORS (`Access-Control-Allow-Origin: *`)

### Formato general de respuesta

```json
{
  "status": "success",
  "tid": 3949,
  "messages": [
    { "level": "success", "key": "QueryProcessed", "dsc": ["..."] }
  ]
}
```

---

## 1. Obtener Facturas (Consulta de deudas)

```
GET /api/bancard/deudas/consultar?tid={TID}&sub_id[]={CI-o-RUC}
```

### Elementos de petición

| Nombre | Descripción | Requerido |
|---|---|---|
| `tid` | Identificador de la transacción (Long) | Sí |
| `sub_id[]` | Identificador del abonado (CI o RUC del cliente en Green Land) | Sí |
| `prd_id` | Identificador universal del producto. En Green Land es opcional (v2.0) | No |
| `addl` | Datos adicionales (JSON URL-encoded) | No |

### Ejemplo request

```
GET https://greenland.neura.com.py/api/bancard/deudas/consultar?tid=3949&sub_id[]=1234567
Accept: application/json
```

### Respuesta satisfactoria (200 OK)

```json
{
  "status": "success",
  "tid": 3949,
  "messages": [
    { "level": "success", "key": "QueryProcessed", "dsc": ["Consulta procesada con éxito"] }
  ],
  "invoices": [
    {
      "due": "2026-06-15",
      "amt": 1500000,
      "min_amt": 1500000,
      "inv_id": ["BNC-TEST-JUAN-C2"],
      "curr": "PYG",
      "addl": ["Cliente: Juan Pérez", "Documento: 1234567"],
      "cm_amt": 0,
      "cm_curr": "PYG",
      "dsc": "Cuota 2/4 · BNC-TEST-JUAN-C2"
    }
  ]
}
```

### Abonado no encontrado (404)

```json
{
  "status": "success",
  "tid": 3949,
  "messages": [
    { "level": "info", "key": "SubscriberNotFound", "dsc": ["El abonado con código 999999 no existe"] }
  ]
}
```

### Abonado sin deuda (403)

```json
{
  "status": "success",
  "tid": 3949,
  "messages": [
    { "level": "info", "key": "SubscriberWithoutDebt", "dsc": ["El abonado con código 1234567 no tiene deuda pendiente"] }
  ]
}
```

---

## 2. Realizar un pago

```
POST /api/bancard/pagos
Content-Type: application/json
```

### Elementos de petición

| Nombre | Descripción | Requerido |
|---|---|---|
| `tid` | Id de la transacción (Long) — llave de idempotencia | Sí |
| `prd_id` | Identificador universal del producto | Sí |
| `sub_id` | Array de identificador del abonado | Sí |
| `inv_id` | Array de identificador de factura/cuota (nuestro `numero_venta`) | Sí |
| `amt` | Importe de la transacción (entero) | Sí |
| `curr` | Moneda ISO 4217 (`PYG` \| `USD`) | Sí |
| `trn_dat` | Fecha (`yyyyMMdd` o `yyyy-MM-dd`) | Sí |
| `trn_hou` | Hora (`hhmmss`) | Sí |
| `cm_amt` | Importe de la comisión (entero) | Sí |
| `cm_curr` | Moneda de la comisión (ISO 4217) | Sí |
| `addl` | Datos adicionales (objeto JSON) | Sí |
| Otros campos | Se ignoran (ej. `barcode`) | No |

### Ejemplo request

```json
{
  "tid": 3950,
  "prd_id": 1,
  "sub_id": ["1234567"],
  "inv_id": ["BNC-TEST-JUAN-C2"],
  "amt": 1500000,
  "curr": "PYG",
  "trn_dat": "20260629",
  "trn_hou": "153000",
  "cm_amt": 0,
  "cm_curr": "PYG",
  "addl": {
    "cmr_id": 241621,
    "cmr_bra": 1,
    "payment_method": "CASH"
  }
}
```

### Pago procesado (200 OK)

```json
{
  "status": "success",
  "tid": 3950,
  "messages": [
    { "level": "success", "key": "PaymentProcessed", "dsc": ["El pago fue autorizado"] }
  ],
  "tkt": "<uuid del cobro>",
  "aut_cod": "<uuid del cobro>",
  "prnt_msg": [
    "GREEN LAND SRL",
    "RUC 80140360-0",
    "Pago autorizado",
    "Abonado: 1234567",
    "Cuota:   BNC-TEST-JUAN-C2",
    "Monto:   PYG 1.500.000",
    "Fecha:   2026-06-29 15:30:00",
    "Gracias por su pago."
  ]
}
```

### Reintento idempotente (mismo `tid`)

Devuelve el mismo `200 PaymentProcessed` sin duplicar el cobro. El mensaje `dsc` indica "idempotente".

### Abonado sin deuda (403)

```json
{
  "status": "error",
  "tid": 3950,
  "messages": [
    { "level": "error", "key": "SubscriberWithoutDebt", "dsc": ["La cuota no tiene deuda pendiente"] }
  ]
}
```

### Otros errores

| Escenario | key | HTTP |
|---|---|---|
| Falta de parámetros | `MissingParameter` | 403 |
| Parámetros inválidos (JSON malformado, `amt` <= 0) | `InvalidParameters` | 422 |
| `amt` supera saldo o `tid` con datos diferentes | `InvalidParameters` | 422 |
| Reversado previamente (mismo `tid`) | `PaymentNotAuthorized` | 403 |
| Error interno / DB | `HostTransactionError` | 403 |

---

## 3. Reversar Transacción

```
POST /api/bancard/pagos/reversa
Content-Type: application/json
```

### Elementos de petición

| Nombre | Descripción | Requerido |
|---|---|---|
| `tid` | Id de la transacción a reversar (Long) | Sí |

### Ejemplo request

```json
{ "tid": 3950 }
```

Si Bancard envía el body completo del pago, los campos adicionales al `tid` son ignorados.

### Reversa exitosa (200 OK)

```json
{
  "status": "success",
  "tid": 3950,
  "messages": [
    { "level": "success", "key": "TransactionReversed", "dsc": ["Transacción reversada satisfactoriamente"] }
  ]
}
```

### Idempotencia (ya reversada)

Devuelve el mismo `200 TransactionReversed` con `dsc: "Transacción ya reversada previamente"`.

### Errores

| Escenario | key | HTTP |
|---|---|---|
| `tid` no existe para Bancard | `TransactionNotReversed` | 403 |
| Error interno / DB | `HostTransactionError` | 403 |

---

## Glosario (según PDF de Bancard)

| Término | Significado |
|---|---|
| `tid` | Transaction ID |
| `prd_id` | Product ID |
| `sub_id` | Subscriber ID (CI / RUC en Green Land) |
| `inv_id` | Invoice ID (nuestro `numero_venta`) |
| `amt` | Amount |
| `curr` | Currency (ISO 4217: PYG / USD) |
| `min_amt` | Minimum amount |
| `due` | Due date |
| `trn_dat` | Transaction Date |
| `trn_hou` | Transaction Hour |
| `cm_amt` | Comisión amount |
| `cm_curr` | Comisión currency |
| `aut_cod` | Authorization Code |
| `tkt` | Ticket |
| `prnt_msg` | Printer Messages |
| `addl` | Additional Data |
| `dsc` | Description |

---

## Anexo · 7 registros de prueba

Con las cédulas `1234567` (Juan Pérez) y `5432100` (Eustaquio Camada) se dispone de 7
cuotas de prueba (4 + 3) con distintos estados (pagado, pendiente, vencido, parcial) — ver
correo adjunto de coordinación.
