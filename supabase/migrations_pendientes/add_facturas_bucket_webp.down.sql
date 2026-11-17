-- ─────────────────────────────────────────────────────────────────────────
-- Fase 5 — rollback: quitar `image/webp` del bucket `facturas-bodega`
-- ─────────────────────────────────────────────────────────────────────────
--
-- Elimina 'image/webp' del array `allowed_mime_types` SIN tocar el resto.
--
-- EFECTO EN EL CÓDIGO
--   El endpoint /api/facturas/extraer sigue aceptando `image/webp` a
--   nivel de validación, pero el upload a Storage lo rechazará. El
--   código detecta ese error de MIME y devuelve 415 amistoso ("Formato
--   no admitido todavía"), no un 500. La extracción NO se rompe para
--   el resto de formatos.
--
-- BACKUP PREVIO (obligatorio; esquema privado):
--
--     CREATE SCHEMA IF NOT EXISTS backup_privado;
--     DROP TABLE IF EXISTS backup_privado.facturas_bucket_pre_rollback_webp;
--     CREATE TABLE backup_privado.facturas_bucket_pre_rollback_webp AS
--       SELECT * FROM storage.buckets WHERE id = 'facturas-bodega';
--
-- COMPROBACIÓN PREVIA (debe incluir 'image/webp'):
--     SELECT id, allowed_mime_types
--       FROM storage.buckets
--      WHERE id = 'facturas-bodega';
--
-- COMPROBACIÓN POSTERIOR (no debe incluir 'image/webp'):
--     SELECT id, allowed_mime_types
--       FROM storage.buckets
--      WHERE id = 'facturas-bodega';
-- ─────────────────────────────────────────────────────────────────────────

UPDATE storage.buckets
   SET allowed_mime_types = array_remove(allowed_mime_types, 'image/webp')
 WHERE id = 'facturas-bodega'
   AND ('image/webp' = ANY(allowed_mime_types));
