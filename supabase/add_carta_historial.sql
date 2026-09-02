-- Historial de cartas publicadas.
-- Cada vez que se ejecuta publicar_simulacion(), se guarda aquí una instantánea
-- de los vinos activos en ese momento, para poder restaurar versiones anteriores.
-- Ejecutar en Supabase SQL Editor después de add_carta_simulacion.sql.

CREATE TABLE IF NOT EXISTS public.carta_historial (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  uuid        NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  published_at    timestamptz NOT NULL DEFAULT now(),
  published_by    text,                             -- email del usuario que publicó
  total_vinos     int         NOT NULL DEFAULT 0,
  vinos_snapshot  jsonb       NOT NULL DEFAULT '[]' -- array de objetos con datos de la carta
);

CREATE INDEX IF NOT EXISTS carta_historial_restaurante_idx
  ON public.carta_historial (restaurante_id, published_at DESC);

ALTER TABLE public.carta_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_carta_historial_select" ON public.carta_historial;
CREATE POLICY "auth_carta_historial_select"
  ON public.carta_historial FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_carta_historial_insert" ON public.carta_historial;
CREATE POLICY "auth_carta_historial_insert"
  ON public.carta_historial FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- ── Función publicar_simulacion actualizada ───────────────────────────────────
-- Añade guardado de snapshot antes de aplicar los cambios.
-- p_published_by: email del usuario que publica (opcional, puede ser NULL).

CREATE OR REPLACE FUNCTION public.publicar_simulacion(
  p_restaurante_id uuid,
  p_published_by   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desactivados  int := 0;
  v_creados       int := 0;
  v_borrados      int := 0;
  v_snapshot      jsonb;
  v_total_vinos   int := 0;
BEGIN
  -- 0. Guardar instantánea de la carta activa ANTES de aplicar cambios.
  --    Incluye todos los vinos que quedarán activos tras publicar:
  --    - 'actual'  → se mantienen
  --    - 'nuevo'   → pasan a ser vinos de la carta
  --    - 'fuera'   → se excluyen (son los que se van a retirar)
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre',         cs.nombre,
      'bodega',         cs.bodega,
      'tipo',           cs.tipo,
      'region',         cs.region,
      'anada',          cs.anada,
      'formato',        cs.formato,
      'precio_botella', cs.precio_botella,
      'precio_copa',    cs.precio_copa,
      'coste_compra',   cs.coste_compra,
      'estado',         cs.estado,
      'vino_id',        cs.vino_id,
      'catalogo_vino_id', cs.catalogo_vino_id
    )
  )
  INTO v_snapshot
  FROM public.carta_simulacion cs
  WHERE cs.restaurante_id = p_restaurante_id
    AND cs.estado IN ('actual', 'nuevo');

  v_snapshot    := COALESCE(v_snapshot, '[]'::jsonb);
  v_total_vinos := jsonb_array_length(v_snapshot);

  INSERT INTO public.carta_historial (
    restaurante_id,
    published_at,
    published_by,
    total_vinos,
    vinos_snapshot
  ) VALUES (
    p_restaurante_id,
    now(),
    p_published_by,
    v_total_vinos,
    v_snapshot
  );

  -- 1. Desactivar vinos marcados 'fuera'
  UPDATE public.vinos v
  SET    activo     = false,
         updated_at = now()
  FROM   public.carta_simulacion cs
  WHERE  cs.restaurante_id = p_restaurante_id
    AND  cs.estado         = 'fuera'
    AND  v.id              = cs.vino_id;
  GET DIAGNOSTICS v_desactivados = ROW_COUNT;

  -- 2. Crear nuevos vinos con datos del catálogo del consultor.
  INSERT INTO public.vinos (
    restaurante_id,
    nombre, bodega, tipo, region,
    anada, formato_compra,
    coste_compra, precio_botella, precio_copa,
    proveedor,
    stock, stock_minimo,
    activo
  )
  SELECT
    p_restaurante_id,
    cs.nombre,
    cs.bodega,
    cs.tipo,
    cs.region,
    cs.anada,
    cs.formato,
    cs.coste_compra,
    cs.precio_botella,
    cs.precio_copa,
    pv.nombre,
    0, 0,
    true
  FROM   public.carta_simulacion         cs
  JOIN   public.proveedor_catalogo_vinos pcv ON pcv.id = cs.catalogo_vino_id
  JOIN   public.proveedores_vino         pv  ON pv.id  = pcv.proveedor_id
  WHERE  cs.restaurante_id = p_restaurante_id
    AND  cs.estado         = 'nuevo';
  GET DIAGNOSTICS v_creados = ROW_COUNT;

  -- 3. Limpiar líneas publicadas del borrador.
  DELETE FROM public.carta_simulacion
  WHERE  restaurante_id = p_restaurante_id
    AND  estado IN ('fuera', 'nuevo');
  GET DIAGNOSTICS v_borrados = ROW_COUNT;

  RETURN jsonb_build_object(
    'desactivados', v_desactivados,
    'creados',      v_creados,
    'borrados',     v_borrados,
    'snapshot_vinos', v_total_vinos
  );
