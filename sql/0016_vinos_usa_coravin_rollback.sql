-- Rollback de 0016_vinos_usa_coravin.sql
--
-- IMPORTANTE: solo ejecutar si nadie más depende de public.vinos.usa_coravin.
-- Al dropear la columna se pierden los valores almacenados.

ALTER TABLE public.vinos
  DROP COLUMN IF EXISTS usa_coravin;
