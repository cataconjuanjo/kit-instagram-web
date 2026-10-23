-- Permite configurar por tienda si los vinos sin stock se ocultan del kiosko público.
-- DEFAULT true conserva el comportamiento actual (ocultar cuando stock=0).
-- Con false: el vino permanece visible en el catálogo con etiqueta "Consultar disponibilidad"
-- y la RPC apply_payment_lines no desactiva activo al llegar a stock=0.
ALTER TABLE tiendas
  ADD COLUMN IF NOT EXISTS ocultar_agotados boolean NOT NULL DEFAULT true;
