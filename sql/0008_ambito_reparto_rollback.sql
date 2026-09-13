-- 0008_ambito_reparto_rollback.sql
-- Deshace la migración 0008_ambito_reparto.sql

DROP TABLE IF EXISTS proveedor_provincia;

ALTER TABLE restaurantes
  DROP COLUMN IF EXISTS provincia_codigo;

ALTER TABLE proveedores_vino
  DROP COLUMN IF EXISTS ambito_reparto;
