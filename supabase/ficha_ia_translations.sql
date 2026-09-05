-- Caché de fichas IA traducidas (EN / FR / DE)
-- La columna ficha_ia (ES) ya existe; estas tres son opcionales.
-- Aplica con: ejecutar en SQL editor de Supabase
ALTER TABLE vinos_tienda
  ADD COLUMN IF NOT EXISTS ficha_ia_en TEXT,
  ADD COLUMN IF NOT EXISTS ficha_ia_fr TEXT,
  ADD COLUMN IF NOT EXISTS ficha_ia_de TEXT;
