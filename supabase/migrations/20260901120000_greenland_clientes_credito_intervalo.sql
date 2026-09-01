-- =============================================================================
-- Green Land · agrega frecuencia (cada N días) al crédito acordado del cliente
-- Permite modelar planes que no son mensuales (quincenales, bimestrales, etc).
-- Se pre-carga en la Nueva Venta cuando el cliente entra en modalidad crédito.
-- Idempotente.
-- =============================================================================

ALTER TABLE greenlanderp.clientes
  ADD COLUMN IF NOT EXISTS credito_intervalo_dias int;

COMMENT ON COLUMN greenlanderp.clientes.credito_intervalo_dias IS
  'Frecuencia de cuotas en días para la financiación acordada. Ej. 15 quincenal, 30 mensual, 60 bimestral. NULL = usar default 30.';

SELECT pg_notify('pgrst', 'reload schema');
