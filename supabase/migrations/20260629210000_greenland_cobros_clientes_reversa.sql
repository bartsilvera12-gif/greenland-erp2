-- =============================================================================
-- Green Land · soft-delete + auditoría de reversa en cobros_clientes
--
-- Cuando Bancard pide una reversa, en vez de borrar el registro contable lo
-- marcamos como `reversado` y guardamos:
--   - reversed_at: timestamp
--   - reversa_transaccion_id: el tx_id externo de Bancard que disparó la reversa
--   - reversa_motivo: texto libre (default 'reversa técnica Bancard')
--
-- Las filas existentes quedan con estado='aplicado' (default).
-- Los listados de Pagos/Cobranzas del ERP siguen mostrando todos por compat;
-- queda en frontend filtrar/marcar reversados según convenga.
-- Idempotente.
-- =============================================================================

ALTER TABLE greenlanderp.cobros_clientes
  ADD COLUMN IF NOT EXISTS estado                  text NOT NULL DEFAULT 'aplicado',
  ADD COLUMN IF NOT EXISTS reversed_at             timestamptz,
  ADD COLUMN IF NOT EXISTS reversa_transaccion_id  text,
  ADD COLUMN IF NOT EXISTS reversa_motivo          text;

-- Check constraint: estado solo puede ser 'aplicado' o 'reversado'.
-- Se aplica con DO porque ADD CONSTRAINT no soporta IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cobros_clientes_estado_check'
      AND conrelid = 'greenlanderp.cobros_clientes'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE greenlanderp.cobros_clientes
             ADD CONSTRAINT cobros_clientes_estado_check
             CHECK (estado IN (''aplicado'', ''reversado''))';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cobros_clientes_estado
  ON greenlanderp.cobros_clientes (empresa_id, estado);

COMMENT ON COLUMN greenlanderp.cobros_clientes.estado IS
  'aplicado | reversado. Soft-delete: la reversa marca reversado y no borra el registro';
COMMENT ON COLUMN greenlanderp.cobros_clientes.reversa_transaccion_id IS
  'transaccion_id externo del partner que pidió la reversa (ej. Bancard)';
COMMENT ON COLUMN greenlanderp.cobros_clientes.reversa_motivo IS
  'Motivo libre. Default: reversa técnica Bancard';

SELECT pg_notify('pgrst', 'reload schema');
