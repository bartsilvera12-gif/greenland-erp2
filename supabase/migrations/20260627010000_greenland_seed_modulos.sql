-- =============================================================================
-- Green Land · seed de modulos para sidebar
-- Registra los 6 modulos visibles (venta, clientes, promociones, propiedades,
-- reportes, testimonios) en el catalogo y los activa para TODAS las empresas
-- del schema. Idempotente.
-- =============================================================================

-- 1) Catalogo de modulos
INSERT INTO greenlanderp.modulos (slug, nombre, descripcion)
SELECT v.slug, v.nombre, v.descripcion
FROM (VALUES
  ('ventas',       'Venta',        'Cobro y facturacion'),
  ('clientes',     'Clientes',     'ABM de clientes'),
  ('promociones',  'Promociones',  'Banners de ofertas para greenlandpy.com'),
  ('propiedades',  'Propiedades',  'Catalogo inmobiliario'),
  ('reportes',     'Reportes',     'Reportes y dashboards'),
  ('testimonios',  'Testimonios',  'Resenias para greenlandpy.com')
) AS v(slug, nombre, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM greenlanderp.modulos m WHERE m.slug = v.slug);

-- 2) Activar para todas las empresas existentes
INSERT INTO greenlanderp.empresa_modulos (empresa_id, modulo_id, activo)
SELECT e.id, m.id, true
FROM greenlanderp.empresas e
CROSS JOIN greenlanderp.modulos m
WHERE m.slug IN ('ventas','clientes','promociones','propiedades','reportes','testimonios')
  AND NOT EXISTS (
    SELECT 1 FROM greenlanderp.empresa_modulos em
    WHERE em.empresa_id = e.id AND em.modulo_id = m.id
  );

-- 3) Si ya estaban inactivos por una corrida anterior, reactivar
UPDATE greenlanderp.empresa_modulos em
SET activo = true
FROM greenlanderp.modulos m
WHERE em.modulo_id = m.id
  AND m.slug IN ('promociones','testimonios','reportes')
  AND em.activo = false;

SELECT pg_notify('pgrst', 'reload schema');
