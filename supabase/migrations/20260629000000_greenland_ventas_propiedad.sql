-- Linkea ventas con la propiedad vendida (opcional). Para que el recibo
-- pueda imprimir los datos del lote y para reportes futuros. Idempotente.

ALTER TABLE greenlanderp.ventas
  ADD COLUMN IF NOT EXISTS propiedad_id uuid;

CREATE INDEX IF NOT EXISTS ventas_propiedad_idx
  ON greenlanderp.ventas (empresa_id, propiedad_id);

SELECT pg_notify('pgrst', 'reload schema');
