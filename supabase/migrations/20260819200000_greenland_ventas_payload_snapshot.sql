-- Snapshot del payload original de la venta (servicios, tipo_iva, observaciones,
-- params de cuotas) para poder editarla desde la UI sin perder detalle.
-- Idempotente.

ALTER TABLE greenlanderp.ventas
  ADD COLUMN IF NOT EXISTS payload_snapshot jsonb;

COMMENT ON COLUMN greenlanderp.ventas.payload_snapshot IS
  'Snapshot del body que creó la venta (servicios, tipo_iva, observaciones, cuota_monto, intervalo_dias, fecha_primera_cuota). Se usa para prellenar el form de edición.';
