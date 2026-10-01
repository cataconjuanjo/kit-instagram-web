-- Rollback de auto_featured.sql
ALTER TABLE public.tiendas
  DROP COLUMN IF EXISTS auto_featured_enabled,
  DROP COLUMN IF EXISTS auto_featured_n,
  DROP COLUMN IF EXISTS auto_featured_max_tipo;
