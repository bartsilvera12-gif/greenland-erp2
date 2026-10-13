-- =============================================================================
-- Green Land · tipo de cuenta por cobrar: cuota normal / refuerzo / cancelación
-- Permite modelar planes con refuerzos anuales (ej. aguinaldo, cada octubre) y
-- una cancelación final (pago globo). Cada fila de cuentas_por_cobrar lleva su
-- tipo; por defecto 'cuota' (comportamiento actual, no rompe nada existente).
-- Idempotente.
-- =============================================================================

ALTER TABLE greenlanderp.cuentas_por_cobrar
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'cuota';

ALTER TABLE greenlanderp.cuentas_por_cobrar
  DROP CONSTRAINT IF EXISTS cuentas_por_cobrar_tipo_check;
ALTER TABLE greenlanderp.cuentas_por_cobrar
  ADD CONSTRAINT cuentas_por_cobrar_tipo_check
  CHECK (tipo = ANY (ARRAY['cuota'::text, 'refuerzo'::text, 'cancelacion'::text]));

COMMENT ON COLUMN greenlanderp.cuentas_por_cobrar.tipo IS
  'Tipo de la obligación: cuota (mensual normal), refuerzo (pago anual extra, p.ej. octubre) o cancelacion (pago final globo). Todas suman al total de la venta.';

SELECT pg_notify('pgrst', 'reload schema');
