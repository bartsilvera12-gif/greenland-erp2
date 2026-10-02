# Importar histórico de ventas a crédito, cuotas y cobros

Herramienta para cargar de una sola vez el historial del año (ventas a crédito,
sus cuotas y los pagos ya recibidos) y dejar el **Estado de cuenta** de cada
cliente completo.

No toca stock, compras, producción ni SIFEN: solo crea ventas a crédito,
cuentas por cobrar (cuotas) y cobros de clientes.

## Pasos

### 1. Generar la plantilla vacía

```bash
npm run historico:plantilla
```

Crea `historico.xlsx` con dos hojas de ejemplo (**Ventas** y **Pagos**).

### 2. Llenar el Excel

**Hoja "Ventas"** — una fila por venta a crédito:

| Columna | Qué poner |
|---|---|
| ID Venta | Un código que inventás vos (ej: `V001`). Sirve para enlazar los pagos. **Único por venta.** |
| RUC/CI | RUC o cédula del cliente (para encontrarlo o crearlo) |
| Razón social | Nombre del cliente |
| Fecha venta | dd/mm/aaaa |
| Descripción | Detalle (ej: "Lote 12 - Barrio San José"). Opcional |
| Moneda | `GS` o `USD` (default GS) |
| Total | Monto total de la venta |
| Cantidad cuotas | Nº de cuotas (hasta 240) |
| Monto por cuota | Opcional. Vacío = reparte el total en partes iguales |
| Primera cuota vence | dd/mm/aaaa |
| Cada (días) | 30 mensual, 15 quincenal, 60 bimestral… (default 30) |

**Hoja "Pagos"** — una fila por pago ya recibido (opcional):

| Columna | Qué poner |
|---|---|
| ID Venta | El mismo código de la hoja Ventas |
| N° cuota | A qué cuota corresponde el pago (1, 2, 3…) |
| Fecha pago | dd/mm/aaaa |
| Monto | Monto pagado |
| Método | efectivo / transferencia / tarjeta / cheque / otro |
| Referencia | Nº de comprobante, etc. Opcional |

### 3. Probar (no escribe nada)

```bash
npm run historico:importar -- historico.xlsx
```

Valida la planilla, muestra cuántas ventas/cuotas/pagos se generarían y los
totales. **No modifica la base.** Si hay errores, los lista con el número de fila.

### 4. Aplicar de verdad

```bash
npm run historico:importar -- historico.xlsx --apply
```

Escribe todo dentro de **una sola transacción**: si algo falla, se revierte
completo (no queda nada a medias).

## Requisitos

- `.env.local` con `SUPABASE_DB_URL` (o `DIRECT_URL` / `DATABASE_URL`).
- La empresa se resuelve buscando "Green" en `zentra_erp.empresas`. Si hace falta:
  - `--empresa "Green Land"` para cambiar el texto de búsqueda
  - `--empresa-id <uuid>` para forzar la empresa
  - `--schema <nombre>` para forzar el schema

## Notas

- **Idempotencia:** cada venta se guarda con `numero_control = HIST-<ID Venta>`.
  Si corrés dos veces con el mismo ID, aborta para no duplicar. Para recargar,
  primero borrá las ventas previas o cambiá los ID.
- Las cuotas se generan con la **misma lógica que la app** (monto por cuota,
  intervalo, redondeo en la última cuota).
- Los pagos reducen el saldo de la cuota y actualizan su estado
  (`pendiente` → `parcial` → `pagado`).
