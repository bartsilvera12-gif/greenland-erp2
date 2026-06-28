-- =============================================================================
-- Green Land · grants faltantes en tablas creadas via migracion
-- Sin esto, el cliente JWT-auth de Supabase (rol `authenticated`) recibe
-- "permission denied" al hacer SELECT/INSERT/UPDATE/DELETE sobre las tablas
-- nuevas (promociones, testimonios, consultas_landing). Idempotente.
-- =============================================================================

GRANT USAGE ON SCHEMA greenlanderp TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON greenlanderp.promociones        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON greenlanderp.testimonios        TO authenticated, service_role;
GRANT SELECT, INSERT                 ON greenlanderp.consultas_landing  TO authenticated, service_role;

-- Lectura publica para los endpoints /api/public/* (anon role).
GRANT SELECT ON greenlanderp.promociones  TO anon;
GRANT SELECT ON greenlanderp.testimonios  TO anon;
GRANT SELECT ON greenlanderp.propiedades  TO anon;

SELECT pg_notify('pgrst', 'reload schema');
