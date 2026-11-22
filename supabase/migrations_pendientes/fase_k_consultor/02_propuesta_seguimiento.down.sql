-- Fase K — ROLLBACK destructivo de `consultor_propuesta_seguimiento`.
-- NO ejecutar en producción salvo petición explícita del usuario.
-- El código tolera la ausencia de la tabla (degrada: la pestaña
-- Propuestas no muestra el cuadro de seguimiento, pero sigue funcionando).

CREATE SCHEMA IF NOT EXISTS backup_privado;

DO $$
DECLARE
  _fecha text := to_char(now(), 'YYYYMMDD_HH24MISS');
  _existe boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'consultor_propuesta_seguimiento'
  ) INTO _existe;
  IF _existe THEN
    EXECUTE format(
      'CREATE TABLE backup_privado.consultor_propuesta_seguimiento_predown_%s AS SELECT * FROM public.consultor_propuesta_seguimiento',
      _fecha
    );
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_consultor_prop_seg_updated_at
  ON public.consultor_propuesta_seguimiento;
DROP FUNCTION IF EXISTS public.set_updated_at_consultor_prop_seg();
DROP TABLE IF EXISTS public.consultor_propuesta_seguimiento;
