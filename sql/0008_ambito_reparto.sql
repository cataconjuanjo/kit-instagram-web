-- 0008_ambito_reparto.sql
-- Bloque 8: ámbito de reparto del proveedor y provincia del restaurante.
-- Expand-only: ADD COLUMN, CREATE TABLE, backfill acotado. Sin DROP ni DELETE.

-- 1. Ámbito de reparto del proveedor (nacional por defecto → zero-movement)
ALTER TABLE proveedores_vino
  ADD COLUMN IF NOT EXISTS ambito_reparto text NOT NULL DEFAULT 'nacional'
    CHECK (ambito_reparto IN ('nacional', 'provincias'));

-- 2. Tabla de provincias por proveedor (código INE de 2 dígitos)
CREATE TABLE IF NOT EXISTS proveedor_provincia (
  proveedor_id     uuid NOT NULL REFERENCES proveedores_vino(id) ON DELETE CASCADE,
  provincia_codigo text NOT NULL CHECK (length(provincia_codigo) = 2),
  PRIMARY KEY (proveedor_id, provincia_codigo)
);

CREATE INDEX IF NOT EXISTS proveedor_provincia_codigo_idx
  ON proveedor_provincia (provincia_codigo);

-- 3. Código de provincia INE del restaurante (nullable primero para el backfill)
ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS provincia_codigo text;

-- 4. Backfill: los tres restaurantes activos son todos Málaga (INE 29)
UPDATE restaurantes
  SET provincia_codigo = '29'
WHERE nombre ILIKE '%carmen%'
   OR nombre ILIKE '%sumiller%'
   OR (nombre ILIKE '%taberna%' AND nombre ILIKE '%puerto%');

-- 5. Sentinel '00' para restaurantes cuya provincia se desconoce
UPDATE restaurantes
  SET provincia_codigo = '00'
WHERE provincia_codigo IS NULL;

-- 6. Con todos los registros rellenos, aplicar NOT NULL
ALTER TABLE restaurantes
  ALTER COLUMN provincia_codigo SET NOT NULL;
