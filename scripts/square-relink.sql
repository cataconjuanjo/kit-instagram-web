-- ============================================================
-- SIBARIS GOURMET · LA LAGUNA — Reenlace del catálogo Square
-- Ejecutar en Supabase SQL Editor, una sección a la vez.
-- tienda_id: 8e2007d5-b167-4cd6-84bf-80f820fb970a
-- location:  LZEJNCEFTG3JY
-- ============================================================

-- ============================================================
-- PHASE 01 · Copia de seguridad
-- (ejecutar antes de cualquier otra cosa)
-- ============================================================

CREATE TABLE vinos_tienda_backup_20260906 AS
SELECT * FROM vinos_tienda
WHERE tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a';

SELECT COUNT(*) AS total_backup FROM vinos_tienda_backup_20260906;
-- ✓ Anota este número: debe coincidir con el total de filas vivas de la tienda.


-- ============================================================
-- PHASE 02 SETUP · Tabla square_snapshot
-- (ejecutar antes de lanzar el script square-snapshot.mjs)
-- ============================================================

CREATE TABLE IF NOT EXISTS square_sync_orphans (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tienda_id           uuid        NOT NULL,
  square_catalog_id   text,
  square_variation_id text,
  nombre              text,
  precio              numeric(10,2),
  accion              text        NOT NULL,
  revisado            boolean     NOT NULL DEFAULT false,
  synced_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_square_sync_orphans_tienda
  ON square_sync_orphans (tienda_id, synced_at DESC);

CREATE TABLE IF NOT EXISTS square_snapshot (
  tienda_id     uuid        NOT NULL,
  variation_id  text        NOT NULL,
  catalog_id    text        NOT NULL,
  nombre        text,
  precio        numeric(10,2),
  stock         integer,
  capturado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tienda_id, variation_id)
);

-- Ahora lanza: node scripts/square-snapshot.mjs
-- Verifica que el número de filas ronda las ~1.340 variaciones:
SELECT COUNT(*) AS variaciones_capturadas FROM square_snapshot
WHERE tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a';


-- ============================================================
-- PHASE 03 · Clasificar filas (solo lectura — no modifica nada)
-- ============================================================

-- A · correctas: su variation_id existe hoy en Square
SELECT COUNT(*) AS a_correctas
FROM vinos_tienda v
JOIN square_snapshot s
  ON s.tienda_id = v.tienda_id AND s.variation_id = v.square_variation_id
WHERE v.tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a';

-- B · huérfanas: apuntan a un variation_id que ya no existe
SELECT COUNT(*) AS b_huerfanas
FROM vinos_tienda v
LEFT JOIN square_snapshot s
  ON s.tienda_id = v.tienda_id AND s.variation_id = v.square_variation_id
WHERE v.tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a'
  AND s.variation_id IS NULL;

-- C · artículos de Square sin fila en la base de datos
SELECT COUNT(*) AS c_faltantes
FROM square_snapshot s
LEFT JOIN vinos_tienda v
  ON v.tienda_id = s.tienda_id AND v.square_variation_id = s.variation_id
WHERE s.tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a'
  AND v.id IS NULL;

-- ✓ Verifica: A + B = total del backup. Anota los tres números.


-- ============================================================
-- PHASE 04 · Proponer reenlaces inequívocos (no modifica nada)
-- ============================================================

DROP TABLE IF EXISTS relink_propuesto;
CREATE TABLE relink_propuesto AS
WITH huerfanas AS (
  SELECT v.id, v.nombre, v.precio_pvp
  FROM vinos_tienda v
  LEFT JOIN square_snapshot s
    ON s.tienda_id = v.tienda_id AND s.variation_id = v.square_variation_id
  WHERE v.tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a'
    AND s.variation_id IS NULL
),
faltantes AS (
  SELECT s.variation_id, s.catalog_id, s.nombre, s.precio, s.stock
  FROM square_snapshot s
  LEFT JOIN vinos_tienda v
    ON v.tienda_id = s.tienda_id AND v.square_variation_id = s.variation_id
  WHERE s.tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a'
    AND v.id IS NULL
),
cand AS (
  SELECT h.id AS vino_id, h.nombre AS nombre_bd,
         f.variation_id, f.catalog_id, f.nombre AS nombre_square,
         f.precio, f.stock,
         COUNT(*) OVER (PARTITION BY h.id)           AS candidatos_por_fila,
         COUNT(*) OVER (PARTITION BY f.variation_id) AS filas_por_articulo
  FROM huerfanas h
  JOIN faltantes f
    ON lower(btrim(h.nombre)) = lower(btrim(f.nombre))
   AND h.precio_pvp = f.precio
)
SELECT * FROM cand
WHERE candidatos_por_fila = 1 AND filas_por_articulo = 1;

-- Lo ambiguo, aparte (para revisión humana, no se toca):
DROP TABLE IF EXISTS relink_revision;
CREATE TABLE relink_revision AS
WITH huerfanas AS (
  SELECT v.id, v.nombre, v.precio_pvp
  FROM vinos_tienda v
  LEFT JOIN square_snapshot s
    ON s.tienda_id = v.tienda_id AND s.variation_id = v.square_variation_id
  WHERE v.tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a'
    AND s.variation_id IS NULL
),
faltantes AS (
  SELECT s.variation_id, s.catalog_id, s.nombre, s.precio, s.stock
  FROM square_snapshot s
  LEFT JOIN vinos_tienda v
    ON v.tienda_id = s.tienda_id AND v.square_variation_id = s.variation_id
  WHERE s.tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a'
    AND v.id IS NULL
),
cand AS (
  SELECT h.id AS vino_id, h.nombre AS nombre_bd,
         f.variation_id, f.catalog_id, f.nombre AS nombre_square,
         f.precio, f.stock,
         COUNT(*) OVER (PARTITION BY h.id)           AS candidatos_por_fila,
         COUNT(*) OVER (PARTITION BY f.variation_id) AS filas_por_articulo
  FROM huerfanas h
  JOIN faltantes f
    ON lower(btrim(h.nombre)) = lower(btrim(f.nombre))
   AND h.precio_pvp = f.precio
)
SELECT * FROM cand
WHERE candidatos_por_fila > 1 OR filas_por_articulo > 1;

