-- Reemplaza los índices UNIQUE parciales de Square por índices completos.
--
-- El problema: los índices parciales (WHERE col IS NOT NULL) no son válidos como
-- conflict target para ON CONFLICT (col1, col2) sin cláusula WHERE — que es lo que
-- genera el cliente de Supabase. Resultado: el upsert caía a INSERT limpio y creaba
-- duplicados al cambiar de IDs (sandbox → producción, migración de cuenta, etc.).
--
-- La solución: índices UNIQUE no parciales. PostgreSQL trata los NULLs como distintos
-- entre sí, por lo que múltiples filas con square_variation_id = NULL son válidas.
--
-- IMPORTANTE: ejecutar DESPUÉS de limpiar los duplicados existentes. Si hay filas
-- con el mismo (tienda_id, square_variation_id) no-null, la creación fallará.

DROP INDEX IF EXISTS idx_vinos_tienda_square_variation;
DROP INDEX IF EXISTS idx_vinos_tienda_square_catalog;

CREATE UNIQUE INDEX idx_vinos_tienda_square_variation
  ON vinos_tienda(tienda_id, square_variation_id);

CREATE UNIQUE INDEX idx_vinos_tienda_square_catalog
  ON vinos_tienda(tienda_id, square_catalog_id);
