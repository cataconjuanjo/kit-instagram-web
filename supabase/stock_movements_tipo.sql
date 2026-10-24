-- Añade la columna tipo a stock_movements para distinguir el origen del ajuste.
-- Valores esperados: 'manual' (edición admin), 'sync_square_inicial' (script de sync).
-- El DEFAULT null conserva el comportamiento anterior: los registros existentes
-- sin tipo siguen siendo válidos.
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS tipo text;

CREATE INDEX IF NOT EXISTS stock_movements_tipo_idx
  ON stock_movements (tienda_id, tipo, created_at DESC);
