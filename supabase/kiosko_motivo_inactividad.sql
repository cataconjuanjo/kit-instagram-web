-- P1-4: columna motivo de inactividad para los vinos retirados temporalmente
-- Aditivo y nullable. Valores sugeridos: 'sin_stock' | 'retirado' |
-- 'descatalogado' | 'otro'. Se expresa como TEXT (no enum) para evitar un
-- nuevo tipo de datos y permitir valores futuros sin migración.
-- Aditivo. El código del admin ya detecta si la columna existe y degrada
-- a la UI sin selector si la migración todavía no se ha aplicado.
-- Aplica con: supabase db push  o  ejecutar en SQL editor.

ALTER TABLE vinos_tienda
  ADD COLUMN IF NOT EXISTS motivo_inactividad TEXT NULL;

-- Índice parcial para que el filtro "Inactivos por motivo" sea rápido.
CREATE INDEX IF NOT EXISTS idx_vinos_tienda_motivo_inactividad
  ON vinos_tienda(tienda_id, motivo_inactividad)
  WHERE motivo_inactividad IS NOT NULL;

-- CHECK opcional. Déjalo comentado si quieres permitir valores libres
-- (recomendado hasta que el admin estabilice la UI del selector).
-- ALTER TABLE vinos_tienda
--   ADD CONSTRAINT vinos_tienda_motivo_inactividad_check
--   CHECK (motivo_inactividad IS NULL
--          OR motivo_inactividad IN ('sin_stock','retirado','descatalogado','otro'));
