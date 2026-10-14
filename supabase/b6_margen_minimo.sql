-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B6 · Simulador de margen mínimo                                         ║
-- ║                                                                          ║
-- ║  Añade margen_minimo_pct a restaurant_economic_settings.                 ║
-- ║  NULL = sin configurar (no muestra tabla en el panel).                   ║
-- ║  CHECK: 0 < x < 100 (margen positivo y real).                            ║
-- ║                                                                          ║
-- ║  Rollback: b6_margen_minimo_rollback.sql                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

ALTER TABLE public.restaurant_economic_settings
  ADD COLUMN IF NOT EXISTS margen_minimo_pct NUMERIC(6,2)
    CHECK (margen_minimo_pct IS NULL OR (margen_minimo_pct > 0 AND margen_minimo_pct < 100));

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Rollback (conservado en b6_margen_minimo_rollback.sql):
--   ALTER TABLE public.restaurant_economic_settings DROP COLUMN IF EXISTS margen_minimo_pct;