END;
$$;

-- Solo la service_role puede invocar esta función.
REVOKE EXECUTE ON FUNCTION public.publicar_simulacion(uuid, text) FROM PUBLIC;

-- ── Función restaurar_snapshot ────────────────────────────────────────────────
-- Carga una instantánea del historial como nuevo borrador del simulador.
-- Borra las líneas actuales del borrador (fuera y nuevo) y añade las del snapshot
-- como líneas 'actual', para que el sommelier las revise antes de publicar.

CREATE OR REPLACE FUNCTION public.restaurar_snapshot(
  p_restaurante_id uuid,
  p_snapshot_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snap       record;
  v_vino       jsonb;
  v_restauradas int := 0;
BEGIN
  -- Obtener el snapshot
  SELECT * INTO v_snap
  FROM public.carta_historial
  WHERE id = p_snapshot_id
    AND restaurante_id = p_restaurante_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot no encontrado o no pertenece a este restaurante';
  END IF;

  -- Borrar líneas 'fuera' y 'nuevo' del borrador actual (las que no están en carta oficial)
  DELETE FROM public.carta_simulacion
  WHERE  restaurante_id = p_restaurante_id
    AND  estado IN ('fuera', 'nuevo');

  -- Marcar todas las líneas 'actual' restantes como 'fuera' para limpiar el borrador
  UPDATE public.carta_simulacion
  SET    estado     = 'fuera',
         updated_at = now()
  WHERE  restaurante_id = p_restaurante_id
    AND  estado        = 'actual';

  -- Insertar las líneas del snapshot como 'actual' usando ON CONFLICT para evitar duplicados.
  -- Solo insertamos líneas del snapshot que tengan vino_id (vinos propios del restaurante).
  -- Las líneas sin vino_id (catalogo_vino_id) se insertan como 'nuevo' con datos del snapshot.
  FOR v_vino IN SELECT * FROM jsonb_array_elements(v_snap.vinos_snapshot)
  LOOP
    IF (v_vino->>'vino_id') IS NOT NULL THEN
      INSERT INTO public.carta_simulacion (
        restaurante_id, vino_id,
        nombre, bodega, tipo, region, anada, formato,
        precio_botella, precio_copa, coste_compra,
        estado
      ) VALUES (
        p_restaurante_id,
        (v_vino->>'vino_id')::uuid,
        v_vino->>'nombre',
        v_vino->>'bodega',
        v_vino->>'tipo',
        v_vino->>'region',
        v_vino->>'anada',
        v_vino->>'formato',
        (v_vino->>'precio_botella')::numeric,
        (v_vino->>'precio_copa')::numeric,
        (v_vino->>'coste_compra')::numeric,
        'actual'
      )
      ON CONFLICT ON CONSTRAINT carta_simulacion_vino_uidx
      DO UPDATE SET
        estado         = 'actual',
        precio_botella = EXCLUDED.precio_botella,
        precio_copa    = EXCLUDED.precio_copa,
        coste_compra   = EXCLUDED.coste_compra,
        updated_at     = now();
    ELSE
      INSERT INTO public.carta_simulacion (
        restaurante_id, catalogo_vino_id,
        nombre, bodega, tipo, region, anada, formato,
        precio_botella, precio_copa, coste_compra,
        estado
      ) VALUES (
        p_restaurante_id,
        (v_vino->>'catalogo_vino_id')::uuid,
        v_vino->>'nombre',
        v_vino->>'bodega',
        v_vino->>'tipo',
        v_vino->>'region',
        v_vino->>'anada',
        v_vino->>'formato',
        (v_vino->>'precio_botella')::numeric,
        (v_vino->>'precio_copa')::numeric,
        (v_vino->>'coste_compra')::numeric,
        'nuevo'
      )
      ON CONFLICT ON CONSTRAINT carta_simulacion_catalogo_uidx
      DO UPDATE SET
        estado         = 'nuevo',
        precio_botella = EXCLUDED.precio_botella,
        precio_copa    = EXCLUDED.precio_copa,
        coste_compra   = EXCLUDED.coste_compra,
        updated_at     = now();
    END IF;

    v_restauradas := v_restauradas + 1;
  END LOOP;

  RETURN jsonb_build_object('restauradas', v_restauradas);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restaurar_snapshot(uuid, uuid) FROM PUBLIC;