-- ✓ Revisa ambas tablas:
SELECT COUNT(*) AS inequivocos FROM relink_propuesto;
SELECT COUNT(*) AS ambiguos    FROM relink_revision;
SELECT * FROM relink_propuesto LIMIT 10;
SELECT * FROM relink_revision  LIMIT 10;
-- Si algo en relink_propuesto no te cuadra, bórralo antes de Phase 05:
-- DELETE FROM relink_propuesto WHERE vino_id = '...';


-- ============================================================
-- PHASE 05 · Aplicar reenlaces (MODIFICA DATOS — reversible con backup)
-- ============================================================

-- Primero: confirma que el número de filas a actualizar es el esperado
SELECT COUNT(*) AS filas_a_actualizar FROM relink_propuesto;

BEGIN;

UPDATE vinos_tienda v
SET square_variation_id = r.variation_id,
    square_catalog_id   = r.catalog_id,
    stock               = r.stock,
    square_last_seen_at = now(),
    updated_at          = now()
FROM relink_propuesto r
WHERE v.id = r.vino_id;

-- COMMIT solo si el número de filas afectadas coincide exactamente con COUNT(*) de relink_propuesto.
-- Si no coincide: ROLLBACK y para.
COMMIT;


-- ============================================================
-- PHASE 06 · Retirar lo que ya no existe en Square (MODIFICA DATOS)
-- ============================================================

BEGIN;

UPDATE vinos_tienda v
SET activo = false, updated_at = now()
WHERE v.tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a'
  AND NOT EXISTS (
    SELECT 1 FROM square_snapshot s
    WHERE s.tienda_id = v.tienda_id
      AND s.variation_id = v.square_variation_id
  )
  AND v.square_variation_id IS NOT NULL;

COMMIT;

-- Cuántas filas quedaron desactivadas:
SELECT COUNT(*) AS desactivadas
FROM vinos_tienda
WHERE tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a'
  AND activo = false
  AND square_variation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM square_snapshot s
    WHERE s.tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a'
      AND s.variation_id = vinos_tienda.square_variation_id
  );


-- ============================================================
-- PHASE 07 · Duplicados de verdad (mismo variation_id — BORRA FILAS)
-- ============================================================

-- Primero: verificar columnas reales de la tabla para el ORDER BY
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'vinos_tienda'
ORDER BY ordinal_position;

-- Ver duplicados (si sale vacío, no hay nada que hacer):
SELECT square_variation_id, COUNT(*) AS n, array_agg(id ORDER BY created_at) AS ids
FROM vinos_tienda
WHERE tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a'
  AND square_variation_id IS NOT NULL
GROUP BY square_variation_id
HAVING COUNT(*) > 1;

-- Si hay duplicados, ejecutar (ajusta los nombres de columna según el SELECT anterior):
BEGIN;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY square_variation_id
           ORDER BY (texto_venta_ia    IS NOT NULL) DESC,
                    (foto_url          IS NOT NULL) DESC,
                    (precio_coste      IS NOT NULL) DESC,
                    created_at ASC
         ) AS rn
  FROM vinos_tienda
  WHERE tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a'
    AND square_variation_id IS NOT NULL
)
DELETE FROM vinos_tienda v
USING ranked r
WHERE v.id = r.id AND r.rn > 1;

COMMIT;


-- ============================================================
-- PHASE 08 · Blindar el esquema con índice único
-- ============================================================

DROP INDEX IF EXISTS idx_vinos_tienda_square_variation;

CREATE UNIQUE INDEX idx_vinos_tienda_square_variation
  ON vinos_tienda (tienda_id, square_variation_id)
  WHERE square_variation_id IS NOT NULL;

-- ✓ Verifica que existe:
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'vinos_tienda'
  AND indexname = 'idx_vinos_tienda_square_variation';


-- ============================================================
-- VERIFICACIÓN FINAL (ejecutar tras Phase 10)
-- ============================================================

-- Cero huérfanas
SELECT COUNT(*) AS b_huerfanas
FROM vinos_tienda v
LEFT JOIN square_snapshot s
  ON s.tienda_id = v.tienda_id AND s.variation_id = v.square_variation_id
WHERE v.tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a'
  AND v.activo = true
  AND s.variation_id IS NULL
  AND v.square_variation_id IS NOT NULL;
-- ✓ Debe ser 0

-- Cero faltantes activos
SELECT COUNT(*) AS c_faltantes
FROM square_snapshot s
LEFT JOIN vinos_tienda v
  ON v.tienda_id = s.tienda_id AND v.square_variation_id = s.variation_id AND v.activo = true
WHERE s.tienda_id = '8e2007d5-b167-4cd6-84bf-80f820fb970a'
  AND v.id IS NULL;
-- ✓ Debe ser 0


-- ============================================================
-- LIMPIEZA FINAL (solo cuando todo esté verde)
-- ============================================================
-- DROP TABLE vinos_tienda_backup_20260906;
-- DROP TABLE square_snapshot;
-- DROP TABLE relink_propuesto;
-- DROP TABLE relink_revision;
