-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B8a · Schema generalizado (multi-TPV)                                   ║
-- ║                                                                           ║
-- ║  UPGRADE idempotente desde prod (square_vino_map / catalog_object_id):   ║
-- ║    · square_vino_map → tpv_vino_map                                       ║
-- ║    · square_variation_id → producto_externo_id + columna fuente           ║
-- ║    · tpv_lineas_sin_asignar.catalog_object_id → producto_externo_id       ║
-- ║    · restaurant_economic_settings: tpv_fuente + tpv_local_id              ║
-- ║                                                                           ║
-- ║  Rollback: b8a_schema_rollback.sql                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ── 1. restaurant_economic_settings: interruptor + config TPV ─────────────────
-- tpv_movimientos_activo: sin este flag en TRUE el webhook ignora el pago.
-- tpv_fuente / tpv_local_id: identifican el TPV de cada restaurante.
-- Diseño: columna en restaurant_economic_settings (no derivar de tiendas) porque
-- tiendas y restaurantes son dominios independientes.
ALTER TABLE public.restaurant_economic_settings
  ADD COLUMN IF NOT EXISTS tpv_movimientos_activo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tpv_fuente             TEXT,
  ADD COLUMN IF NOT EXISTS tpv_local_id           TEXT;

-- UNIQUE parcial: evita ambigüedad (fuente, local) entre restaurantes.
-- El webhook no puede resolver la ambigüedad → se descarta en resolveRestaurante.
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_economic_settings_tpv_local_idx
  ON public.restaurant_economic_settings (tpv_fuente, tpv_local_id)
  WHERE tpv_local_id IS NOT NULL;

-- ── 2. movimientos_stock: columnas B8a ─────────────────────────────────────────
ALTER TABLE public.movimientos_stock
  -- Idempotencia: formato '{fuente}_{payment_id}_{line_uid}' para líneas TPV.
  ADD COLUMN IF NOT EXISTS referencia_externa    TEXT,
  -- Fecha real del evento (fecha del pago). NULL para movimientos anteriores a B8a.
  ADD COLUMN IF NOT EXISTS fecha_movimiento      TIMESTAMPTZ,
  -- Importes de la línea de venta (con IVA en precio y descuento).
  ADD COLUMN IF NOT EXISTS precio_unitario_bruto NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS descuento_unitario    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS importe_neto          NUMERIC(10,2),
  -- TRUE → cambió stock físico; FALSE → modo observación.
  ADD COLUMN IF NOT EXISTS afecto_stock          BOOLEAN NOT NULL DEFAULT true,
  -- B8b prep: enlace al movimiento original en reversiones.
  ADD COLUMN IF NOT EXISTS movimiento_origen_id  UUID
    REFERENCES public.movimientos_stock(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS es_reverso            BOOLEAN NOT NULL DEFAULT false;

-- Índice único: garantiza idempotencia a nivel de BD incluso bajo concurrencia.
CREATE UNIQUE INDEX IF NOT EXISTS movimientos_stock_referencia_externa_idx
  ON public.movimientos_stock (restaurante_id, referencia_externa)
  WHERE referencia_externa IS NOT NULL;

-- ── 3. tpv_vino_map (generalización de square_vino_map) ────────────────────────

-- 3a. Renombrar tabla si viene del prod original.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'square_vino_map'
  ) THEN
    ALTER TABLE public.square_vino_map RENAME TO tpv_vino_map;
  END IF;
END;
$$;

-- 3b. Renombrar columna square_variation_id si procede.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tpv_vino_map'
      AND column_name = 'square_variation_id'
  ) THEN
    ALTER TABLE public.tpv_vino_map RENAME COLUMN square_variation_id TO producto_externo_id;
  END IF;
END;
$$;

-- 3c. Crear tabla si aún no existe (instalación limpia sin upgrade).
-- Sin inline UNIQUE: el constraint se añade explícitamente en 3f.
CREATE TABLE IF NOT EXISTS public.tpv_vino_map (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurante_id      UUID NOT NULL
    REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  fuente              TEXT NOT NULL DEFAULT 'square',
  producto_externo_id TEXT NOT NULL,
  -- NULL cuando estado='ignorar'; NOT NULL cuando estado='activo' (ver CHECKs).
  vino_id             UUID
    REFERENCES public.vinos(id) ON DELETE CASCADE,
  formato_venta       TEXT CHECK (formato_venta IN ('botella', 'copa')),
  estado              TEXT NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('activo', 'ignorar')),
  activo              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_activo_requiere_vino
    CHECK (estado <> 'activo' OR vino_id IS NOT NULL),
  CONSTRAINT chk_activo_requiere_formato
    CHECK (estado <> 'activo' OR formato_venta IS NOT NULL)
);

