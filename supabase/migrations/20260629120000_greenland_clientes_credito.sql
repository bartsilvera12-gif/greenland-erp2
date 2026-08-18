-- =============================================================================
-- Green Land · agrega campos de crédito en clientes
-- Cuando condicion_pago = 'CREDITO', se guardan los detalles de la financiación
-- pactada al alta del cliente (medio, cuotas, monto por cuota, primera cuota).
-- Idempotente.
-- =============================================================================

ALTER TABLE greenlanderp.clientes
  ADD COLUMN IF NOT EXISTS credito_medio          text,
  ADD COLUMN IF NOT EXISTS credito_cuotas_cantidad int,
  ADD COLUMN IF NOT EXISTS credito_monto_cuota    numeric,
  ADD COLUMN IF NOT EXISTS credito_primera_cuota  date;

COMMENT ON COLUMN greenlanderp.clientes.credito_medio IS
  'Medio o tipo de financiación pactado con el cliente (ej. Financiamiento propio, Cooperativa X, Banco Y, Tarjeta, Otro)';

SELECT pg_notify('pgrst', 'reload schema');
