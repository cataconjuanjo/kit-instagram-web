-- Fase F — IVA de venta por vino.
-- Idempotente: ADD COLUMN IF NOT EXISTS + backup previo si la columna
-- existía. Patrón aditivo canónico del repo (mismo estilo que
-- fase_c_simulador_margen).

CREATE SCHEMA IF NOT EXISTS backup_privado;

DO $$
DECLARE
  _fecha text := to_char(now(), 'YYYYMMDD_HH24MISS');
  _existe boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vinos' AND column_name = 'iva_pct'
  ) INTO _existe;
  IF _existe THEN
    EXECUTE format(
      'CREATE TABLE backup_privado.vinos_%s AS SELECT id, restaurante_id, nombre, iva_pct FROM public.vinos',
      _fecha
    );
  END IF;
END $$;

ALTER TABLE public.vinos
  ADD COLUMN IF NOT EXISTS iva_pct numeric(4,2);

-- CHECK: NULL permitido (= usa global); valores entre 0 y 30
-- (margen amplio: España tiene 4/10/21; otros países llegan a 27 en Hungría).
-- Nombre explícito para poder quitarlo en el .down sin ambigüedad.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vinos_iva_pct_rango'
  ) THEN
    ALTER TABLE public.vinos
      ADD CONSTRAINT vinos_iva_pct_rango
      CHECK (iva_pct IS NULL OR (iva_pct >= 0 AND iva_pct <= 30));
  END IF;
END $$;

COMMENT ON COLUMN public.vinos.iva_pct IS
  'IVA de venta específico de este vino (%, 0..30). NULL = usa '
  'restaurant_economic_settings.iva_venta_pct del restaurante (default 10).';
