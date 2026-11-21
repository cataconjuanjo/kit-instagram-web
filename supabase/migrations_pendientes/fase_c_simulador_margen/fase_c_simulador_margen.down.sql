-- DOWN de la Fase C. DESTRUCTIVO.
--
-- Borra la tabla simulador_margen_bodega y sus políticas RLS. Pierde
-- todos los supuestos del simulador guardados por los usuarios.
--
-- Antes de ejecutar: confirma que existe un backup reciente en
-- backup_privado.simulador_margen_bodega_YYYYMMDD. El .up.sql deja
-- uno automáticamente si la tabla existía al aplicar la migración,
-- pero NO deja uno si lo ejecutas tras la primera creación.
--
-- No ejecutar en producción salvo petición explícita y con backup.

DO $$
DECLARE
  _fecha text := to_char(now(), 'YYYYMMDD_HH24MISS');
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'simulador_margen_bodega'
  ) THEN
    -- Backup defensivo antes de borrar.
    CREATE SCHEMA IF NOT EXISTS backup_privado;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS backup_privado.simulador_margen_bodega_down_%s AS SELECT * FROM public.simulador_margen_bodega',
      _fecha
    );
  END IF;
END $$;

DROP POLICY IF EXISTS "auth_simulador_margen_bodega_select" ON public.simulador_margen_bodega;
DROP POLICY IF EXISTS "auth_simulador_margen_bodega_insert" ON public.simulador_margen_bodega;
DROP POLICY IF EXISTS "auth_simulador_margen_bodega_update" ON public.simulador_margen_bodega;
DROP POLICY IF EXISTS "auth_simulador_margen_bodega_delete" ON public.simulador_margen_bodega;

DROP TABLE IF EXISTS public.simulador_margen_bodega;
