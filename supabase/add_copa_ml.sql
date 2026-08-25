-- Cantidad en ml por copa en carta pública
ALTER TABLE public.restaurantes
  ADD COLUMN IF NOT EXISTS copa_ml integer;
