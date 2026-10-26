-- ============================================================
-- ROLLBACK — Auditoría de seguridad 2026-10
-- ============================================================
-- Ejecutar si algún bloque de security_audit_2026_10_rls_hardening.sql rompe algo.
-- Restaura el estado exacto previo a la migración.

-- ── Bloque B: eliminar políticas restrictivas añadidas ──────
DROP POLICY IF EXISTS "consumos_ia_deny_public"       ON public.consumos_ia;
DROP POLICY IF EXISTS "demo_analytics_deny_public"    ON public.demo_analytics_events;
DROP POLICY IF EXISTS "sesiones_uso_deny_public"      ON public.sesiones_uso;
DROP POLICY IF EXISTS "rate_limits_deny_anon"         ON public.rate_limits;

-- ── Bloque A3: restaurar GRANT PUBLIC a sustituir_vino_simulacion ────────────
GRANT EXECUTE ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric
) TO PUBLIC;

-- ── Bloque A2: restaurar GRANT PUBLIC a merge_cierre_pasos ──────────────────
GRANT EXECUTE ON FUNCTION public.merge_cierre_pasos(uuid, date, jsonb) TO PUBLIC;

-- ── Bloque A1: restaurar registrar_compra_con_pmp sin ownership check ────────
-- Cuerpo original sin la validación de v_caller_uid
CREATE OR REPLACE FUNCTION public.registrar_compra_con_pmp(
  p_restaurante_id   uuid,
  p_cabecera         jsonb,
  p_lineas           jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cabecera_id      uuid;
  v_proveedor        text;
  v_fecha            date;
  v_num_doc          text;
  v_ref_ext          text;
  v_desc_global      numeric(5,2);
  v_iva_pct          numeric(5,2);
  v_origen           text;
  v_notas            text;

  v_linea            jsonb;
  v_vino_id          uuid;
  v_uds              integer;
  v_uds_bon          integer;
  v_uds_totales      integer;
  v_precio_tarifa    numeric(10,4);
  v_desc_linea       numeric(5,2);
  v_importe_neto     numeric(14,4);
  v_iva_importe      numeric(14,4);
  v_precio_neto_ud   numeric(10,4);

  v_stock_actual     integer;
  v_pmp_actual       numeric(10,4);
  v_coste_compra_act numeric(10,2);
  v_pmp_base         numeric(10,4);
  v_pmp_nuevo        numeric(10,4);

  v_resultado        jsonb := '[]'::jsonb;
BEGIN
  -- ── Validaciones de cabecera ────────────────────────────────────────────────
  v_proveedor   := btrim(COALESCE(p_cabecera ->> 'proveedor', ''));
  v_fecha       := (p_cabecera ->> 'fecha')::date;
  v_num_doc     := NULLIF(btrim(COALESCE(p_cabecera ->> 'numero_documento', '')), '');
  v_ref_ext     := NULLIF(btrim(COALESCE(p_cabecera ->> 'referencia_externa', '')), '');
  v_desc_global := COALESCE((p_cabecera ->> 'descuento_global')::numeric, 0);
  v_iva_pct     := COALESCE((p_cabecera ->> 'iva_pct')::numeric, 21);
  v_origen      := COALESCE(NULLIF(btrim(COALESCE(p_cabecera ->> 'origen', '')), ''), 'manual');
  v_notas       := NULLIF(btrim(COALESCE(p_cabecera ->> 'notas', '')), '');

  IF length(v_proveedor) = 0 THEN
    RAISE EXCEPTION 'proveedor_requerido';
  END IF;
  IF v_fecha IS NULL THEN
    RAISE EXCEPTION 'fecha_requerida';
  END IF;
  IF v_origen NOT IN ('manual', 'importacion') THEN
    RAISE EXCEPTION 'origen_invalido: %', v_origen;
  END IF;
  IF jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'lineas_vacias';
  END IF;
  IF jsonb_array_length(p_lineas) > 200 THEN
    RAISE EXCEPTION 'demasiadas_lineas';
  END IF;

  -- ── Insertar cabecera ───────────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.cabecera_compras (
      restaurante_id, proveedor, fecha, numero_documento, referencia_externa,
      descuento_global, iva_pct, notas, origen, estado
    ) VALUES (
      p_restaurante_id, v_proveedor, v_fecha, v_num_doc, v_ref_ext,
      v_desc_global, v_iva_pct, v_notas, v_origen, 'aplicada'
    )
    RETURNING id INTO v_cabecera_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_exists';
  END;

  -- ── Procesar líneas ─────────────────────────────────────────────────────────
  FOR v_linea IN SELECT value FROM jsonb_array_elements(p_lineas)
  LOOP
    v_vino_id       := (v_linea ->> 'vino_id')::uuid;
    v_uds           := (v_linea ->> 'uds')::integer;
    v_uds_bon       := COALESCE((v_linea ->> 'uds_bonificadas')::integer, 0);
    v_precio_tarifa := (v_linea ->> 'precio_tarifa')::numeric;
    v_desc_linea    := COALESCE((v_linea ->> 'descuento_linea')::numeric, 0);

    IF v_vino_id IS NULL THEN
      RAISE EXCEPTION 'vino_id_requerido';
    END IF;
    IF v_uds IS NULL OR v_uds <= 0 THEN
      RAISE EXCEPTION 'uds_invalidas para vino %', v_vino_id;
    END IF;
    IF v_uds_bon < 0 THEN
      RAISE EXCEPTION 'uds_bonificadas negativas para vino %', v_vino_id;
    END IF;
    IF v_precio_tarifa IS NULL OR v_precio_tarifa < 0 THEN
      RAISE EXCEPTION 'precio_tarifa_invalido para vino %', v_vino_id;
    END IF;

    v_uds_totales := v_uds + v_uds_bon;

    v_importe_neto := round(
      v_precio_tarifa
      * v_uds
      * (1 - v_desc_linea  / 100.0)
      * (1 - v_desc_global / 100.0),
      4
    );
    v_precio_neto_ud := round(v_importe_neto / v_uds_totales, 4);
    v_iva_importe    := round(v_importe_neto * v_iva_pct / 100.0, 4);

    SELECT stock, coste_medio_pmp, coste_compra
      INTO v_stock_actual, v_pmp_actual, v_coste_compra_act
    FROM public.vinos
    WHERE id = v_vino_id
      AND restaurante_id = p_restaurante_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'vino_no_encontrado: %', v_vino_id;
    END IF;

    v_pmp_base := COALESCE(v_pmp_actual, v_coste_compra_act);

    IF COALESCE(v_stock_actual, 0) <= 0 OR v_pmp_base IS NULL OR v_pmp_base = 0 THEN
      v_pmp_nuevo := v_precio_neto_ud;
    ELSE
      v_pmp_nuevo := round(
        (v_stock_actual * v_pmp_base + v_uds_totales * v_precio_neto_ud)
          / (v_stock_actual + v_uds_totales),
        4
      );
    END IF;

    UPDATE public.vinos
    SET
      stock           = COALESCE(stock, 0) + v_uds_totales,
      coste_medio_pmp = v_pmp_nuevo,
      coste_compra    = round(v_precio_neto_ud, 2)
    WHERE id = v_vino_id;

    INSERT INTO public.lineas_compra (
      cabecera_id, restaurante_id, vino_id,
      uds, uds_bonificadas, precio_tarifa, descuento_linea,
      precio_neto_ud, importe_neto, iva_importe
    ) VALUES (
      v_cabecera_id, p_restaurante_id, v_vino_id,
      v_uds, v_uds_bon, v_precio_tarifa, v_desc_linea,
      v_precio_neto_ud, v_importe_neto, v_iva_importe
    );

    INSERT INTO public.movimientos_stock (
      restaurante_id, vino_id, tipo, cantidad,
      stock_anterior, stock_nuevo,
      motivo, coste_medio_ponderado,
      origen, cabecera_compra_id
    ) VALUES (
      p_restaurante_id, v_vino_id, 'compra', v_uds_totales,
      COALESCE(v_stock_actual, 0), COALESCE(v_stock_actual, 0) + v_uds_totales,
      COALESCE(v_notas, 'Compra ' || v_proveedor),
      v_precio_neto_ud,
      v_origen,
      v_cabecera_id
    );

    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object(
      'vino_id',        v_vino_id,
      'uds',            v_uds_totales,
      'precio_neto_ud', v_precio_neto_ud,
      'pmp_nuevo',      v_pmp_nuevo,
      'importe_neto',   v_importe_neto
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'cabecera_id', v_cabecera_id,
    'lineas',      v_resultado
  );
END;
$$;

-- Restaurar grants originales (service_role + authenticated)
REVOKE ALL ON FUNCTION public.registrar_compra_con_pmp(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_compra_con_pmp(uuid, jsonb, jsonb) TO service_role, authenticated;
