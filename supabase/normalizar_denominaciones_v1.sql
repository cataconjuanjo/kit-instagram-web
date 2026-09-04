-- Migración v2: normalización DOP/IGP España
-- Añade columnas estructuradas a proveedor_catalogo_vinos sin tocar zona legada.
-- Crea tabla de referencia ref_denominaciones_es.
--
-- PRERREQUISITO: normalizar_catalogo_v1.sql ya ejecutado (columna zona existe).
-- SECUENCIA DE USO:
--   1. Ejecutar este script en Supabase SQL Editor.
--   2. node --env-file=.env.local scripts/seed-ref-denominaciones-es.mjs
--   3. node --env-file=.env.local scripts/normalizar-denominaciones-dry-run.mjs > informe-denominaciones-dry-run.csv
--   4. Revisar informe. Confirmar con el usuario.
--   5. node --env-file=.env.local scripts/normalizar-denominaciones-apply.mjs
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Paso 1: Columnas nuevas en proveedor_catalogo_vinos ──────────────────────

ALTER TABLE public.proveedor_catalogo_vinos
  ADD COLUMN IF NOT EXISTS zona_original       text,
  ADD COLUMN IF NOT EXISTS pais                text,
  ADD COLUMN IF NOT EXISTS comunidad_autonoma  text,
  ADD COLUMN IF NOT EXISTS do_igp              text,
  ADD COLUMN IF NOT EXISTS zona_revisar        boolean DEFAULT false;

-- Auditoría permanente: copia zona → zona_original antes de cualquier v2 touch.
-- Idempotente: solo actúa si zona_original está vacío.
UPDATE public.proveedor_catalogo_vinos
   SET zona_original = zona
 WHERE zona_original IS NULL
   AND zona IS NOT NULL;

-- ── Paso 2: Tabla de referencia oficial DOP/IGP España ───────────────────────

CREATE TABLE IF NOT EXISTS public.ref_denominaciones_es (
  id                 serial   PRIMARY KEY,
  pais               text     NOT NULL DEFAULT 'España',
  comunidad_autonoma text     NOT NULL,
  tipo               text     NOT NULL CHECK (tipo IN ('DOP', 'IGP')),
  nombre_oficial     text     NOT NULL,
  -- Clave de búsqueda: lowercase, sin acentos, sin prefijos D.O./DOP/IGP.
  -- Generada por scripts/seed-ref-denominaciones-es.mjs, no editar a mano.
  nombre_norm        text     NOT NULL
);

-- Unicidad sobre la clave normalizada (evita duplicados de alias)
CREATE UNIQUE INDEX IF NOT EXISTS ref_denominaciones_es_norm_idx
  ON public.ref_denominaciones_es (nombre_norm);

-- Índice secundario para búsquedas por CCAA
CREATE INDEX IF NOT EXISTS ref_denominaciones_es_ccaa_idx
  ON public.ref_denominaciones_es (comunidad_autonoma);

-- Sin políticas RLS públicas: acceso solo via service role (igual que proveedor_catalogo_vinos)
ALTER TABLE public.ref_denominaciones_es ENABLE ROW LEVEL SECURITY;
