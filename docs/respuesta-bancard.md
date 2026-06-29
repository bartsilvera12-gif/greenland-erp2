# Borrador de respuesta para Bancard / Infonet Cobranzas

Editá lo que necesites y mandalo.

---

**Asunto:** RE: Solicitud para ser Facturador — Web Service de Green Land SRL

---

Buenas tardes, Jazmín / equipo de Infonet Cobranzas,

Gracias por los requerimientos. Les confirmamos:

**1. Web service propia disponible**

Desarrollamos nuestra propia API con los 3 métodos que solicitan (consulta, pago y reversa). No necesitamos adaptarnos a la API de Bancard.

- **Base URL:** `https://greenland.neura.com.py`
- **Autenticación pago/reversa:** header `X-Api-Key` (se las entregamos por canal seguro)
- **Documentación completa:** adjuntamos PDF con specs, ejemplos JSON, códigos de error y casos de prueba.

**2. Respuestas a sus consultas**

| Consulta | Respuesta |
|---|---|
| **Productos a integrar** | Pago de cuotas mensuales de venta de lotes (loteamientos / barrios cerrados). |
| **Aceptan pagos parciales** | Sí. Monto mínimo: **Gs. 10.000**. Cualquier monto entre el mínimo y el saldo pendiente. |
| **Moneda extranjera** | No. Solo trabajamos en guaraníes (PYG). |

**3. Datos de prueba**

Cargamos 7 casos en nuestro ambiente. Los entregamos en la documentación adjunta — incluyen: pendiente, vencido, parcial, pagado, multi-cuota, monto chico (Gs. 50.000) y monto grande (Gs. 5.000.000).

**4. Logos**

Adjuntamos en los 4 tamaños solicitados (200x200, 180x100, 150x50, 50x50) en PNG y JPG.

**5. Detalles sobre la reversa**

Confirmamos haber implementado la reversa **exactamente como describen** en el punto de observación: idempotente, solo para casos de timeout/error post-llamada (NO para anular transacciones ya liquidadas en cuenta). Si el partner reintenta con el mismo `transaccion_id` después de una reversa, devolvemos 409 y le pedimos generar un identificador nuevo.

**Adjuntos:**
- `api-cobranzas-bancard.pdf` — documentación técnica
- `green-land-200x200.png` / `.jpg`
- `green-land-180x100.png` / `.jpg`
- `green-land-150x50.png` / `.jpg`
- `green-land-50x50.png` / `.jpg`

Quedamos a disposición para coordinar pruebas en cuanto tengan listo su sandbox.

Saludos cordiales,
T. Alvarez
Green Land SRL · RUC 80140360-0
talvarez@greenlandpy.com
