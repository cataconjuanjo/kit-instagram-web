-- 0006_favoritos_canonico_rollback.sql
-- Rollback del bloque 6. Ejecutar SOLO si la migración falla a mitad.

DROP INDEX IF EXISTS pcv_favorito_vino_id_idx;
DROP INDEX IF EXISTS pcv_vino_id_idx;

ALTER TABLE proveedor_catalogo_vinos
  DROP COLUMN IF EXISTS motivo,
  DROP COLUMN IF EXISTS restaurante_id,
  DROP COLUMN IF EXISTS ambito,
  DROP COLUMN IF EXISTS vino_id;
