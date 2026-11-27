-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK de add_carta_pdf.up.sql
-- ─────────────────────────────────────────────────────────────────────────
--
-- Elimina las dos columnas añadidas por la migración `add_carta_pdf`.
--
-- ATENCIÓN
--   Esto DESCARTA cualquier texto de descripción y preferencia de "mostrar
--   copa" que algún restaurante haya guardado. Si quieres preservar esos
--   datos, haz backup antes:
--
--     CREATE SCHEMA IF NOT EXISTS backup_privado;
--     DROP TABLE IF EXISTS backup_privado.restaurantes_rollback_carta_pdf;
--     CREATE TABLE backup_privado.restaurantes_rollback_carta_pdf AS
--       SELECT id, slug, carta_descripcion, carta_mostrar_copa
--         FROM public.restaurantes
--        WHERE carta_descripcion IS NOT NULL
--           OR carta_mostrar_copa IS DISTINCT FROM true;
--
-- IDEMPOTENTE: usa DROP COLUMN IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.restaurantes
  DROP COLUMN IF EXISTS carta_descripcion;

ALTER TABLE public.restaurantes
  DROP COLUMN IF EXISTS carta_mostrar_copa;
