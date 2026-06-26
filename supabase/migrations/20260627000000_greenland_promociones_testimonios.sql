-- =============================================================================
-- Green Land · módulos públicos para greenlandpy.com
-- - testimonios: editables desde el ERP, mostrados en el home público
-- - promociones: banners tipo "Ofertas exclusivas"
-- - propiedades: agrega campos para matchear el modal del sitio
--                (modalidad, cuotas, servicios, medidas, datos catastrales)
-- Idempotente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TESTIMONIOS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greenlanderp.testimonios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  autor           text NOT NULL,
  rol             text,
  ciudad          text,
  contenido       text NOT NULL,
  foto_url        text,
  calificacion    int  NOT NULL DEFAULT 5 CHECK (calificacion BETWEEN 1 AND 5),
  orden           int  NOT NULL DEFAULT 0,
  activo          boolean NOT NULL DEFAULT true,
  destacado       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS testimonios_empresa_orden_idx
  ON greenlanderp.testimonios (empresa_id, orden ASC, created_at DESC);
CREATE INDEX IF NOT EXISTS testimonios_empresa_activo_idx
  ON greenlanderp.testimonios (empresa_id, activo);

CREATE OR REPLACE FUNCTION greenlanderp.testimonios_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'testimonios_set_updated_at'
      AND tgrelid = 'greenlanderp.testimonios'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER testimonios_set_updated_at
             BEFORE UPDATE ON greenlanderp.testimonios
             FOR EACH ROW EXECUTE FUNCTION greenlanderp.testimonios_set_updated_at()';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- PROMOCIONES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS greenlanderp.promociones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  titulo          text NOT NULL,
  descripcion     text,
  banner_url      text,
  badge           text,                 -- ej "30%", "Barrio cerrado"
  valida_hasta    date,
  cta_label       text DEFAULT 'Quiero esta promoción',
  cta_url         text,
  orden           int  NOT NULL DEFAULT 0,
  activo          boolean NOT NULL DEFAULT true,
  destacada       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promociones_empresa_orden_idx
  ON greenlanderp.promociones (empresa_id, orden ASC, created_at DESC);
CREATE INDEX IF NOT EXISTS promociones_empresa_activo_idx
  ON greenlanderp.promociones (empresa_id, activo);

CREATE OR REPLACE FUNCTION greenlanderp.promociones_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'promociones_set_updated_at'
      AND tgrelid = 'greenlanderp.promociones'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER promociones_set_updated_at
             BEFORE UPDATE ON greenlanderp.promociones
             FOR EACH ROW EXECUTE FUNCTION greenlanderp.promociones_set_updated_at()';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- PROPIEDADES — extensión para matchear el modal de greenlandpy.com
-- ---------------------------------------------------------------------------
ALTER TABLE greenlanderp.propiedades
  ADD COLUMN IF NOT EXISTS modalidad        text,   -- 'Contado' | 'Credito' | etc.
  ADD COLUMN IF NOT EXISTS cuotas_cantidad  int,
  ADD COLUMN IF NOT EXISTS cuota_monto      numeric,
  ADD COLUMN IF NOT EXISTS servicios        jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS medidas          jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS finca            text,
  ADD COLUMN IF NOT EXISTS padron           text,
  ADD COLUMN IF NOT EXISTS cuenta_catastral text;

COMMENT ON COLUMN greenlanderp.propiedades.servicios IS
  'Array de servicios e infraestructura. Ej: ["Agua potable","Energia electrica","Calle","Seguridad 24h","Amojonado","Limpio"]';
COMMENT ON COLUMN greenlanderp.propiedades.medidas IS
  'Objeto con medidas y linderos. Ej: {"norte":{"m":28.29,"linda":"1"},"sur":{"m":28.29,"linda":"Calle TIMBO"},...}';

SELECT pg_notify('pgrst', 'reload schema');
