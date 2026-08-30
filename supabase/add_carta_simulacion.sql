-- Borrador del simulador de carta de vinos.
-- Una fila por vino incluido en el borrador de un restaurante.
-- estado: 'actual' (ya está en carta y sin cambios),
--         'nuevo'  (viene del catálogo del consultor, aún no es vino propio),
--         'fuera'  (marcado para desactivar al publicar)
-- Ejecutar en Supabase SQL Editor antes de activar la pestaña Simulador.

CREATE TABLE IF NOT EXISTS public.carta_simulacion (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id   uuid        NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,

  -- Origen: exactamente uno de los dos debe estar relleno.
  -- CASCADE: si el vino o la referencia de catálogo se borra, la línea del borrador también.
  vino_id          uuid        REFERENCES public.vinos(id) ON DELETE CASCADE,
  catalogo_vino_id uuid        REFERENCES public.proveedor_catalogo_vinos(id) ON DELETE CASCADE,

  -- Snapshot de los datos en el momento de añadir al borrador.
  -- No se actualiza automáticamente cuando cambia la carta real.
  nombre           text        NOT NULL,
  bodega           text,
  tipo             text,
  region           text,
  anada            text,
  formato          text,

  -- Precios editables dentro del simulador (independientes de la carta real).
  precio_botella   numeric(10,2),
  precio_copa      numeric(10,2),
  coste_compra     numeric(10,2),

  estado           text        NOT NULL DEFAULT 'actual'
                               CHECK (estado IN ('actual', 'nuevo', 'fuera')),

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT carta_simulacion_origen_exclusivo CHECK (
    (vino_id IS NOT NULL AND catalogo_vino_id IS NULL) OR
    (vino_id IS NULL     AND catalogo_vino_id IS NOT NULL)
  )
);

-- Un restaurante no puede tener el mismo vino dos veces en el borrador.
CREATE UNIQUE INDEX IF NOT EXISTS carta_simulacion_vino_uidx
  ON public.carta_simulacion (restaurante_id, vino_id)
  WHERE vino_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS carta_simulacion_catalogo_uidx
  ON public.carta_simulacion (restaurante_id, catalogo_vino_id)
  WHERE catalogo_vino_id IS NOT NULL;

ALTER TABLE public.carta_simulacion ENABLE ROW LEVEL SECURITY;

-- ── RLS: mismo patrón que el resto del dashboard ─────────────────────────

DROP POLICY IF EXISTS "auth_carta_simulacion_select" ON public.carta_simulacion;
CREATE POLICY "auth_carta_simulacion_select"
  ON public.carta_simulacion FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_carta_simulacion_insert" ON public.carta_simulacion;
CREATE POLICY "auth_carta_simulacion_insert"
  ON public.carta_simulacion FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_carta_simulacion_update" ON public.carta_simulacion;
CREATE POLICY "auth_carta_simulacion_update"
  ON public.carta_simulacion FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_carta_simulacion_delete" ON public.carta_simulacion;
CREATE POLICY "auth_carta_simulacion_delete"
  ON public.carta_simulacion FOR DELETE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );
