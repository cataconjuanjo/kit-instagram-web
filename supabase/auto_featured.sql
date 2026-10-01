-- Destacados automáticos por margen: ajustes de configuración por tienda.
-- Expand-only: solo ADD COLUMN, nunca DROP ni UPDATE masivo.
ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS auto_featured_enabled  BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_featured_n         SMALLINT NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS auto_featured_max_tipo  SMALLINT NOT NULL DEFAULT 3;
