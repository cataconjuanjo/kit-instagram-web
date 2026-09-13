-- 0008_ambito_reparto.sql
-- Bloque 8: ámbito de reparto del proveedor y provincia del restaurante.
-- Expand-only: ADD COLUMN, CREATE TABLE, backfill acotado. Sin DROP ni DELETE.
--
-- INSTRUCCIÓN DE EJECUCIÓN EN SUPABASE SQL EDITOR:
--   El editor valida referencias de columna antes de ejecutar. Ejecutar en DOS PASADAS:
--   PASADA 1 → todo lo marcado "PASADA 1" (DDL)
--   PASADA 2 → todo lo marcado "PASADA 2" (DML + NOT NULL)

-- ── PASADA 1: DDL ─────────────────────────────────────────────────────────────

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

-- ── PASADA 2: DML + NOT NULL ──────────────────────────────────────────────────

-- 4. Backfill: provincia confirmada por id estable (no por nombre)
UPDATE restaurantes SET provincia_codigo = '29' WHERE id = 'db3af496-00f1-4295-82b6-35427b9b6286'; -- Lo de Carmen
UPDATE restaurantes SET provincia_codigo = '29' WHERE id = 'a4346301-4dc5-4cb5-a2f5-3ca6469acd66'; -- La Taberna del Puerto
UPDATE restaurantes SET provincia_codigo = '28' WHERE id = '6b528438-3d24-432d-9728-dc2ff868baf6'; -- Modo Sumiller

-- 5. Sentinel '00' para restaurantes cuya provincia se desconoce
UPDATE restaurantes
  SET provincia_codigo = '00'
WHERE provincia_codigo IS NULL;

-- 6. Con todos los registros rellenos, aplicar NOT NULL
ALTER TABLE restaurantes
  ALTER COLUMN provincia_codigo SET NOT NULL;
