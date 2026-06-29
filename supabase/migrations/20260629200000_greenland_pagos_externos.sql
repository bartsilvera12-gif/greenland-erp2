-- =============================================================================
-- Green Land · Pagos externos (integraciones de cobranza tipo Pago Express,
-- Aqui Pago, Practipago, etc.).
--
-- Cada fila representa una transaccion externa que pago una cuota. Si el
-- partner reintenta con el mismo transaccion_id (por timeout, etc.) no se
-- duplica el pago. La reversa marca estado=reversado y restaura el saldo
-- de la cuenta original.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS greenlanderp.pagos_externos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL,
  partner_id       text NOT NULL,           -- ej. 'pago-express', 'aqui-pago'
  transaccion_id   text NOT NULL,           -- id de transaccion del partner (idempotency)
  cuenta_id        uuid NOT NULL,           -- FK logica a cuentas_por_cobrar
  numero_venta     text,                    -- snapshot para auditoria
  cobro_id         uuid,                    -- FK logica a cobros_clientes (si aplicado)
  monto            numeric NOT NULL,
  moneda           text NOT NULL DEFAULT 'GS',
  estado           text NOT NULL DEFAULT 'aplicado' CHECK (estado IN ('aplicado','reversado')),
  metodo_pago      text,
  referencia       text,
  applied_at       timestamptz NOT NULL DEFAULT now(),
  reversed_at      timestamptz,
  raw_request      jsonb,
  ip               text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Unicidad por partner para idempotencia.
CREATE UNIQUE INDEX IF NOT EXISTS pagos_externos_partner_tx_idx
  ON greenlanderp.pagos_externos (empresa_id, partner_id, transaccion_id);

CREATE INDEX IF NOT EXISTS pagos_externos_cuenta_idx
  ON greenlanderp.pagos_externos (empresa_id, cuenta_id);
CREATE INDEX IF NOT EXISTS pagos_externos_estado_idx
  ON greenlanderp.pagos_externos (empresa_id, estado, applied_at DESC);

CREATE OR REPLACE FUNCTION greenlanderp.pagos_externos_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'pagos_externos_set_updated_at'
      AND tgrelid = 'greenlanderp.pagos_externos'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER pagos_externos_set_updated_at
             BEFORE UPDATE ON greenlanderp.pagos_externos
             FOR EACH ROW EXECUTE FUNCTION greenlanderp.pagos_externos_set_updated_at()';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON greenlanderp.pagos_externos TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
