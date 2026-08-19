-- Recargo por mora en cobros: 5.000 Gs por día vencido sobre cuotas de crédito.
-- Se persiste el recargo aplicado para poder auditarlo/regenerar recibos.
-- Idempotente.

ALTER TABLE greenlanderp.cobros_clientes
  ADD COLUMN IF NOT EXISTS recargo_mora numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dias_mora    integer       NOT NULL DEFAULT 0;

COMMENT ON COLUMN greenlanderp.cobros_clientes.recargo_mora IS
  'Recargo por mora cobrado (en la moneda del cobro). Se suma al monto y NO reduce el saldo de la cuenta.';
COMMENT ON COLUMN greenlanderp.cobros_clientes.dias_mora IS
  'Días transcurridos entre fecha_vencimiento de la cuota y fecha_pago cuando el cobro se aplicó.';
