-- =============================================================================
-- Green Land · Portal Web para empleados (greenlandpy.com botón "Acceder")
-- Cuentas separadas del ERP. Login email+password (bcrypt) → JWT propio.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS greenlanderp.portal_usuarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  email           text NOT NULL,
  password_hash   text NOT NULL,
  nombre          text NOT NULL,
  rol             text NOT NULL DEFAULT 'empleado',
  activo          boolean NOT NULL DEFAULT true,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_usuarios_empresa_email_idx
  ON greenlanderp.portal_usuarios (empresa_id, lower(email));
CREATE INDEX IF NOT EXISTS portal_usuarios_activo_idx
  ON greenlanderp.portal_usuarios (empresa_id, activo);

CREATE OR REPLACE FUNCTION greenlanderp.portal_usuarios_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'portal_usuarios_set_updated_at'
      AND tgrelid = 'greenlanderp.portal_usuarios'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER portal_usuarios_set_updated_at
             BEFORE UPDATE ON greenlanderp.portal_usuarios
             FOR EACH ROW EXECUTE FUNCTION greenlanderp.portal_usuarios_set_updated_at()';
  END IF;
END $$;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON greenlanderp.portal_usuarios TO authenticated, service_role;

-- Modulo + activacion para el ABM en el sidebar del ERP
INSERT INTO greenlanderp.modulos (slug, nombre, descripcion)
SELECT 'portal_web', 'Portal Web', 'Empleados que acceden desde greenlandpy.com'
WHERE NOT EXISTS (SELECT 1 FROM greenlanderp.modulos WHERE slug = 'portal_web');

INSERT INTO greenlanderp.empresa_modulos (empresa_id, modulo_id, activo)
SELECT e.id, m.id, true
FROM greenlanderp.empresas e
CROSS JOIN greenlanderp.modulos m
WHERE m.slug = 'portal_web'
  AND NOT EXISTS (
    SELECT 1 FROM greenlanderp.empresa_modulos em
    WHERE em.empresa_id = e.id AND em.modulo_id = m.id
  );

UPDATE greenlanderp.empresa_modulos em
SET activo = true
FROM greenlanderp.modulos m
WHERE em.modulo_id = m.id AND m.slug = 'portal_web' AND em.activo = false;

SELECT pg_notify('pgrst', 'reload schema');
