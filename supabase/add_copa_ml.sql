-- Cantidad en ml por copa, configurable por vino
ALTER TABLE public.vinos
  ADD COLUMN IF NOT EXISTS copa_ml integer;
