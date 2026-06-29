-- =============================================================================
-- Green Land · soporta multiples cuotas por venta en cuentas_por_cobrar
-- - Dropea el unique idx sobre venta_id (antes: 1 cuenta por venta).
-- - Agrega columna numero_cuota (1..N) para identificar cada cuota.
-- - Reemplaza con un idx no-unico para queries rapidas.
-- Idempotente.
-- =============================================================================

ALTER TABLE greenlanderp.cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS numero_cuota int,
  ADD COLUMN IF NOT EXISTS total_cuotas int;

DROP INDEX IF EXISTS greenlanderp.cuentas_por_cobrar_venta_id_idx;
CREATE INDEX IF NOT EXISTS cuentas_por_cobrar_venta_idx
  ON greenlanderp.cuentas_por_cobrar (venta_id);

-- Permite varias cuotas pero evita duplicar (misma venta + mismo numero_cuota).
CREATE UNIQUE INDEX IF NOT EXISTS cuentas_por_cobrar_venta_cuota_uidx
  ON greenlanderp.cuentas_por_cobrar (venta_id, numero_cuota)
  WHERE numero_cuota IS NOT NULL;

SELECT pg_notify('pgrst', 'reload schema');
