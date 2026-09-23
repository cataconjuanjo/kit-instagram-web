-- 0004_maestros_zona_bodega.sql
-- Bloque 4: maestros canónicos de zona y bodega con aliases.
-- Expand-only: CREATE EXTENSION, CREATE OR REPLACE FUNCTION, CREATE TABLE,
--              ALTER TABLE ADD COLUMN, CREATE INDEX.
-- Sin DELETE, DROP TABLE, DROP COLUMN ni UPDATE masivo.
-- Generado: 2026-09-12. Rama: refactor/catalogo-canonico.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extensiones (idempotentes)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Función normalizar_texto — inmutable, apta para índices y columnas generadas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION normalizar_texto(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
-- En Supabase, unaccent vive en el schema "extensions" (no en "public").
-- SET search_path fija el path DENTRO de la función para que el inliner
-- del planner la encuentre incluso en contexto de columnas generadas.
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      lower(unaccent(v)),
      '[^a-z0-9\s]', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ))
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tabla zona
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zona (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text        NOT NULL,
  nivel      text        NOT NULL CHECK (nivel IN ('pais','region','do','vt','otro')),
  pais       text,
  padre_id   uuid        REFERENCES zona(id),
  aliases    text[]      NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Único sobre el nombre normalizado (no sobre el texto libre)
CREATE UNIQUE INDEX IF NOT EXISTS zona_nombre_norm_uidx
  ON zona (normalizar_texto(nombre));

-- GIN para búsqueda dentro del array de aliases
CREATE INDEX IF NOT EXISTS zona_aliases_gin_idx
  ON zona USING GIN (aliases);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tabla bodega
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bodega (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         text        NOT NULL,
  pais           text,
  aliases        text[]      NOT NULL DEFAULT '{}',
  es_placeholder boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bodega_nombre_norm_uidx
  ON bodega (normalizar_texto(nombre));

CREATE INDEX IF NOT EXISTS bodega_aliases_gin_idx
  ON bodega USING GIN (aliases);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Trigger set_updated_at (función compartida; idempotente con OR REPLACE)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zona_set_updated_at   ON zona;
DROP TRIGGER IF EXISTS bodega_set_updated_at ON bodega;

CREATE TRIGGER zona_set_updated_at
  BEFORE UPDATE ON zona
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER bodega_set_updated_at
  BEFORE UPDATE ON bodega
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Columnas nuevas en proveedor_catalogo_vinos (todas nullable salvo default)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE proveedor_catalogo_vinos
  ADD COLUMN IF NOT EXISTS zona_id          uuid    REFERENCES zona(id),
  ADD COLUMN IF NOT EXISTS bodega_id        uuid    REFERENCES bodega(id),
  ADD COLUMN IF NOT EXISTS nombre_norm      text    GENERATED ALWAYS AS (normalizar_texto(nombre)) STORED,
  ADD COLUMN IF NOT EXISTS bodega_norm      text    GENERATED ALWAYS AS (normalizar_texto(bodega)) STORED,
  ADD COLUMN IF NOT EXISTS bodega_pendiente boolean NOT NULL DEFAULT false;

-- Índices para FK y búsqueda trigrama
CREATE INDEX IF NOT EXISTS pcv_zona_id_idx
  ON proveedor_catalogo_vinos (zona_id);

CREATE INDEX IF NOT EXISTS pcv_bodega_id_idx
  ON proveedor_catalogo_vinos (bodega_id);

CREATE INDEX IF NOT EXISTS pcv_nombre_norm_trgm_idx
  ON proveedor_catalogo_vinos USING GIN (nombre_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS pcv_bodega_norm_trgm_idx
  ON proveedor_catalogo_vinos USING GIN (bodega_norm gin_trgm_ops);
