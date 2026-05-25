-- ═══════════════════════════════════════════════════════════════
-- FORMATO DE PRECIOS EN CARTA PÚBLICA
--
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- Añade tres columnas a restaurantes:
--   carta_mostrar_euro     → muestra/oculta símbolo € junto al precio
--   carta_copa_decimales   → muestra/oculta decimales en precio por copa
--   carta_pie_texto        → texto legal personalizado al pie de carta
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS carta_mostrar_euro    boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS carta_copa_decimales  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS carta_pie_texto       text;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- SELECT id, nombre, carta_mostrar_euro, carta_copa_decimales, carta_pie_texto
-- FROM restaurantes
-- LIMIT 5;
-- ═══════════════════════════════════════════════════════════════
