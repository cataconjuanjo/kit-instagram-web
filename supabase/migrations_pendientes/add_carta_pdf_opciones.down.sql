-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK de add_carta_pdf_opciones.up.sql
-- ─────────────────────────────────────────────────────────────────────────
--
-- Elimina la columna `carta_pdf_opciones` de `restaurantes`.
--
-- ATENCIÓN
--   DESCARTA la configuración v2 (fuentes, logos, QR, crédito, etc.) de
--   TODOS los restaurantes que la hayan personalizado. Si quieres
--   preservarlas:
--
--     CREATE SCHEMA IF NOT EXISTS backup_privado;
--     DROP TABLE IF EXISTS backup_privado.restaurantes_rollback_cartaopts;
--     CREATE TABLE backup_privado.restaurantes_rollback_cartaopts AS
--       SELECT id, slug, carta_pdf_opciones
--         FROM public.restaurantes
--        WHERE carta_pdf_opciones IS DISTINCT FROM '{}'::jsonb;
--
-- Las columnas v1 (carta_descripcion, carta_mostrar_copa,
-- carta_incluir_bodega_anada, logo_url, color_fondo, etc.) NO se tocan
-- y siguen produciendo el PDF v1.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.restaurantes
  DROP COLUMN IF EXISTS carta_pdf_opciones;
