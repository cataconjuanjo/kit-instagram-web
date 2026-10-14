-- Rollback de b6_margen_minimo.sql
BEGIN;
ALTER TABLE public.restaurant_economic_settings DROP COLUMN IF EXISTS margen_minimo_pct;
NOTIFY pgrst, 'reload schema';
COMMIT;
