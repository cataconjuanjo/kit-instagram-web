-- Diferenciar vinos de otros productos en el catálogo (alimentación, accesorios, etc.)
-- Los productos de Square entran como 'otro' y el admin los mueve a 'vino' si procede.
ALTER TABLE vinos_tienda ADD COLUMN IF NOT EXISTS categoria text DEFAULT 'vino';
CREATE INDEX IF NOT EXISTS idx_vinos_tienda_categoria ON vinos_tienda (categoria);

-- Los registros existentes (creados manualmente) se quedan como 'vino'
UPDATE vinos_tienda SET categoria = 'vino' WHERE categoria IS NULL;
