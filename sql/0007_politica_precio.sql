-- 0007_politica_precio.sql
-- Bloque 7: tabla centralizada de política de precios.
-- Expand-only: CREATE TABLE + seed global.
-- Generado: 2026-09-13. Rama: refactor/catalogo-canonico.

CREATE TABLE IF NOT EXISTS politica_precio (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  ambito            text         NOT NULL CHECK (ambito IN ('global', 'restaurante')),
  restaurante_id    uuid         REFERENCES restaurantes(id) ON DELETE CASCADE,
  margen_objetivo   numeric(5,2) NOT NULL DEFAULT 65,
  copas_por_botella numeric(4,2) NOT NULL DEFAULT 5,
  merma             numeric(5,4) NOT NULL DEFAULT 0.10,
  redondeo_botella  numeric(5,2) NOT NULL DEFAULT 1.00,
  redondeo_copa     numeric(5,2) NOT NULL DEFAULT 0.50,
  copa_min          numeric(6,2) NOT NULL DEFAULT 4.50,
  copa_max          numeric(6,2),
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

-- Política global: un único registro (restaurante_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS politica_precio_global_idx
  ON politica_precio (ambito)
  WHERE restaurante_id IS NULL;

-- Política por restaurante: una fila por restaurante_id
CREATE UNIQUE INDEX IF NOT EXISTS politica_precio_restaurante_idx
  ON politica_precio (restaurante_id)
  WHERE restaurante_id IS NOT NULL;

-- Semilla: política global con los defaults actuales (zero-movement garantizado)
INSERT INTO politica_precio
  (ambito, restaurante_id, margen_objetivo, copas_por_botella, merma, redondeo_botella, redondeo_copa, copa_min)
SELECT 'global', NULL, 65, 5, 0.10, 1.00, 0.50, 4.50
WHERE NOT EXISTS (
  SELECT 1 FROM politica_precio WHERE ambito = 'global' AND restaurante_id IS NULL
);
