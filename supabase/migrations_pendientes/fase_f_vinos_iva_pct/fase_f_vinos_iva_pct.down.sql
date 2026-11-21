-- DOWN de la Fase F — DESTRUCTIVO.
-- Borra la columna vinos.iva_pct. Todos los valores no-NULL se
-- PIERDEN; vinos que tuvieran IVA específico pasan a netearse con
-- el global (restaurant_economic_settings.iva_venta_pct) desde la
-- próxima agregación.
--
-- Antes de ejecutar: confirma que hay backup reciente en
-- backup_privado.vinos_YYYYMMDD_HHMMSS. El .up.sql deja uno
-- automáticamente si la columna existía al aplicar; este .down.sql
-- deja otro defensivo previo al borrado.

DO $$
DECLARE
  _fecha text := to_char(now(), 'YYYYMMDD_HH24MISS');
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vinos' AND column_name = 'iva_pct'
  ) THEN
    CREATE SCHEMA IF NOT EXISTS backup_privado;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS backup_privado.vinos_down_%s AS SELECT id, restaurante_id, nombre, iva_pct FROM public.vinos',
      _fecha
    );
  END IF;
END $$;

ALTER TABLE public.vinos DROP CONSTRAINT IF EXISTS vinos_iva_pct_rango;
ALTER TABLE public.vinos DROP COLUMN IF EXISTS iva_pct;
