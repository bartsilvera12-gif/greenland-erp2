-- =============================================================================
-- Green Land · siembra las 4 vistas estándar del dashboard
-- Catalogo: dashboard_views (comercial, financiero, inventario, ventas)
-- Activacion: empresa_dashboard_views para todas las empresas existentes.
-- Idempotente.
-- =============================================================================

INSERT INTO greenlanderp.dashboard_views (slug, nombre, orden)
SELECT v.slug, v.nombre, v.orden
FROM (VALUES
  ('ventas',      'Ventas',      1),
  ('comercial',   'Comercial',   2),
  ('financiero',  'Financiero',  3),
  ('inventario',  'Inventario',  4)
) AS v(slug, nombre, orden)
WHERE NOT EXISTS (
  SELECT 1 FROM greenlanderp.dashboard_views dv WHERE dv.slug = v.slug
);

INSERT INTO greenlanderp.empresa_dashboard_views (empresa_id, dashboard_view_id, activo)
SELECT e.id, dv.id, true
FROM greenlanderp.empresas e
CROSS JOIN greenlanderp.dashboard_views dv
WHERE dv.slug IN ('ventas','comercial','financiero','inventario')
  AND NOT EXISTS (
    SELECT 1 FROM greenlanderp.empresa_dashboard_views edv
    WHERE edv.empresa_id = e.id AND edv.dashboard_view_id = dv.id
  );

UPDATE greenlanderp.empresa_dashboard_views edv
SET activo = true
FROM greenlanderp.dashboard_views dv
WHERE edv.dashboard_view_id = dv.id
  AND dv.slug IN ('ventas','comercial','financiero','inventario')
  AND edv.activo = false;

SELECT pg_notify('pgrst', 'reload schema');
