-- FD · Valoraciones del kiosko publico con comentario opcional
-- =================================================================
-- Hoy el endpoint POST /api/kiosko/<slug>/feedback (ver
-- app/api/kiosko/[slug]/feedback/route.js) solo envia un email a
-- cataconjuanjo@gmail.com; NO persiste la valoracion. Esta migracion
-- introduce una tabla pequena para guardar nota + comentario opcional
-- y exponerla al panel. Es ADITIVA e IDEMPOTENTE: todas las sentencias
-- usan IF NOT EXISTS, y el endpoint de escritura (y el de lectura
-- del admin) degradan a silencioso si la tabla aun no existe.
--
-- COMPROBAR SI YA ESTA APLICADA
-- -----------------------------
--   SELECT to_regclass('public.kiosko_valoraciones') IS NOT NULL
--          AS tabla_existe;
-- Debe devolver TRUE.
--
-- APLICAR
-- -------
-- Pegar este fichero completo en Supabase > SQL Editor y ejecutar.
--
-- ROLLBACK
-- --------
-- Al final del fichero (comentado). Elimina la tabla y el indice.
-- Si en el futuro hay datos, el DROP borra TODO; valorar un backup
-- antes.

CREATE TABLE IF NOT EXISTS public.kiosko_valoraciones (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id       UUID         NOT NULL REFERENCES public.tiendas(id) ON DELETE CASCADE,
  rating          SMALLINT     NOT NULL CHECK (rating >= 1 AND rating <= 5),
  -- Campo historico del flujo v1: cuando el usuario escribia en la
  -- textarea antes de pulsar la carita baja. Max 1000 (igual que el
  -- recorte del endpoint).
  sugerencia      TEXT         CHECK (sugerencia IS NULL OR char_length(sugerencia) <= 1000),
  -- FD (D2+D3): comentario opcional del flujo v2, separado de la nota.
  -- 280 caracteres, sin HTML (saneado en servidor). NULL mientras el
  -- usuario no envie o salte por inactividad.
  comentario      TEXT         CHECK (comentario IS NULL OR char_length(comentario) <= 280),
  comentario_lang TEXT         CHECK (comentario_lang IS NULL OR comentario_lang IN ('es','en','fr','de')),
  comentario_at   TIMESTAMPTZ,
  lang            TEXT         CHECK (lang IS NULL OR lang IN ('es','en','fr','de')),
  -- session_id lo pone el cliente (localStorage o efimero). Nunca se
  -- muestra al publico.
  session_id      TEXT,
  -- FD fix: user_agent capado a 200 car. para no guardar strings
  -- enormes de bots. La IP del cliente NO se persiste aqui: el
  -- control de abuso sigue haciendose via public.rate_limits
  -- (que ya guarda IP con su propio TTL corto, no por tienda).
  user_agent      TEXT         CHECK (user_agent IS NULL OR char_length(user_agent) <= 200),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kiosko_valoraciones_tienda_fecha
  ON public.kiosko_valoraciones(tienda_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kiosko_valoraciones_tienda_rating
  ON public.kiosko_valoraciones(tienda_id, rating);

-- RLS: solo lectura via service_role (admin). El kiosko publico escribe
-- via supabaseAdmin desde el endpoint del backend, no desde el browser.
ALTER TABLE public.kiosko_valoraciones ENABLE ROW LEVEL SECURITY;

-- (Idempotencia: DROP POLICY IF EXISTS antes de CREATE POLICY)
DROP POLICY IF EXISTS "kiosko_valoraciones: service_role all" ON public.kiosko_valoraciones;
CREATE POLICY "kiosko_valoraciones: service_role all" ON public.kiosko_valoraciones
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Sin politica para anon: queda explicitamente negado.

-- =================================================================
-- ROLLBACK (descomentar y ejecutar en orden inverso):
-- -----------------------------------------------------------------
-- DROP POLICY IF EXISTS "kiosko_valoraciones: service_role all" ON public.kiosko_valoraciones;
-- DROP INDEX IF EXISTS idx_kiosko_valoraciones_tienda_rating;
-- DROP INDEX IF EXISTS idx_kiosko_valoraciones_tienda_fecha;
-- DROP TABLE IF EXISTS public.kiosko_valoraciones;
