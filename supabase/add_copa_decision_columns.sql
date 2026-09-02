-- Añade soporte para la decisión de venta por copa en el simulador de carta.
--
-- pvp_recomendado_catalogo  snapshot del PVP botella sugerido (calculado desde coste_estimado)
--                           en el momento de añadir el vino del catálogo al borrador.
-- pvp_copa_catalogo         snapshot del PVP copa sugerido al añadir del catálogo.
-- ofrecido_por_copa         NULL = pendiente de decidir
--                           true = se vende por copa (precio en precio_copa)
--                           false = se ha decidido que no se vende por copa
--
-- Las tres columnas son nullable y aditivas: filas existentes quedan NULL sin romper nada.

ALTER TABLE public.carta_simulacion
  ADD COLUMN IF NOT EXISTS pvp_recomendado_catalogo numeric(10,2),
  ADD COLUMN IF NOT EXISTS pvp_copa_catalogo         numeric(10,2),
  ADD COLUMN IF NOT EXISTS ofrecido_por_copa         boolean;
