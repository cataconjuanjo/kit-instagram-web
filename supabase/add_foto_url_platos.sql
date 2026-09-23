-- Añade foto_url nullable a la tabla platos.
-- Si es null el plato se muestra exactamente igual que hasta ahora (sin hueco ni placeholder).
-- Compatible con todos los restaurantes existentes: sus platos quedan con null y no cambia nada.

ALTER TABLE public.platos
ADD COLUMN IF NOT EXISTS foto_url text;

COMMENT ON COLUMN public.platos.foto_url IS
  'URL de imagen del plato. Opcional — null = sin foto, mismo comportamiento que antes.';
