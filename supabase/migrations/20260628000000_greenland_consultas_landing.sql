-- =============================================================================
-- Green Land · tabla de consultas que vienen de la landing greenlandpy.com
-- Captura intencionalidad de leads sobre promociones y propiedades.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS greenlanderp.consultas_landing (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  tipo            text NOT NULL CHECK (tipo IN ('promocion','propiedad')),
  entidad_id      uuid,
  entidad_titulo  text,
  nombre          text NOT NULL,
  telefono        text NOT NULL,
  mensaje         text,
  ip              text,
  user_agent      text,
  origen          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consultas_landing_empresa_created_idx
  ON greenlanderp.consultas_landing (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS consultas_landing_entidad_idx
  ON greenlanderp.consultas_landing (empresa_id, tipo, entidad_id);
CREATE INDEX IF NOT EXISTS consultas_landing_ip_created_idx
  ON greenlanderp.consultas_landing (ip, created_at DESC);

COMMENT ON TABLE greenlanderp.consultas_landing IS
  'Leads capturados desde greenlandpy.com al hacer click en CTA de promociones o propiedades. tipo + entidad_id identifican qué les interesó.';

SELECT pg_notify('pgrst', 'reload schema');
