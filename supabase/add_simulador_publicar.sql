-- Función atómica para publicar el borrador del simulador de carta.
-- Ejecutar en Supabase SQL Editor después de add_carta_simulacion.sql.
--
-- La función corre como SECURITY DEFINER (como el usuario que la define, normalmente
-- el rol postgres/superuser), por lo que no está sujeta a RLS. El acceso se controla
-- revocando EXECUTE del rol PUBLIC y dejando que solo la service_role de supabaseAdmin
-- pueda invocarla desde el API route.

CREATE OR REPLACE FUNCTION public.publicar_simulacion(p_restaurante_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desactivados int := 0;
  v_creados      int := 0;
  v_borrados     int := 0;
BEGIN
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
  --    catalogo_vino_id se preserva para habilitar sync futuro de cambios.
  --    uva no se incluye: no está en carta_simulacion.
  INSERT INTO public.vinos (
    restaurante_id,
    nombre, bodega, tipo, region,
    anada, formato_compra,
    coste_compra, precio_botella, precio_copa,
    proveedor,
    catalogo_vino_id,
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
    cs.catalogo_vino_id,
    0, 0,
    true
  FROM   public.carta_simulacion         cs
  JOIN   public.proveedor_catalogo_vinos pcv ON pcv.id = cs.catalogo_vino_id
  JOIN   public.proveedores_vino         pv  ON pv.id  = pcv.proveedor_id
  WHERE  cs.restaurante_id = p_restaurante_id
    AND  cs.estado         = 'nuevo';
  GET DIAGNOSTICS v_creados = ROW_COUNT;

  -- 3. Limpiar líneas publicadas del borrador.
  --    Las líneas 'actual' permanecen; el próximo GET /api/simulador las re-sincroniza.
  DELETE FROM public.carta_simulacion
  WHERE  restaurante_id = p_restaurante_id
    AND  estado IN ('fuera', 'nuevo');
  GET DIAGNOSTICS v_borrados = ROW_COUNT;

  RETURN jsonb_build_object(
    'desactivados', v_desactivados,
    'creados',      v_creados,
    'borrados',     v_borrados
  );
END;
$$;

-- Solo la service_role puede invocar esta función (vía supabaseAdmin.rpc).
-- Los roles anon y authenticated no pueden llamarla directamente desde el cliente.
REVOKE EXECUTE ON FUNCTION public.publicar_simulacion(uuid) FROM PUBLIC;
