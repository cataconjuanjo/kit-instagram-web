ALTER TABLE vinos_tienda
  ADD COLUMN IF NOT EXISTS square_stock_calculated_at timestamptz;
