-- ─────────────────────────────────────────────────────────────────────────
-- Fase 3 — cabecera de eventos de bodega (grupos + maridaje)
-- ─────────────────────────────────────────────────────────────────────────
--
-- MOTIVO
--   Hoy `movimientos_stock` ya captura las copas/botellas consumidas
--   en un evento (tipos 'grupo_evento' y 'maridaje'), pero no hay
--   dónde registrar el DATO DE CABECERA del evento:
--     - fecha del servicio
--     - PAX (número de comensales o personas en el grupo)
--     - menú (Rock | Premium | otro, para los maridajes)
--     - importe neto facturado del evento
--   Esto es lo que el usuario mantiene a mano en su "Libro de Bodega"
--   bajo "Maridaje" y "Grupos / Eventos". La fase 3 lo trae a la app
--   como tabla propia, expand-only, para que:
--     a) Los canales de venta tengan una cifra neta facturada.
--     b) Un simulador futuro pueda restar PAX × precio y comparar
--        teórico vs cobros.
--
-- DISEÑO
--   UNA tabla `eventos_bodega` con `tipo IN ('maridaje','grupo')` y
--   `menu_tipo IN ('rock','premium','otro')`. Campos opcionales
--   (`menu_tipo`, `num_comensales`) se interpretan según el tipo.
--   Se vincula al restaurante por `restaurante_id` (no a un
--   movimiento concreto): las copas/botellas consumidas siguen en
--   `movimientos_stock`. Ambas fuentes se cruzan por fecha + tipo
--   en los informes (agregarPeriodoBodega.js).
--
-- CARACTERÍSTICAS
--   - ADITIVO: CREATE TABLE IF NOT EXISTS; sin tocar RLS/policies de
--     tablas existentes.
--   - IDEMPOTENTE: la creación es IF NOT EXISTS, los CHECK con DO $$
--     condicionado, las policies con DROP + CREATE (patrón del repo).
--   - RLS COPIA exacta del patrón `auth_carta_historial_*`
--     (ver supabase/add_carta_historial.sql), con el admin
--     `cataconjuanjo@gmail.com` y `restaurantes.email` como dueño.
--   - No se tocan RLS ni policies de ninguna otra tabla.
--
-- COMPATIBILIDAD CON EL CÓDIGO
--   El código de Fase 3 funciona sin esta tabla: si no existe,
--   la UI oculta el bloque de eventos y los informes no se rompen
--   (los ingresos del canal 'maridaje' / 'evento' seguirán viniendo
--   del agregador por movimientos, como ahora). El adaptador degrada
--   con el mismo patrón que `resto_ingresos` / `imputacion_pct`.
--
-- BACKUP PREVIO
--   La tabla no existe todavía, así que el backup no aplica aquí.
--   La primera vez que se inserten filas, el usuario puede crear un
--   snapshot con:
--     CREATE SCHEMA IF NOT EXISTS backup_privado;
--     CREATE TABLE backup_privado.eventos_bodega_bootstrap AS
--       SELECT * FROM public.eventos_bodega;
--
-- COMPROBACIÓN PREVIA (debe devolver 0 filas; si devuelve 1, la
-- tabla ya existe y los CREATE IF NOT EXISTS son no-op):
--     SELECT table_name FROM information_schema.tables
--      WHERE table_schema = 'public' AND table_name = 'eventos_bodega';
--
-- COMPROBACIÓN POSTERIOR (ver bloque SQL de SOLO LECTURA al final
-- del informe de la rama).
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.eventos_bodega (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  uuid        NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  fecha           date        NOT NULL,
  tipo            text        NOT NULL,
  menu_tipo       text,
  num_comensales  integer,
  importe_neto    numeric(12,2) NOT NULL DEFAULT 0,
  iva_pct         numeric(5,2)  NOT NULL DEFAULT 10,
  notas           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Checks
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'eventos_bodega_tipo_chk'
  ) THEN
    ALTER TABLE public.eventos_bodega
      ADD CONSTRAINT eventos_bodega_tipo_chk
      CHECK (tipo IN ('maridaje', 'grupo'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'eventos_bodega_menu_tipo_chk'
  ) THEN
    ALTER TABLE public.eventos_bodega
      ADD CONSTRAINT eventos_bodega_menu_tipo_chk
      CHECK (menu_tipo IS NULL OR menu_tipo IN ('rock', 'premium', 'otro'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'eventos_bodega_comensales_chk'
  ) THEN
    ALTER TABLE public.eventos_bodega
      ADD CONSTRAINT eventos_bodega_comensales_chk
      CHECK (num_comensales IS NULL OR num_comensales >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'eventos_bodega_importe_chk'
  ) THEN
    ALTER TABLE public.eventos_bodega
      ADD CONSTRAINT eventos_bodega_importe_chk
      CHECK (importe_neto >= 0);
  END IF;
END $$;

-- Índice para consultar por mes del restaurante (el caso de uso principal).
CREATE INDEX IF NOT EXISTS eventos_bodega_rest_fecha_idx
  ON public.eventos_bodega (restaurante_id, fecha DESC);

-- RLS: patrón idéntico a auth_carta_historial_* (admin + dueño del restaurante).
ALTER TABLE public.eventos_bodega ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_eventos_bodega_select" ON public.eventos_bodega;
CREATE POLICY "auth_eventos_bodega_select"
  ON public.eventos_bodega FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_eventos_bodega_insert" ON public.eventos_bodega;
CREATE POLICY "auth_eventos_bodega_insert"
  ON public.eventos_bodega FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_eventos_bodega_update" ON public.eventos_bodega;
CREATE POLICY "auth_eventos_bodega_update"
  ON public.eventos_bodega FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_eventos_bodega_delete" ON public.eventos_bodega;
CREATE POLICY "auth_eventos_bodega_delete"
  ON public.eventos_bodega FOR DELETE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

COMMENT ON TABLE public.eventos_bodega IS
  'Fase 3 — cabecera de eventos de venta (grupos y maridaje). Se vincula a copas/botellas consumidas vía movimientos_stock filtrando por fecha y tipo.';