-- 3d. Añadir fuente en el path de upgrade (ya presente en instalación limpia).
ALTER TABLE public.tpv_vino_map
  ADD COLUMN IF NOT EXISTS fuente TEXT NOT NULL DEFAULT 'square';

-- 3e. Drop UNIQUE 2-cols heredado de square_vino_map (nombre auto-generado por Postgres).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tpv_vino_map'::regclass
      AND conname = 'square_vino_map_restaurante_id_square_variation_id_key'
  ) THEN
    ALTER TABLE public.tpv_vino_map
      DROP CONSTRAINT square_vino_map_restaurante_id_square_variation_id_key;
  END IF;
END;
$$;

-- 3f. UNIQUE 3-cols: (restaurante_id, fuente, producto_externo_id).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tpv_vino_map'::regclass
      AND conname = 'tpv_vino_map_restaurante_fuente_producto_key'
  ) THEN
    ALTER TABLE public.tpv_vino_map
      ADD CONSTRAINT tpv_vino_map_restaurante_fuente_producto_key
      UNIQUE (restaurante_id, fuente, producto_externo_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS tpv_vino_map_restaurante_vino_idx
  ON public.tpv_vino_map (restaurante_id, vino_id);

ALTER TABLE public.tpv_vino_map ENABLE ROW LEVEL SECURITY;

-- Política compatible con ambos nombres de tabla (idempotente).
DROP POLICY IF EXISTS "square_vino_map_select" ON public.tpv_vino_map;
DROP POLICY IF EXISTS "tpv_vino_map_select"    ON public.tpv_vino_map;
CREATE POLICY "tpv_vino_map_select" ON public.tpv_vino_map
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR EXISTS (
      SELECT 1 FROM public.restaurantes r
      WHERE r.id = tpv_vino_map.restaurante_id
        AND r.email = (auth.jwt() ->> 'email')
    )
  );

-- ── 4. tpv_lineas_sin_asignar: renombrar catalog_object_id ─────────────────────

-- 4a. Renombrar columna si procede (upgrade desde prod).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tpv_lineas_sin_asignar'
      AND column_name = 'catalog_object_id'
  ) THEN
    ALTER TABLE public.tpv_lineas_sin_asignar
      RENAME COLUMN catalog_object_id TO producto_externo_id;
  END IF;
END;
$$;

-- 4b. Crear tabla si aún no existe (instalación limpia).
CREATE TABLE IF NOT EXISTS public.tpv_lineas_sin_asignar (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurante_id      UUID NOT NULL
    REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  fuente              TEXT NOT NULL DEFAULT 'square',
  referencia_ticket   TEXT NOT NULL,    -- payment_id de la fuente
  referencia_linea    TEXT NOT NULL,    -- line_item uid
  nombre_producto     TEXT,             -- nombre legible para el admin
  -- NULL si la línea llegó sin id de producto (contadas y logueadas en JS).
  producto_externo_id TEXT,
  cantidad            NUMERIC(10,4),
  precio_unitario     NUMERIC(10,2),
  descuento_unitario  NUMERIC(10,2),
  importe_bruto_iva   NUMERIC(10,2),
  -- Fecha original del pago; necesaria para ventas retroactivas.
  fecha               TIMESTAMPTZ NOT NULL,
  estado              TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'asignada', 'descartada')),
  tipo_incidencia     TEXT
    CHECK (tipo_incidencia IN ('sin_mapeo', 'cantidad_no_entera', 'cantidad_cero', 'mapeo_invalido')),
  vino_id             UUID REFERENCES public.vinos(id) ON DELETE SET NULL,
  formato_asignado    TEXT CHECK (formato_asignado IN ('botella', 'copa')),
  procesada_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (restaurante_id, fuente, referencia_ticket, referencia_linea)
);

-- 4c. Drop índice que referenciaba catalog_object_id; recrear con nombre correcto.
DROP INDEX IF EXISTS public.tpv_lineas_catalog_pendiente_idx;

CREATE INDEX IF NOT EXISTS tpv_lineas_estado_idx
  ON public.tpv_lineas_sin_asignar (restaurante_id, estado);

CREATE INDEX IF NOT EXISTS tpv_lineas_producto_pendiente_idx
  ON public.tpv_lineas_sin_asignar (restaurante_id, producto_externo_id)
  WHERE producto_externo_id IS NOT NULL AND estado = 'pendiente';

ALTER TABLE public.tpv_lineas_sin_asignar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tpv_lineas_select" ON public.tpv_lineas_sin_asignar;
CREATE POLICY "tpv_lineas_select" ON public.tpv_lineas_sin_asignar
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR EXISTS (
      SELECT 1 FROM public.restaurantes r
      WHERE r.id = tpv_lineas_sin_asignar.restaurante_id
        AND r.email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "tpv_lineas_update" ON public.tpv_lineas_sin_asignar;

NOTIFY pgrst, 'reload schema';
COMMIT;
