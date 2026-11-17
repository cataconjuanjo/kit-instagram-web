-- ─────────────────────────────────────────────────────────────────────────
-- Fase 5 — permitir `image/webp` en el bucket `facturas-bodega`
-- ─────────────────────────────────────────────────────────────────────────
--
-- Añade 'image/webp' al array `allowed_mime_types` del bucket
-- storage.buckets['facturas-bodega'] SIN pisar los MIME existentes y
-- SIN duplicar si ya estuviera. No toca RLS ni políticas de Storage.
--
-- CARACTERÍSTICAS
--   - ADITIVO: solo añade 'image/webp' si no está ya en el array.
--   - IDEMPOTENTE: re-ejecutar no cambia nada tras el primer paso.
--   - NO destructivo: el resto de MIME (pdf/png/jpeg) quedan intactos.
--   - NO toca public/file_size_limit ni el nombre del bucket.
--   - NO toca RLS ni ninguna policy.
--
-- BACKUP PREVIO (obligatorio; se guarda en el esquema privado
-- `backup_privado`, nunca en `public`):
--
--     CREATE SCHEMA IF NOT EXISTS backup_privado;
--     DROP TABLE IF EXISTS backup_privado.facturas_bucket_pre_webp;
--     CREATE TABLE backup_privado.facturas_bucket_pre_webp AS
--       SELECT * FROM storage.buckets WHERE id = 'facturas-bodega';
--     -- Comprueba una fila copiada:
--     SELECT * FROM backup_privado.facturas_bucket_pre_webp;
--
-- COMPROBACIÓN PREVIA (debe listar los MIME actuales, sin webp):
--     SELECT id, allowed_mime_types
--       FROM storage.buckets
--      WHERE id = 'facturas-bodega';
--
-- COMPROBACIÓN POSTERIOR (debe incluir 'image/webp' además de los demás):
--     SELECT id, allowed_mime_types
--       FROM storage.buckets
--      WHERE id = 'facturas-bodega';
--     -- Esperado:
--     --   {application/pdf,image/png,image/jpeg,image/webp}
-- ─────────────────────────────────────────────────────────────────────────

UPDATE storage.buckets
   SET allowed_mime_types = array_append(allowed_mime_types, 'image/webp')
 WHERE id = 'facturas-bodega'
   AND NOT ('image/webp' = ANY(allowed_mime_types));
