-- Precio de copa recomendado por referencia en el catálogo del consultor.
-- Ejecutar en Supabase SQL Editor antes de activar la pestaña Catálogo en el dashboard.
ALTER TABLE public.proveedor_catalogo_vinos
  ADD COLUMN IF NOT EXISTS pvp_copa numeric(10,2) DEFAULT 0;
