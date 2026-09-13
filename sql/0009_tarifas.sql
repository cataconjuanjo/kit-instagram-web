-- 0009_tarifas.sql
-- Bloque 9: ingesta de tarifas versionada con diff.
-- Expand-only: ADD COLUMN, CREATE TABLE. Sin DROP ni DELETE.
--
-- INSTRUCCIÓN DE EJECUCIÓN EN SUPABASE SQL EDITOR — DOS PASADAS:
--   PASADA 1 → DDL (hasta la línea marcada)
--   PASADA 2 → DML (backfill)

-- ── PASADA 1: DDL ─────────────────────────────────────────────────────────────

-- 1. tarifa — versión de la lista de precios de un proveedor en un período
CREATE TABLE IF NOT EXISTS tarifa (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id   uuid        NOT NULL REFERENCES proveedores_vino(id),
  periodo        date        NOT NULL,
  estado         text        NOT NULL DEFAULT 'borrador'
                 CHECK (estado IN ('borrador', 'publicada', 'archivada')),
  fichero_origen text        NOT NULL,
  publicada_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Solo puede haber una tarifa publicada por proveedor en cada momento
CREATE UNIQUE INDEX IF NOT EXISTS tarifa_proveedor_publicada_uidx
  ON tarifa (proveedor_id) WHERE estado = 'publicada';

CREATE INDEX IF NOT EXISTS tarifa_proveedor_id_idx ON tarifa (proveedor_id);
CREATE INDEX IF NOT EXISTS tarifa_estado_idx        ON tarifa (estado);

-- 2. linea_cruda — registro de auditoría de cada renglón importado
CREATE TABLE IF NOT EXISTS linea_cruda (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tarifa_id       uuid        NOT NULL REFERENCES tarifa(id) ON DELETE CASCADE,
  oferta_id       uuid        REFERENCES oferta(id),
  numero_linea    integer     NOT NULL,
  texto_literal   text        NOT NULL,
  datos_json      jsonb,
  confianza       numeric(5,4),
  estado_revision text        NOT NULL DEFAULT 'ok'
                  CHECK (estado_revision IN ('ok', 'pendiente_mapeo', 'pendiente_revision', 'ignorada')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linea_cruda_tarifa_id_idx  ON linea_cruda (tarifa_id);
CREATE INDEX IF NOT EXISTS linea_cruda_oferta_id_idx  ON linea_cruda (oferta_id);
CREATE INDEX IF NOT EXISTS linea_cruda_estado_idx
  ON linea_cruda (estado_revision) WHERE estado_revision <> 'ok';

-- 3. FK tarifa_id en oferta
ALTER TABLE oferta
  ADD COLUMN IF NOT EXISTS tarifa_id uuid REFERENCES tarifa(id);

CREATE INDEX IF NOT EXISTS oferta_tarifa_id_idx ON oferta (tarifa_id);

-- ── PASADA 2: DML backfill ────────────────────────────────────────────────────

-- 4. Una tarifa "publicada" por cada proveedor existente, con la fecha de hoy.
--    Representa el catálogo ya cargado en bloques anteriores.
INSERT INTO tarifa (proveedor_id, periodo, estado, fichero_origen, publicada_at)
SELECT id, CURRENT_DATE, 'publicada', 'migración bloque 9', now()
FROM proveedores_vino
WHERE NOT EXISTS (
  SELECT 1 FROM tarifa t WHERE t.proveedor_id = proveedores_vino.id
);

-- 5. Apuntar oferta.tarifa_id a la tarifa recién creada del mismo proveedor
UPDATE oferta o
SET tarifa_id = t.id
FROM tarifa t
WHERE t.proveedor_id = o.proveedor_id
  AND t.fichero_origen = 'migración bloque 9'
  AND o.tarifa_id IS NULL;
