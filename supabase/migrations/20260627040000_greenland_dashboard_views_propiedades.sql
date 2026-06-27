-- =============================================================================
-- Green Land · sustituye la vista 'inventario' por 'propiedades' en el dashboard
-- Idempotente.
-- =============================================================================

INSERT INTO greenlanderp.dashboard_views (slug, nombre, orden)
SELECT 'propiedades', 'Propiedades', 4
WHERE NOT EXISTS (SELECT 1 FROM greenlanderp.dashboard_views WHERE slug = 'propiedades');

-- Activar 'propiedades' en todas las empresas
INSERT INTO greenlanderp.empresa_dashboard_views (empresa_id, dashboard_view_id, activo)
SELECT e.id, dv.id, true
FROM greenlanderp.empresas e
CROSS JOIN greenlanderp.dashboard_views dv
WHERE dv.slug = 'propiedades'
  AND NOT EXISTS (
    SELECT 1 FROM greenlanderp.empresa_dashboard_views edv
    WHERE edv.empresa_id = e.id AND edv.dashboard_view_id = dv.id
  );

UPDATE greenlanderp.empresa_dashboard_views edv
SET activo = true
FROM greenlanderp.dashboard_views dv
WHERE edv.dashboard_view_id = dv.id AND dv.slug = 'propiedades' AND edv.activo = false;

-- Desactivar 'inventario' (queda en el catálogo pero no aparece en el dashboard)
UPDATE greenlanderp.empresa_dashboard_views edv
SET activo = false
FROM greenlanderp.dashboard_views dv
WHERE edv.dashboard_view_id = dv.id AND dv.slug = 'inventario' AND edv.activo = true;

SELECT pg_notify('pgrst', 'reload schema');
