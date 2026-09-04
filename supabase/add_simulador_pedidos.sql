-- Pedidos generados desde el simulador de carta.
-- Persiste el estado de envío por (restaurante, proveedor) — uno activo por par.
-- Ejecutar en Supabase SQL Editor antes de activar la pestaña Proveedores del simulador.

CREATE TABLE IF NOT EXISTS public.simulador_pedidos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id   uuid        NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,

  -- Proveedor: FK si viene del catálogo, texto si viene de campo libre en vinos.
  -- Uno de los dos debe estar relleno.
  proveedor_id     uuid        REFERENCES public.proveedores_vino(id) ON DELETE SET NULL,
  proveedor_nombre text        NOT NULL,

  -- Snapshot de los vinos en el pedido al momento de guardarlo.
  -- Array de { id, nombre, bodega, cantidad, coste_compra }
  vinos_snapshot   jsonb       NOT NULL DEFAULT '[]',

  -- Mensaje final editado antes de copiar/enviar
  mensaje_final    text,

  estado           text        NOT NULL DEFAULT 'borrador'
                               CHECK (estado IN ('borrador', 'enviado')),
  enviado_at       timestamptz,
  enviado_por      text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Un pedido activo por (restaurante, proveedor estructurado)
CREATE UNIQUE INDEX IF NOT EXISTS simulador_pedidos_rest_prov_idx
  ON public.simulador_pedidos (restaurante_id, proveedor_id)
  WHERE proveedor_id IS NOT NULL;

-- Un pedido activo por (restaurante, nombre de proveedor texto) para los sin FK
CREATE UNIQUE INDEX IF NOT EXISTS simulador_pedidos_rest_nombre_idx
  ON public.simulador_pedidos (restaurante_id, proveedor_nombre)
  WHERE proveedor_id IS NULL;

ALTER TABLE public.simulador_pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_simulador_pedidos_select" ON public.simulador_pedidos;
CREATE POLICY "auth_simulador_pedidos_select"
  ON public.simulador_pedidos FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_simulador_pedidos_insert" ON public.simulador_pedidos;
CREATE POLICY "auth_simulador_pedidos_insert"
  ON public.simulador_pedidos FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_simulador_pedidos_update" ON public.simulador_pedidos;
CREATE POLICY "auth_simulador_pedidos_update"
  ON public.simulador_pedidos FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_simulador_pedidos_delete" ON public.simulador_pedidos;
CREATE POLICY "auth_simulador_pedidos_delete"
  ON public.simulador_pedidos FOR DELETE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );
