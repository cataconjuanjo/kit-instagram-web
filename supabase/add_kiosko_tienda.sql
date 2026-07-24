-- Kiosko Virtual de Tienda de Vinos
-- Tablas independientes de la infraestructura de restaurantes (Carta Viva)

CREATE TABLE IF NOT EXISTS public.tiendas (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre         TEXT        NOT NULL,
  slug           TEXT        NOT NULL UNIQUE,
  logo_url       TEXT,
  descripcion    TEXT,
  direccion      TEXT,
  ciudad         TEXT,
  telefono       TEXT,
  email          TEXT,
  color_primario TEXT        DEFAULT '#1a1a2e',
  color_acento   TEXT        DEFAULT '#c9a96e',
  banner_url     TEXT,
  activo         BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vinos_tienda (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tienda_id            UUID        NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  nombre               TEXT        NOT NULL,
  bodega               TEXT,
  tipo                 TEXT,          -- tinto, blanco, rosado, espumoso, generoso, dulce, naranja, sin_alcohol
  uva                  TEXT,          -- variedad principal
  uvas                 TEXT[],        -- todas las variedades (para multi-uva)
  anada                TEXT,          -- año de cosecha (texto para permitir "S/C", "NV")
  region               TEXT,          -- denominación de origen o zona
  pais                 TEXT           DEFAULT 'España',
  precio_pvp           NUMERIC(10,2), -- precio venta al público
  precio_coste         NUMERIC(10,2), -- coste (opcional, para calcular margen)
  stock                INTEGER        DEFAULT 0,
  ubicacion_estanteria TEXT,          -- ej: "Estantería B3", "Pasillo Blancos Fila 2"
  foto_url             TEXT,
  notas_cata           TEXT,
  descripcion          TEXT,
  puntuacion           INTEGER,       -- puntuación (Parker, Peñín, etc.)
  destacado            BOOLEAN        NOT NULL DEFAULT false,
  activo               BOOLEAN        NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- Índices para filtrado rápido en el kiosko
CREATE INDEX IF NOT EXISTS idx_tiendas_slug        ON public.tiendas (slug);
CREATE INDEX IF NOT EXISTS idx_vinos_tienda_tienda ON public.vinos_tienda (tienda_id);
CREATE INDEX IF NOT EXISTS idx_vinos_tienda_tipo   ON public.vinos_tienda (tipo);
CREATE INDEX IF NOT EXISTS idx_vinos_tienda_activo ON public.vinos_tienda (activo);
CREATE INDEX IF NOT EXISTS idx_vinos_tienda_pais   ON public.vinos_tienda (pais);
CREATE INDEX IF NOT EXISTS idx_vinos_tienda_region ON public.vinos_tienda (region);

-- RLS
ALTER TABLE public.tiendas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vinos_tienda ENABLE ROW LEVEL SECURITY;

-- Lectura pública de tiendas activas (kiosko público)
DROP POLICY IF EXISTS "tiendas_public_read" ON public.tiendas;
CREATE POLICY "tiendas_public_read"
  ON public.tiendas FOR SELECT
  USING (activo = true);

-- Lectura pública de vinos activos (kiosko público)
DROP POLICY IF EXISTS "vinos_tienda_public_read" ON public.vinos_tienda;
CREATE POLICY "vinos_tienda_public_read"
  ON public.vinos_tienda FOR SELECT
  USING (activo = true);

-- service_role (supabaseAdmin) tiene acceso total por defecto — no necesita policy adicional
