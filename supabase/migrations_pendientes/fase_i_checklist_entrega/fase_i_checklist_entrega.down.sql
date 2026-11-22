-- Fase I — ROLLBACK destructivo. NO ejecutar en producción salvo
-- petición explícita del usuario y con backup previo.
--
-- Borra la columna `restaurantes.checklist_entrega` perdiendo todas
-- las confirmaciones manuales del checklist de entrega. El código
-- tolera la ausencia de la columna (degrada: ítems manuales siempre
-- "Pendiente"), por lo que el rollback NO rompe la aplicación, pero
-- obliga al propietario a re-marcar QR y mapa revisado.

CREATE SCHEMA IF NOT EXISTS backup_privado;

DO $$
DECLARE
  _fecha text := to_char(now(), 'YYYYMMDD_HH24MISS');
  _existe boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'restaurantes' AND column_name = 'checklist_entrega'
  ) INTO _existe;
  IF _existe THEN
    EXECUTE format(
      'CREATE TABLE backup_privado.restaurantes_checklist_predown_%s AS SELECT id, email, checklist_entrega FROM public.restaurantes',
      _fecha
    );
  END IF;
END $$;

ALTER TABLE public.restaurantes
  DROP COLUMN IF EXISTS checklist_entrega;
