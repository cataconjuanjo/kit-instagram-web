-- Rollback de 0014_shift_demo_activity_v2.sql
--
-- Restaura la definición original de shift_demo_activity_dates que SÍ
-- toca libro_compras (idéntica a la de sql/0011_shift_demo_activity.sql).
-- No borra la función: la reemplaza por la v1 vía CREATE OR REPLACE.
-- No toca la tabla public.demo_activity_shift_log ni los grants.

CREATE OR REPLACE FUNCTION public.shift_demo_activity_dates(
  p_target_id   uuid,
  p_delta_dias  integer,
  p_dry_run     boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  CASA_MARISMA_ID uuid := '65d26545-7c7e-424c-9c29-33bfe8bbaafa';
  rest_nombre     text;
  counts          jsonb := '{}'::jsonb;
  tmp_count       integer;
  last_sale_bef   date;
  last_sale_aft   date;
  iv              interval;
BEGIN
  IF p_target_id IS DISTINCT FROM CASA_MARISMA_ID THEN
    RAISE EXCEPTION 'shift_demo_activity_dates: target % no permitido. Solo Casa Marisma.', p_target_id;
  END IF;

  SELECT nombre INTO rest_nombre FROM public.restaurantes WHERE id = p_target_id;
  IF rest_nombre IS NULL THEN
    RAISE EXCEPTION 'shift_demo_activity_dates: restaurante % no encontrado.', p_target_id;
  END IF;
  IF lower(rest_nombre) <> 'casa marisma' THEN
    RAISE EXCEPTION 'shift_demo_activity_dates: nombre inesperado "%" para %.', rest_nombre, p_target_id;
  END IF;

  SELECT max((created_at AT TIME ZONE 'Europe/Madrid')::date)
    INTO last_sale_bef
    FROM public.estadisticas
   WHERE restaurante_id = p_target_id AND tipo = 'venta';

  IF p_delta_dias <= 0 THEN
    INSERT INTO public.demo_activity_shift_log (restaurante_id, modo, delta_dias, last_sale_before, last_sale_after, counts, notas)
    VALUES (p_target_id, CASE WHEN p_dry_run THEN 'dry_run' ELSE 'apply' END, p_delta_dias, last_sale_bef, last_sale_bef, counts, 'delta<=0, no-op');
    RETURN jsonb_build_object(
      'skipped', true, 'reason', 'delta_dias <= 0',
      'delta_dias', p_delta_dias, 'last_sale_before', last_sale_bef
    );
  END IF;

  iv := make_interval(days => p_delta_dias);

  IF p_dry_run THEN
    SELECT count(*) INTO tmp_count FROM public.estadisticas WHERE restaurante_id = p_target_id;
    counts := counts || jsonb_build_object('estadisticas', tmp_count);
    SELECT count(*) INTO tmp_count FROM public.partes_servicio WHERE restaurante_id = p_target_id;
    counts := counts || jsonb_build_object('partes_servicio', tmp_count);
    SELECT count(*) INTO tmp_count FROM public.partes_servicio_lineas WHERE restaurante_id = p_target_id;
    counts := counts || jsonb_build_object('partes_servicio_lineas', tmp_count);
    BEGIN EXECUTE 'SELECT count(*) FROM public.cierres_servicio WHERE restaurante_id = $1' INTO tmp_count USING p_target_id;
      counts := counts || jsonb_build_object('cierres_servicio', tmp_count);
    EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN EXECUTE 'SELECT count(*) FROM public.movimientos_stock WHERE restaurante_id = $1' INTO tmp_count USING p_target_id;
      counts := counts || jsonb_build_object('movimientos_stock', tmp_count);
    EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN EXECUTE 'SELECT count(*) FROM public.libro_compras WHERE restaurante_id = $1' INTO tmp_count USING p_target_id;
      counts := counts || jsonb_build_object('libro_compras', tmp_count);
    EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN EXECUTE 'SELECT count(*) FROM public.recommendation_exposures WHERE restaurante_id = $1' INTO tmp_count USING p_target_id;
      counts := counts || jsonb_build_object('recommendation_exposures', tmp_count);
    EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN EXECUTE 'SELECT count(*) FROM public.recommendation_outcomes WHERE restaurante_id = $1' INTO tmp_count USING p_target_id;
      counts := counts || jsonb_build_object('recommendation_outcomes', tmp_count);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    last_sale_aft := last_sale_bef + p_delta_dias;
    INSERT INTO public.demo_activity_shift_log (restaurante_id, modo, delta_dias, last_sale_before, last_sale_after, counts, notas)
    VALUES (p_target_id, 'dry_run', p_delta_dias, last_sale_bef, last_sale_aft, counts, 'rollback a v1');
    RETURN jsonb_build_object('dry_run', true, 'delta_dias', p_delta_dias,
      'last_sale_before', last_sale_bef, 'last_sale_after', last_sale_aft, 'rows_affected', counts);
  END IF;

  UPDATE public.estadisticas SET created_at = created_at + iv WHERE restaurante_id = p_target_id;
  GET DIAGNOSTICS tmp_count = ROW_COUNT;
  counts := counts || jsonb_build_object('estadisticas', tmp_count);

  UPDATE public.partes_servicio
     SET fecha = fecha + p_delta_dias,
         created_at = created_at + iv,
         cerrado_at = CASE WHEN cerrado_at IS NULL THEN NULL ELSE cerrado_at + iv END
   WHERE restaurante_id = p_target_id;
  GET DIAGNOSTICS tmp_count = ROW_COUNT;
  counts := counts || jsonb_build_object('partes_servicio', tmp_count);

  UPDATE public.partes_servicio_lineas SET created_at = created_at + iv WHERE restaurante_id = p_target_id;
  GET DIAGNOSTICS tmp_count = ROW_COUNT;
  counts := counts || jsonb_build_object('partes_servicio_lineas', tmp_count);

  BEGIN
    EXECUTE $U$
      UPDATE public.cierres_servicio
         SET fecha_servicio = fecha_servicio + $1,
             created_at     = created_at + make_interval(days => $1),
             updated_at     = updated_at + make_interval(days => $1)
       WHERE restaurante_id = $2
    $U$ USING p_delta_dias, p_target_id;
    GET DIAGNOSTICS tmp_count = ROW_COUNT;
    counts := counts || jsonb_build_object('cierres_servicio', tmp_count);
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    EXECUTE $U$
      UPDATE public.movimientos_stock
         SET created_at = created_at + make_interval(days => $1)
       WHERE restaurante_id = $2
    $U$ USING p_delta_dias, p_target_id;
    GET DIAGNOSTICS tmp_count = ROW_COUNT;
    counts := counts || jsonb_build_object('movimientos_stock', tmp_count);
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- v1 (restaurada por el rollback): SÍ toca libro_compras.
  BEGIN
    EXECUTE $U$
      UPDATE public.libro_compras
         SET facturas = (
           SELECT COALESCE(jsonb_agg(
             CASE
               WHEN elem ? 'fecha' AND elem->>'fecha' ~ '^\d{4}-\d{2}-\d{2}$'
                 THEN jsonb_set(elem, '{fecha}', to_jsonb(((elem->>'fecha')::date + $1)::text))
               ELSE elem
             END
           ), '[]'::jsonb)
           FROM jsonb_array_elements(facturas) elem
         )
       WHERE restaurante_id = $2
    $U$ USING p_delta_dias, p_target_id;
    GET DIAGNOSTICS tmp_count = ROW_COUNT;
    counts := counts || jsonb_build_object('libro_compras', tmp_count);
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    EXECUTE $U$
      UPDATE public.recommendation_exposures
         SET created_at     = created_at + make_interval(days => $1),
             servicio_fecha = servicio_fecha + $1
       WHERE restaurante_id = $2
    $U$ USING p_delta_dias, p_target_id;
    GET DIAGNOSTICS tmp_count = ROW_COUNT;
    counts := counts || jsonb_build_object('recommendation_exposures', tmp_count);
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    EXECUTE $U$
      UPDATE public.recommendation_outcomes
         SET created_at     = created_at + make_interval(days => $1),
             servicio_fecha = servicio_fecha + $1
       WHERE restaurante_id = $2
    $U$ USING p_delta_dias, p_target_id;
    GET DIAGNOSTICS tmp_count = ROW_COUNT;
    counts := counts || jsonb_build_object('recommendation_outcomes', tmp_count);
  EXCEPTION WHEN undefined_table THEN NULL; END;

  SELECT max((created_at AT TIME ZONE 'Europe/Madrid')::date)
    INTO last_sale_aft
    FROM public.estadisticas
   WHERE restaurante_id = p_target_id AND tipo = 'venta';

  INSERT INTO public.demo_activity_shift_log (restaurante_id, modo, delta_dias, last_sale_before, last_sale_after, counts, notas)
  VALUES (p_target_id, 'apply', p_delta_dias, last_sale_bef, last_sale_aft, counts, 'rollback a v1');

  RETURN jsonb_build_object('applied', true, 'delta_dias', p_delta_dias,
    'last_sale_before', last_sale_bef, 'last_sale_after', last_sale_aft, 'rows_affected', counts);
END;
$$;

REVOKE ALL ON FUNCTION public.shift_demo_activity_dates(uuid, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shift_demo_activity_dates(uuid, integer, boolean) TO service_role;
