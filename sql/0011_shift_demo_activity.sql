-- 0011_shift_demo_activity.sql
-- Migración expand-only: tabla de log + función RPC para desplazar fechas
-- de actividad del restaurante demo Casa Marisma.
--
-- Diseñada como idempotente: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE.
-- La función está blindada al UUID de Casa Marisma: cualquier otro destino
-- aborta con RAISE EXCEPTION.
--
-- No hace DELETE, DROP ni UPDATE sin WHERE (R2). Todos los UPDATE son
-- scoped a restaurante_id = target.
--
-- Aplicar en Supabase con:
--   psql "$DATABASE_URL" -f sql/0011_shift_demo_activity.sql
-- Rollback:
--   psql "$DATABASE_URL" -f sql/0011_shift_demo_activity_rollback.sql

-- ── Tabla de log ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.demo_activity_shift_log (
  id              bigserial PRIMARY KEY,
  restaurante_id  uuid NOT NULL,
  ran_at          timestamptz NOT NULL DEFAULT now(),
  modo            text NOT NULL CHECK (modo IN ('dry_run','apply')),
  delta_dias      integer NOT NULL,
  last_sale_before date,
  last_sale_after  date,
  counts          jsonb NOT NULL DEFAULT '{}'::jsonb,
  notas           text
);

CREATE INDEX IF NOT EXISTS idx_demo_activity_shift_log_rest
  ON public.demo_activity_shift_log(restaurante_id, ran_at DESC);

-- ── Función RPC ──────────────────────────────────────────────────────────────
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
    -- Aun así registra en log para auditar.
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

    -- cierres_servicio puede no existir en entornos antiguos.
    BEGIN
      EXECUTE 'SELECT count(*) FROM public.cierres_servicio WHERE restaurante_id = $1' INTO tmp_count USING p_target_id;
      counts := counts || jsonb_build_object('cierres_servicio', tmp_count);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE 'SELECT count(*) FROM public.movimientos_stock WHERE restaurante_id = $1' INTO tmp_count USING p_target_id;
      counts := counts || jsonb_build_object('movimientos_stock', tmp_count);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE 'SELECT count(*) FROM public.libro_compras WHERE restaurante_id = $1' INTO tmp_count USING p_target_id;
      counts := counts || jsonb_build_object('libro_compras', tmp_count);
    EXCEPTION WHEN undefined_table THEN NULL; END;

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
    VALUES (p_target_id, 'dry_run', p_delta_dias, last_sale_bef, last_sale_aft, counts, NULL);

    RETURN jsonb_build_object(
      'dry_run', true,
      'delta_dias', p_delta_dias,
      'last_sale_before', last_sale_bef,
      'last_sale_after', last_sale_aft,
      'rows_affected', counts
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

  -- Opcionales (saltan si la tabla no existe en el entorno).
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

  -- libro_compras: desplaza el campo "fecha" dentro de cada elemento del JSONB "facturas".
  -- No toca periodo (YYYY-MM) ni proveedor; sólo las fechas de las facturas.
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

  -- NO tocamos: stock actual, parametros_explotacion, historico_mensual,
  -- presupuesto_mensual, configuracion_bonus, configuracion_pricing,
  -- tramos_multiplicador, restaurantes, vinos, favoritos, propuestas.

  -- 5) Última venta después.
  SELECT max((created_at AT TIME ZONE 'Europe/Madrid')::date)
    INTO last_sale_aft
    FROM public.estadisticas
   WHERE restaurante_id = p_target_id AND tipo = 'venta';

  INSERT INTO public.demo_activity_shift_log (restaurante_id, modo, delta_dias, last_sale_before, last_sale_after, counts, notas)
  VALUES (p_target_id, 'apply', p_delta_dias, last_sale_bef, last_sale_aft, counts, NULL);

  RETURN jsonb_build_object(
    'applied', true,
    'delta_dias', p_delta_dias,
    'last_sale_before', last_sale_bef,
    'last_sale_after', last_sale_aft,
    'rows_affected', counts
  );
END;
$$;

-- Nota: GRANT para que la clave de servicio pueda invocarla; no concedemos
-- a anon ni authenticated.
REVOKE ALL ON FUNCTION public.shift_demo_activity_dates(uuid, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shift_demo_activity_dates(uuid, integer, boolean) TO service_role;
