-- ─────────────────────────────────────────────────────────────────────────
-- Fase A — cabecera de eventos de bodega (grupos + maridaje)
-- ─────────────────────────────────────────────────────────────────────────
--
-- CAMBIOS RESPECTO A LA VERSIÓN DE MAIN (feat/fase3-canales-salidas,
-- mergeada en el PR #44, nunca aplicada en BD):
--
--   · Nueva columna `incluido_en_tpv boolean NOT NULL DEFAULT false`.
--     Clave para evitar doble conteo: si la venta del evento ya entró
--     por el webhook del TPV (Square), marcándola así se visualiza
--     en la pestaña Eventos pero NO suma como "canal evento/maridaje"
--     en el informe económico.
--   · Nueva columna `menu_nombre text` (nullable). `menu_tipo` sigue
--     siendo la clasificación oficial (rock/premium/otro), y
--     `menu_nombre` es el nombre libre que el usuario quiera ver en
--     la plantilla (p. ej. "Menú Degustación Rock 2026-11").
--   · Nueva columna `importe_bruto numeric(12,2)` (nullable). Guarda
--     el importe tal como el usuario lo introduce con IVA; el
--     `importe_neto` es el que se usa para reportes. Si sólo llega
--     neto, importe_bruto queda NULL.
--   · Nueva columna `created_by text` (nullable). Guarda el email
--     del usuario que crea la fila (auditoría y debug).
--
-- MOTIVO
--   La plantilla real del usuario ("Libro de Bodega") tiene dos
--   tablas por fecha: GRUPOS (fecha, PAX, importe, neto) y
--   MARIDAJES (fecha, menú Rock/Premium, precio, nº comensales,
--   facturación, neto; IVA 10 %). Hoy Carta Viva solo registra
--   el consumo de vino de esos eventos (movimientos_stock tipos
--   grupo_evento/maridaje), no lo facturado. Esta tabla captura
--   la cabecera.
--
-- CARACTERÍSTICAS
--   - ADITIVO: CREATE TABLE IF NOT EXISTS + CHECKs dentro de DO $$
--     condicionado; re-ejecutable sin efecto si ya existe.
--   - IDEMPOTENTE: los ADD CONSTRAINT están guardados por lookup en
--     pg_constraint; los CREATE INDEX IF NOT EXISTS igualmente.
--   - RLS: patrón EXACTO de `auth_carta_historial_*`
--     (ver supabase/add_carta_historial.sql).
--   - No se tocan RLS ni policies de ninguna otra tabla.
--   - No se tocan columnas, triggers ni índices de otras tablas.
--
-- COMPATIBILIDAD CON EL CÓDIGO
--   La rama feat/eventos-bodega detecta en runtime si la tabla
--   existe (error 42P01 "relation does not exist" como se hace con
--   resto_ingresos/imputacion_pct). Sin la migración aplicada:
--     · Pestaña "Eventos" muestra aviso "SQL pendiente".
--     · Agregador ignora los eventos → informe y cierre no cambian.
--     · Excel del informe económico queda como en main.
--
-- BACKUP PREVIO
--   La tabla no existe todavía, así que el backup no aplica aquí.
--   La primera vez que se inserten filas, el usuario puede crear un
--   snapshot con:
--     CREATE SCHEMA IF NOT EXISTS backup_privado;
--     CREATE TABLE backup_privado.eventos_bodega_bootstrap AS
--       SELECT * FROM public.eventos_bodega;
--
-- COMPROBACIÓN PREVIA (debe devolver 0 filas):
--     SELECT table_name FROM information_schema.tables
--      WHERE table_schema = 'public' AND table_name = 'eventos_bodega';
--
-- COMPROBACIÓN POSTERIOR: ver el bloque SQL de SOLO LECTURA al final
-- del reporte de la rama.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.eventos_bodega (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id    uuid        NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  fecha             date        NOT NULL,
  tipo              text        NOT NULL,                      -- 'maridaje' | 'grupo'
  menu_tipo         text,                                      -- 'rock' | 'premium' | 'otro' | NULL
  menu_nombre       text,                                      -- nombre libre, opcional
  num_comensales    integer,                                   -- PAX (grupo) o nº comensales (maridaje); nullable
  importe_bruto     numeric(12,2),                             -- con IVA; opcional
  importe_neto      numeric(12,2) NOT NULL DEFAULT 0,          -- sin IVA; fuente de verdad del reporte
  iva_pct           numeric(5,2)  NOT NULL DEFAULT 10,
  incluido_en_tpv   boolean       NOT NULL DEFAULT false,      -- evita doble conteo con ventas TPV
  notas             text,
  created_by        text,                                      -- email del creador (auditoría)
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Checks (idempotentes)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_bodega_tipo_chk') THEN
    ALTER TABLE public.eventos_bodega
      ADD CONSTRAINT eventos_bodega_tipo_chk
      CHECK (tipo IN ('maridaje', 'grupo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_bodega_menu_tipo_chk') THEN
    ALTER TABLE public.eventos_bodega
      ADD CONSTRAINT eventos_bodega_menu_tipo_chk
      CHECK (menu_tipo IS NULL OR menu_tipo IN ('rock', 'premium', 'otro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_bodega_comensales_chk') THEN
    ALTER TABLE public.eventos_bodega
      ADD CONSTRAINT eventos_bodega_comensales_chk
      CHECK (num_comensales IS NULL OR num_comensales >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_bodega_importe_neto_chk') THEN
    ALTER TABLE public.eventos_bodega
      ADD CONSTRAINT eventos_bodega_importe_neto_chk
      CHECK (importe_neto >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_bodega_importe_bruto_chk') THEN
    ALTER TABLE public.eventos_bodega
      ADD CONSTRAINT eventos_bodega_importe_bruto_chk
      CHECK (importe_bruto IS NULL OR importe_bruto >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eventos_bodega_iva_chk') THEN
    ALTER TABLE public.eventos_bodega
      ADD CONSTRAINT eventos_bodega_iva_chk
      CHECK (iva_pct >= 0 AND iva_pct <= 25);
  END IF;
END $$;

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
  'Fase A — cabecera de eventos de venta (grupos y maridaje). Las copas/botellas consumidas siguen en movimientos_stock con tipo grupo_evento/maridaje. incluido_en_tpv=true evita doble conteo con las ventas que ya llegan por webhook del TPV.';
