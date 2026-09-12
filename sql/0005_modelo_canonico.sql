-- 0005_modelo_canonico.sql
-- Bloque 5: modelo canónico de vino y deduplicación.
-- Expand-only: CREATE TABLE, CREATE INDEX, CREATE TRIGGER.
-- Sin DELETE, DROP TABLE, DROP COLUMN ni UPDATE masivo.
-- Generado: 2026-09-12. Rama: refactor/catalogo-canonico.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. vino — entidad canónica de vino (sin añada ni formato)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vino (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bodega_id   uuid        REFERENCES bodega(id),
  nombre      text        NOT NULL,
  nombre_norm text        GENERATED ALWAYS AS (normalizar_texto(nombre)) STORED,
  tipo        text,
  zona_id     uuid        REFERENCES zona(id),
  uvas        text[]      NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Clave natural: una bodega no puede tener dos vinos con el mismo nombre normalizado
CREATE UNIQUE INDEX IF NOT EXISTS vino_bodega_nombre_norm_uidx
  ON vino (bodega_id, nombre_norm);

CREATE INDEX IF NOT EXISTS vino_zona_id_idx    ON vino (zona_id);
CREATE INDEX IF NOT EXISTS vino_bodega_id_idx  ON vino (bodega_id);
CREATE INDEX IF NOT EXISTS vino_nombre_norm_trgm_idx
  ON vino USING GIN (nombre_norm gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. vino_anada — una línea por (vino × añada × formato)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vino_anada (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vino_id    uuid        NOT NULL REFERENCES vino(id),
  anada      int,                         -- NULL = sin añada conocida
  formato_ml int         NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- COALESCE(-1) como centinela para NULL: años reales son 1900-2099
CREATE UNIQUE INDEX IF NOT EXISTS vino_anada_uidx
  ON vino_anada (vino_id, COALESCE(anada, -1), formato_ml);

CREATE INDEX IF NOT EXISTS vino_anada_vino_id_idx ON vino_anada (vino_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. oferta — precio de un proveedor para una vino_anada concreta
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oferta (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id         uuid        NOT NULL REFERENCES proveedores_vino(id),
  vino_anada_id        uuid        NOT NULL REFERENCES vino_anada(id),
  codigo_articulo      text,
  coste                numeric(10,2),
  iva                  numeric(5,2),
  unidades_caja        int,
  disponibilidad       text,
  referencia_origen_id uuid        REFERENCES proveedor_catalogo_vinos(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oferta_vino_anada_id_idx ON oferta (vino_anada_id);
CREATE INDEX IF NOT EXISTS oferta_proveedor_id_idx  ON oferta (proveedor_id);
CREATE UNIQUE INDEX IF NOT EXISTS oferta_origen_uidx
  ON oferta (referencia_origen_id) WHERE referencia_origen_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. dedup_candidato — par de vino_anadas con similitud de nombre ≥ 0.65
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dedup_candidato (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vino_anada_a uuid        NOT NULL REFERENCES vino_anada(id),
  vino_anada_b uuid        NOT NULL REFERENCES vino_anada(id),
  similitud    numeric(4,3),
  estado       text        NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente','fusionado','distintos')),
  creado_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dedup_candidato_orden CHECK (vino_anada_a < vino_anada_b)
);

CREATE UNIQUE INDEX IF NOT EXISTS dedup_candidato_par_uidx
  ON dedup_candidato (vino_anada_a, vino_anada_b);

CREATE INDEX IF NOT EXISTS dedup_candidato_estado_idx
  ON dedup_candidato (estado) WHERE estado = 'pendiente';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. dedup_decision — registro de cada decisión sobre un candidato
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dedup_decision (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid        NOT NULL REFERENCES dedup_candidato(id),
  decision     text        NOT NULL CHECK (decision IN ('fusionado','distintos')),
  decidido_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dedup_decision_candidato_idx
  ON dedup_decision (candidato_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Triggers set_updated_at (reutiliza la función del bloque 4)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS vino_set_updated_at       ON vino;
DROP TRIGGER IF EXISTS vino_anada_set_updated_at ON vino_anada;
DROP TRIGGER IF EXISTS oferta_set_updated_at     ON oferta;

CREATE TRIGGER vino_set_updated_at
  BEFORE UPDATE ON vino FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER vino_anada_set_updated_at
  BEFORE UPDATE ON vino_anada FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER oferta_set_updated_at
  BEFORE UPDATE ON oferta FOR EACH ROW EXECUTE FUNCTION set_updated_at();
