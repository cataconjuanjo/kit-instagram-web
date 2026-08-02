-- Activa/desactiva la cesta regalo por tienda (feature flag por tienda, beta)
ALTER TABLE tiendas
  ADD COLUMN IF NOT EXISTS cesta_activa boolean DEFAULT false;

-- Las tres columnas que necesita la lógica de productos gourmet
ALTER TABLE vinos_tienda
  ADD COLUMN IF NOT EXISTS apto_cesta  boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS es_vegano   boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS con_alcohol boolean DEFAULT NULL;
