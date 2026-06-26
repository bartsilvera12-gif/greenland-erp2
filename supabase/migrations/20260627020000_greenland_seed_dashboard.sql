-- =============================================================================
-- Green Land · activa el slug 'dashboard' en empresa_modulos
-- El route "/" del ERP exige el slug 'dashboard' aunque no aparezca en el
-- sidebar. Sin esto, redirige a "Modulo no habilitado". Idempotente.
-- =============================================================================

INSERT INTO greenlanderp.modulos (slug, nombre, descripcion)
SELECT 'dashboard', 'Dashboard', 'Pagina de inicio del ERP'
WHERE NOT EXISTS (SELECT 1 FROM greenlanderp.modulos WHERE slug = 'dashboard');

INSERT INTO greenlanderp.empresa_modulos (empresa_id, modulo_id, activo)
SELECT e.id, m.id, true
FROM greenlanderp.empresas e
CROSS JOIN greenlanderp.modulos m
WHERE m.slug = 'dashboard'
  AND NOT EXISTS (
    SELECT 1 FROM greenlanderp.empresa_modulos em
    WHERE em.empresa_id = e.id AND em.modulo_id = m.id
  );

UPDATE greenlanderp.empresa_modulos em
SET activo = true
FROM greenlanderp.modulos m
WHERE em.modulo_id = m.id AND m.slug = 'dashboard' AND em.activo = false;

SELECT pg_notify('pgrst', 'reload schema');
