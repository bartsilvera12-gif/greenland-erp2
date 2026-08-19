-- Recargo por mora en cobros: 5.000 Gs por día vencido sobre cuotas de crédito.
-- Se persiste el recargo aplicado para poder auditarlo/regenerar recibos.

alter table if exists public.cobros_clientes
  add column if not exists recargo_mora numeric(18,2) not null default 0,
  add column if not exists dias_mora integer not null default 0;

comment on column public.cobros_clientes.recargo_mora is
  'Recargo por mora cobrado (en la moneda del cobro). Se suma al monto y NO reduce el saldo de la cuenta.';
comment on column public.cobros_clientes.dias_mora is
  'Días transcurridos entre fecha_vencimiento de la cuota y fecha_pago cuando el cobro se aplicó.';
