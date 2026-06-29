-- =============================================================================
-- Green Land · snapshot de propiedad en ventas
--
-- Cuando se crea una venta linkeada a una propiedad, guardamos en la venta un
-- snapshot de los datos del lote (titulo, codigo, ciudad, barrio, finca,
-- padron, catastral, superficie). De esa forma:
--   - El recibo sigue mostrando los datos del lote vendido aunque la
--     propiedad se borre del catalogo años después.
--   - Auditoría preservada.
--
-- También backfill para ventas ya creadas que tenían propiedad_id pero sin
-- snapshot (de antes de este cambio).
--
-- Idempotente.
-- =============================================================================

ALTER TABLE greenlanderp.ventas
  ADD COLUMN IF NOT EXISTS propiedad_titulo_snapshot           text,
  ADD COLUMN IF NOT EXISTS propiedad_codigo_snapshot           text,
  ADD COLUMN IF NOT EXISTS propiedad_ciudad_snapshot           text,
  ADD COLUMN IF NOT EXISTS propiedad_barrio_snapshot           text,
  ADD COLUMN IF NOT EXISTS propiedad_finca_snapshot            text,
  ADD COLUMN IF NOT EXISTS propiedad_padron_snapshot           text,
  ADD COLUMN IF NOT EXISTS propiedad_cuenta_catastral_snapshot text,
  ADD COLUMN IF NOT EXISTS propiedad_terreno_m2_snapshot       numeric;

-- Backfill: para ventas que tienen propiedad_id pero todavía sin snapshot,
-- copia los datos actuales de la propiedad. Solo donde el snapshot está vacío
-- (no pisa data ya guardada).
UPDATE greenlanderp.ventas v
SET
  propiedad_titulo_snapshot           = p.titulo,
  propiedad_codigo_snapshot           = p.codigo,
  propiedad_ciudad_snapshot           = p.ciudad,
  propiedad_barrio_snapshot           = p.barrio,
  propiedad_finca_snapshot            = p.finca,
  propiedad_padron_snapshot           = p.padron,
  propiedad_cuenta_catastral_snapshot = p.cuenta_catastral,
  propiedad_terreno_m2_snapshot       = p.terreno_m2
FROM greenlanderp.propiedades p
WHERE v.propiedad_id = p.id
  AND v.empresa_id = p.empresa_id
  AND v.propiedad_titulo_snapshot IS NULL;

COMMENT ON COLUMN greenlanderp.ventas.propiedad_titulo_snapshot IS
  'Snapshot del título de la propiedad al momento de la venta. Sobrevive a deletes/updates posteriores de la propiedad.';

SELECT pg_notify('pgrst', 'reload schema');
