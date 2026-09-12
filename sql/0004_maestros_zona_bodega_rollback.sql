-- 0004_maestros_zona_bodega_rollback.sql
-- Rollback del bloque 4. Ejecutar SOLO si la migración falla a mitad.
-- Elimina las estructuras añadidas; no toca datos de otras columnas.

-- Columnas en proveedor_catalogo_vinos (en orden inverso de dependencia)
ALTER TABLE proveedor_catalogo_vinos
  DROP COLUMN IF EXISTS bodega_pendiente,
  DROP COLUMN IF EXISTS bodega_norm,
  DROP COLUMN IF EXISTS nombre_norm,
  DROP COLUMN IF EXISTS bodega_id,
  DROP COLUMN IF EXISTS zona_id;

-- Tablas (bodega antes que zona; no hay FK de bodega → zona)
DROP TABLE IF EXISTS bodega;
DROP TABLE IF EXISTS zona;

-- Funciones (solo si ningún otro objeto las referencia)
DROP FUNCTION IF EXISTS normalizar_texto(text);
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
