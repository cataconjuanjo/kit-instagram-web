-- Stock mínimo por vino: umbral de alerta de reposición
-- Cuando stock <= stock_minimo se activa la alerta (en lugar de solo stock = 0)

ALTER TABLE vinos_tienda
  ADD COLUMN IF NOT EXISTS stock_minimo integer NOT NULL DEFAULT 0;
