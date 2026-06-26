-- Agrega columna `imagen_path` a greenlanderp.propiedades para guardar la foto
-- de portada (path en Supabase Storage bucket `propiedades-imagenes`).
-- Idempotente: ADD COLUMN IF NOT EXISTS.

ALTER TABLE greenlanderp.propiedades
  ADD COLUMN IF NOT EXISTS imagen_path text;

COMMENT ON COLUMN greenlanderp.propiedades.imagen_path IS
  'Path en bucket propiedades-imagenes con la foto de portada. Formato: {empresa_id}/{propiedad_id}/principal.{ext}';
