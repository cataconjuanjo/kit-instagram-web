-- 0016_vinos_usa_coravin.sql
--
-- Añade la columna public.vinos.usa_coravin (boolean, default false).
-- La columna ya está definida en supabase/add_carta_viva_somm.sql:9 pero
-- esa migración no se aplicó en producción (deriva de esquema). El error
-- observado en Motor de Precios era:
--   [precios-somm] vinos: { code: "42703", message: "column vinos.ml does not exist" }
-- Nota: el error citaba "ml" porque Postgres reportó el PRIMER campo
-- inexistente del SELECT; el código también pedía usa_coravin. Esta
-- migración resuelve usa_coravin. El typo "ml" se arregla en el código
-- (nunca existió esa columna; la helper copasEstandarPorFormato espera
-- ml de la botella y asume 750 por defecto).
--
-- IDEMPOTENTE: usa ADD COLUMN IF NOT EXISTS. No toca RLS ni vistas:
-- añadir una columna con default no invalida políticas existentes ni
-- índices; PostgreSQL lo gestiona como metadato en PG 11+ (sin rewrite).
--
-- Aplicar:  psql "$DATABASE_URL" -f sql/0016_vinos_usa_coravin.sql
-- Rollback: psql "$DATABASE_URL" -f sql/0016_vinos_usa_coravin_rollback.sql

ALTER TABLE public.vinos
  ADD COLUMN IF NOT EXISTS usa_coravin boolean NOT NULL DEFAULT false;

-- Verificación opcional tras aplicar:
--   SELECT column_name, data_type, column_default, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'vinos' AND column_name = 'usa_coravin';
