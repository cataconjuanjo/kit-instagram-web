-- 0014_shift_demo_activity_v2.sql
--
-- Sustituye la función public.shift_demo_activity_dates creada en
-- sql/0011_shift_demo_activity.sql por una versión idéntica en todo
-- excepto que NO toca public.libro_compras.
--
-- Motivo: libro_compras tiene dos campos de tiempo que deben ir
-- sincronizados — `periodo` (text 'YYYY-MM') y cada `facturas[].fecha`
-- (text 'YYYY-MM-DD'). La versión 0011 desplazaba las fechas de las
-- facturas pero no el periodo; al desplazar +N días, las facturas del
-- mes en curso quedaban fechadas en el mes siguiente mientras su fila
-- seguía bajo el periodo original. Además, con un delta razonable (p.
-- ej. +21 días para una demo el 1 de diciembre), las facturas más
-- recientes del mes en curso quedaban en el FUTURO.
--
-- Decisión: en demo, dejar libro_compras intacto. El seed del Bloque 2
-- ya genera facturas con fechas verosímiles dentro de cada periodo
-- (últimos 6 meses). Como no se desplaza, la vista "Libro de Compras"
-- sigue viéndose coherente el día de la presentación — los importes y
-- distribución entre proveedores son el mensaje, no las fechas exactas.
--
-- Esta migración es REEMPLAZO IDEMPOTENTE (CREATE OR REPLACE FUNCTION).
-- No añade/suprime tablas ni grants. Sigue blindada al UUID de Casa
-- Marisma y validación de nombre.
--
-- Aplicar:   psql "$DATABASE_URL" -f sql/0014_shift_demo_activity_v2.sql
-- Rollback:  psql "$DATABASE_URL" -f sql/0014_shift_demo_activity_v2_rollback.sql
--            (restaura la definición de 0011).

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
  -- 1) Blindaje: solo Casa Marisma, y debe tener nombre esperado.
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

  -- 2) Última venta antes del desplazamiento.
  SELECT max((created_at AT TIME ZONE 'Europe/Madrid')::date)
    INTO last_sale_bef
    FROM public.estadisticas
   WHERE restaurante_id = p_target_id AND tipo = 'venta';

  IF p_delta_dias <= 0 THEN
    INSERT INTO public.demo_activity_shift_log (restaurante_id, modo, delta_dias, last_sale_before, last_sale_after, counts, notas)
    VALUES (p_target_id, CASE WHEN p_dry_run THEN 'dry_run' ELSE 'apply' END, p_delta_dias, last_sale_bef, last_sale_bef, counts, 'delta<=0, no-op');
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'delta_dias <= 0',
      'delta_dias', p_delta_dias,
      'last_sale_before', last_sale_bef
    );
  END IF;

  iv := make_interval(days => p_delta_dias);

  -- 3) Para dry-run contamos sin tocar.
  IF p_dry_run THEN
    SELECT count(*) INTO tmp_count FROM public.estadisticas WHERE restaurante_id = p_target_id;
    counts := counts || jsonb_build_object('estadisticas', tmp_count);

    SELECT count(*) INTO tmp_count FROM public.partes_servicio WHERE restaurante_id = p_target_id;
    counts := counts || jsonb_build_object('partes_servicio', tmp_count);

    SELECT count(*) INTO tmp_count FROM public.partes_servicio_lineas WHERE restaurante_id = p_target_id;
    counts := counts || jsonb_build_object('partes_servicio_lineas', tmp_count);

    BEGIN
      EXECUTE 'SELECT count(*) FROM public.cierres_servicio WHERE restaurante_id = $1' INTO tmp_count USING p_target_id;
      counts := counts || jsonb_build_object('cierres_servicio', tmp_count);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE 'SELECT count(*) FROM public.movimientos_stock WHERE restaurante_id = $1' INTO tmp_count USING p_target_id;
      counts := counts || jsonb_build_object('movimientos_stock', tmp_count);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- libro_compras EXCLUIDO intencionalmente (v2): el campo `periodo`
    -- (YYYY-MM) no acompaña al desplazamiento de facturas[].fecha. Se
    -- marca con 0 y nota para que el informe del script lo haga visible.
    counts := counts || jsonb_build_object('libro_compras', 0);

    BEGIN
      EXECUTE 'SELECT count(*) FROM public.recommendation_exposures WHERE restaurante_id = $1' INTO tmp_count USING p_target_id;
      counts := counts || jsonb_build_object('recommendation_exposures', tmp_count);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE 'SELECT count(*) FROM public.recommendation_outcomes WHERE restaurante_id = $1' INTO tmp_count USING p_target_id;
      counts := counts || jsonb_build_object('recommendation_outcomes', tmp_count);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    last_sale_aft := last_sale_bef + p_delta_dias;

    INSERT INTO public.demo_activity_shift_log (restaurante_id, modo, delta_dias, last_sale_before, last_sale_after, counts, notas)
    VALUES (p_target_id, 'dry_run', p_delta_dias, last_sale_bef, last_sale_aft, counts, 'v2: libro_compras excluido');

    RETURN jsonb_build_object(
      'dry_run', true,
      'delta_dias', p_delta_dias,
      'last_sale_before', last_sale_bef,
      'last_sale_after', last_sale_aft,
      'rows_affected', counts,
      'notes', jsonb_build_object('libro_compras', 'excluido en v2: periodo y facturas[].fecha se desacoplarían')
    );
  END IF;

  -- 4) APPLY: una pasada de UPDATEs scoped, en el bloque atómico de esta función.

  UPDATE public.estadisticas
     SET created_at = created_at + iv
   WHERE restaurante_id = p_target_id;
  GET DIAGNOSTICS tmp_count = ROW_COUNT;
  counts := counts || jsonb_build_object('estadisticas', tmp_count);

  UPDATE public.partes_servicio
     SET fecha      = fecha + p_delta_dias,
         created_at = created_at + iv,
         cerrado_at = CASE WHEN cerrado_at IS NULL THEN NULL ELSE cerrado_at + iv END
   WHERE restaurante_id = p_target_id;
  GET DIAGNOSTICS tmp_count = ROW_COUNT;
  counts := counts || jsonb_build_object('partes_servicio', tmp_count);

  UPDATE public.partes_servicio_lineas
     SET created_at = created_at + iv
   WHERE restaurante_id = p_target_id;
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

  -- libro_compras EXCLUIDO intencionalmente (v2). El seed del Bloque 2
  -- rellena los últimos 6 meses con fechas dentro de cada periodo; al
  -- no tocarlas aquí, la tabla sigue mostrando una historia coherente
  -- el día de la demo.
  counts := counts || jsonb_build_object('libro_compras', 0);

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

  -- NO tocamos: libro_compras (v2), stock actual, parametros_explotacion,
  -- historico_mensual, presupuesto_mensual, configuracion_bonus,
  -- configuracion_pricing, tramos_multiplicador, restaurantes, vinos,
  -- favoritos, propuestas.

  SELECT max((created_at AT TIME ZONE 'Europe/Madrid')::date)
    INTO last_sale_aft
    FROM public.estadisticas
   WHERE restaurante_id = p_target_id AND tipo = 'venta';

  INSERT INTO public.demo_activity_shift_log (restaurante_id, modo, delta_dias, last_sale_before, last_sale_after, counts, notas)
  VALUES (p_target_id, 'apply', p_delta_dias, last_sale_bef, last_sale_aft, counts, 'v2: libro_compras excluido');

  RETURN jsonb_build_object(
    'applied', true,
    'delta_dias', p_delta_dias,
    'last_sale_before', last_sale_bef,
    'last_sale_after', last_sale_aft,
    'rows_affected', counts,
    'notes', jsonb_build_object('libro_compras', 'excluido en v2: periodo y facturas[].fecha se desacoplarían')
  );
END;
$$;

-- Grants (idénticos a 0011).
REVOKE ALL ON FUNCTION public.shift_demo_activity_dates(uuid, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shift_demo_activity_dates(uuid, integer, boolean) TO service_role;
