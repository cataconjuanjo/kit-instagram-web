-- 0015_shift_demo_activity_v3.sql
--
-- Sustituye public.shift_demo_activity_dates (v2 en sql/0014) por una
-- versión que evita colisiones de UNIQUE al desplazar en una sola pasada
-- `partes_servicio.fecha` y `cierres_servicio.fecha_servicio`.
--
-- Problema v2: ambas tablas tienen una UNIQUE que incluye la fecha
--   partes_servicio   UNIQUE (restaurante_id, fecha, turno)
--   cierres_servicio  UNIQUE (restaurante_id, fecha_servicio)
-- Con partes consecutivas y delta > 0, el UPDATE en una sola pasada
-- colisiona fila a fila contra posiciones aún no movidas.
--
-- Fix v3: desplazamiento en DOS FASES dentro de la misma transacción,
-- solo para las columnas de la clave UNIQUE:
--   fase 1   fecha = fecha + (p_delta_dias + 36500)  -- ~100 años al futuro
--   fase 2   fecha = fecha - 36500                   -- vuelve al destino
-- Resultado neto: +p_delta_dias, pero las posiciones intermedias están
-- fuera del rango real y no colisionan contra nada.
-- `created_at`, `updated_at` y `cerrado_at` siguen con un único UPDATE
-- (no participan en la UNIQUE).
--
-- Dry-run: cuenta colisiones informativas (parejas A, B del mismo
-- restaurante donde el destino de A coincide con la fecha actual de B).
-- No inserta en demo_activity_shift_log (solo el apply lo hace).
--
-- Resto igual que v2:
-- - libro_compras EXCLUIDO (periodo/fechas se desacoplarían).
-- - Blindaje UUID + nombre.
-- - SECURITY DEFINER, search_path = public.
-- - Grants: service_role únicamente (no anon ni authenticated).
--
-- Aplicar:   psql "$DATABASE_URL" -f sql/0015_shift_demo_activity_v3.sql
-- Rollback:  psql "$DATABASE_URL" -f sql/0015_shift_demo_activity_v3_rollback.sql
--            (restaura la definición de 0014, v2).

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
  colisiones_partes  integer := 0;
  colisiones_cierres integer := 0;
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
    -- Solo deja huella en log si es apply; el dry-run nunca escribe.
    IF NOT p_dry_run THEN
      INSERT INTO public.demo_activity_shift_log (restaurante_id, modo, delta_dias, last_sale_before, last_sale_after, counts, notas)
      VALUES (p_target_id, 'apply', p_delta_dias, last_sale_bef, last_sale_bef, counts, 'v3: delta<=0, no-op');
    END IF;
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'delta_dias <= 0',
      'delta_dias', p_delta_dias,
      'last_sale_before', last_sale_bef
    );
  END IF;

  iv := make_interval(days => p_delta_dias);

  -- 3) Dry-run: contamos filas afectadas y posibles colisiones. No escribe.
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

    -- libro_compras EXCLUIDO (v2+). El seed del Bloque 2 ya lo deja con
    -- fechas verosímiles dentro de cada periodo: no lo desplazamos aquí.
    counts := counts || jsonb_build_object('libro_compras', 0);

    BEGIN
      EXECUTE 'SELECT count(*) FROM public.recommendation_exposures WHERE restaurante_id = $1' INTO tmp_count USING p_target_id;
      counts := counts || jsonb_build_object('recommendation_exposures', tmp_count);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
      EXECUTE 'SELECT count(*) FROM public.recommendation_outcomes WHERE restaurante_id = $1' INTO tmp_count USING p_target_id;
      counts := counts || jsonb_build_object('recommendation_outcomes', tmp_count);
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- Colisiones informativas: cuántas filas de partes_servicio caerían
    -- encima de otra fila existente (misma clave única) si no hiciéramos
    -- el truco de dos fases. Es solo diagnóstico — la v3 lo evita.
    SELECT count(*)
      INTO colisiones_partes
      FROM public.partes_servicio a
      JOIN public.partes_servicio b
        ON a.restaurante_id = b.restaurante_id
       AND a.turno          = b.turno
       AND (a.fecha + p_delta_dias) = b.fecha
     WHERE a.restaurante_id = p_target_id
       AND a.id <> b.id;

    BEGIN
      EXECUTE $U$
        SELECT count(*)
          FROM public.cierres_servicio a
          JOIN public.cierres_servicio b
            ON a.restaurante_id = b.restaurante_id
           AND (a.fecha_servicio + $1) = b.fecha_servicio
         WHERE a.restaurante_id = $2
           AND a.id <> b.id
      $U$ INTO colisiones_cierres USING p_delta_dias, p_target_id;
    EXCEPTION WHEN undefined_table THEN colisiones_cierres := 0; END;

    last_sale_aft := last_sale_bef + p_delta_dias;

    -- DRY-RUN NO ESCRIBE EN demo_activity_shift_log (petición explícita).

    RETURN jsonb_build_object(
      'dry_run', true,
      'delta_dias', p_delta_dias,
      'last_sale_before', last_sale_bef,
      'last_sale_after', last_sale_aft,
      'rows_affected', counts,
      'collisions_if_single_pass', jsonb_build_object(
        'partes_servicio',  colisiones_partes,
        'cierres_servicio', colisiones_cierres
      ),
      'notes', jsonb_build_object(
        'libro_compras',   'excluido en v2+: periodo y facturas[].fecha se desacoplarían',
        'partes_servicio', 'v3 desplaza fecha en dos fases (+' || (p_delta_dias + 36500) || ', -36500) para evitar colisiones de UNIQUE',
        'cierres_servicio', 'v3 desplaza fecha_servicio en dos fases (+' || (p_delta_dias + 36500) || ', -36500) para evitar colisiones de UNIQUE'
      )
    );
  END IF;

  -- 4) APPLY: una pasada por tabla, dos fases donde haya UNIQUE con fecha.

  UPDATE public.estadisticas
     SET created_at = created_at + iv
   WHERE restaurante_id = p_target_id;
  GET DIAGNOSTICS tmp_count = ROW_COUNT;
  counts := counts || jsonb_build_object('estadisticas', tmp_count);

  -- partes_servicio: fecha va en DOS FASES; created_at y cerrado_at van
  -- en una sola (no participan en la UNIQUE).
  UPDATE public.partes_servicio
     SET fecha      = fecha + (p_delta_dias + 36500),
         created_at = created_at + iv,
         cerrado_at = CASE WHEN cerrado_at IS NULL THEN NULL ELSE cerrado_at + iv END
   WHERE restaurante_id = p_target_id;
  GET DIAGNOSTICS tmp_count = ROW_COUNT;
  UPDATE public.partes_servicio
     SET fecha = fecha - 36500
   WHERE restaurante_id = p_target_id;
  counts := counts || jsonb_build_object('partes_servicio', tmp_count);

  UPDATE public.partes_servicio_lineas
     SET created_at = created_at + iv
   WHERE restaurante_id = p_target_id;
  GET DIAGNOSTICS tmp_count = ROW_COUNT;
  counts := counts || jsonb_build_object('partes_servicio_lineas', tmp_count);

  -- cierres_servicio: fecha_servicio va en DOS FASES; created_at y
  -- updated_at van en una sola pasada junto con la primera.
  BEGIN
    EXECUTE $U$
      UPDATE public.cierres_servicio
         SET fecha_servicio = fecha_servicio + ($1 + 36500),
             created_at     = created_at + make_interval(days => $1),
             updated_at     = updated_at + make_interval(days => $1)
       WHERE restaurante_id = $2
    $U$ USING p_delta_dias, p_target_id;
    GET DIAGNOSTICS tmp_count = ROW_COUNT;
    EXECUTE $U$
      UPDATE public.cierres_servicio
         SET fecha_servicio = fecha_servicio - 36500
       WHERE restaurante_id = $1
    $U$ USING p_target_id;
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

  -- libro_compras EXCLUIDO intencionalmente (v2+).
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

  -- NO tocamos: libro_compras (v2+), stock actual, parametros_explotacion,
  -- historico_mensual, presupuesto_mensual, configuracion_bonus,
  -- configuracion_pricing, tramos_multiplicador, restaurantes, vinos,
  -- favoritos, propuestas.

  SELECT max((created_at AT TIME ZONE 'Europe/Madrid')::date)
    INTO last_sale_aft
    FROM public.estadisticas
   WHERE restaurante_id = p_target_id AND tipo = 'venta';

  INSERT INTO public.demo_activity_shift_log (restaurante_id, modo, delta_dias, last_sale_before, last_sale_after, counts, notas)
  VALUES (p_target_id, 'apply', p_delta_dias, last_sale_bef, last_sale_aft, counts, 'v3: libro_compras excluido, partes/cierres en dos fases');

  RETURN jsonb_build_object(
    'applied', true,
    'delta_dias', p_delta_dias,
    'last_sale_before', last_sale_bef,
    'last_sale_after', last_sale_aft,
    'rows_affected', counts,
    'notes', jsonb_build_object(
      'libro_compras',   'excluido en v2+: periodo y facturas[].fecha se desacoplarían',
      'partes_servicio', 'v3 desplazó fecha en dos fases para evitar colisiones de UNIQUE',
      'cierres_servicio', 'v3 desplazó fecha_servicio en dos fases para evitar colisiones de UNIQUE'
    )
  );
END;
$$;

-- Grants (idénticos a 0011/0014: solo service_role).
REVOKE ALL ON FUNCTION public.shift_demo_activity_dates(uuid, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shift_demo_activity_dates(uuid, integer, boolean) TO service_role;
