-- Fase K — ROLLBACK destructivo de `consultor_contactos`.
-- NO ejecutar en producción salvo petición explícita del usuario.
-- El código tolera la ausencia de la tabla (degrada: "Sin contactos
-- registrados" y Mi día no emite tareas de contacto), por lo que el
-- rollback no rompe la aplicación.

CREATE SCHEMA IF NOT EXISTS backup_privado;

DO $$
DECLARE
  _fecha text := to_char(now(), 'YYYYMMDD_HH24MISS');
  _existe boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'consultor_contactos'
  ) INTO _existe;
  IF _existe THEN
    EXECUTE format(
      'CREATE TABLE backup_privado.consultor_contactos_predown_%s AS SELECT * FROM public.consultor_contactos',
      _fecha
    );
  END IF;
END $$;

DROP TABLE IF EXISTS public.consultor_contactos;
