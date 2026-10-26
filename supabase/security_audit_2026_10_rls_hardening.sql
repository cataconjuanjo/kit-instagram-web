-- ============================================================
-- Auditoría de seguridad 2026-10 — Hardening RLS y funciones
-- VERSIÓN EJECUTABLE — reemplaza la versión con placeholder
-- ============================================================
-- INSTRUCCIONES:
--   1. Revisar cada bloque antes de aplicar.
--   2. Ejecutar en Supabase → SQL Editor, en horario de baja carga.
--   3. El fichero de rollback es security_audit_2026_10_rls_hardening_rollback.sql
--
-- QUÉ PODRÍA ROMPERSE:
--   Bloque A: Las tres funciones pierden el grant a 'authenticated'.
--             Si alguna ruta los llama directamente desde el cliente (fetch
--             directo a /rest/v1/rpc), devolverá "permission denied".
--             Verificar: compras/route.js, cierres-servicio/route.js,
--             simulador/sustituir/route.js — todos usan supabaseAdmin.
--   Bloque B: Las políticas restrictivas bloquean a todos los roles PUBLIC.
--             supabaseAdmin (service_role) salta RLS, así que estas tablas
--             siguen siendo accesibles desde el servidor.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- BLOQUE A1: registrar_compra_con_pmp
--   · Añade comprobación de ownership cuando auth.uid() ≠ NULL
--   · Cambia grant: service_role ÚNICAMENTE (antes también authenticated)
--     Motivo: solo se invoca desde app/api/compras/route.js via supabaseAdmin.rpc()
-- ────────────────────────────────────────────────────────────

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
  v_caller_uid       uuid := auth.uid();
  v_owner_email      text;
  v_caller_email     text;

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
  -- ── Validación de ownership (solo para rol authenticated) ──────────────────
  -- service_role (llamadas desde servidor) tiene uid NULL → se permite sin check.
  IF v_caller_uid IS NOT NULL THEN
    SELECT email INTO v_owner_email
      FROM public.restaurantes
     WHERE id = p_restaurante_id
     LIMIT 1;

    SELECT email INTO v_caller_email
      FROM auth.users
     WHERE id = v_caller_uid
     LIMIT 1;

    IF v_owner_email IS NULL THEN
      RAISE EXCEPTION 'restaurante_no_encontrado';
    END IF;
    IF lower(v_caller_email) <> lower(v_owner_email) THEN
      RAISE EXCEPTION 'acceso_denegado: el usuario no pertenece a este restaurante';
    END IF;
  END IF;

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

    -- precio neto: sobre uds facturadas, distribuido entre uds+bonificadas
    v_importe_neto := round(
      v_precio_tarifa
      * v_uds
      * (1 - v_desc_linea  / 100.0)
      * (1 - v_desc_global / 100.0),
      4
    );
    v_precio_neto_ud := round(v_importe_neto / v_uds_totales, 4);
    v_iva_importe    := round(v_importe_neto * v_iva_pct / 100.0, 4);

    -- ── Lock y lectura del vino (FOR UPDATE) ──────────────────────────────────
    SELECT stock, coste_medio_pmp, coste_compra
      INTO v_stock_actual, v_pmp_actual, v_coste_compra_act
    FROM public.vinos
    WHERE id = v_vino_id
      AND restaurante_id = p_restaurante_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'vino_no_encontrado: %', v_vino_id;
    END IF;

    -- ── Calcular nuevo PMP ────────────────────────────────────────────────────
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

    -- ── Actualizar vino: stock + PMP + coste_compra ───────────────────────────
    UPDATE public.vinos
    SET
      stock           = COALESCE(stock, 0) + v_uds_totales,
      coste_medio_pmp = v_pmp_nuevo,
      coste_compra    = round(v_precio_neto_ud, 2)
    WHERE id = v_vino_id;

    -- ── Insertar línea ────────────────────────────────────────────────────────
    INSERT INTO public.lineas_compra (
      cabecera_id, restaurante_id, vino_id,
      uds, uds_bonificadas, precio_tarifa, descuento_linea,
      precio_neto_ud, importe_neto, iva_importe
    ) VALUES (
      v_cabecera_id, p_restaurante_id, v_vino_id,
      v_uds, v_uds_bon, v_precio_tarifa, v_desc_linea,
      v_precio_neto_ud, v_importe_neto, v_iva_importe
    );

    -- ── Insertar movimiento de stock ──────────────────────────────────────────
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

REVOKE ALL ON FUNCTION public.registrar_compra_con_pmp(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_compra_con_pmp(uuid, jsonb, jsonb) TO service_role;


-- ────────────────────────────────────────────────────────────
-- BLOQUE A2: merge_cierre_pasos
--   · REVOKE PUBLIC execute, solo service_role
--   · No cambia la lógica; solo restringe el ejecutante
--     Motivo: solo se invoca desde app/api/cierres-servicio/route.js
--             via supabaseAdmin.rpc()
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.merge_cierre_pasos(
  p_restaurante_id uuid,
  p_fecha_servicio date,
  p_pasos          jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE cierres_servicio
  SET pasos      = pasos || p_pasos,
      updated_at = now()
  WHERE restaurante_id = p_restaurante_id
    AND fecha_servicio = p_fecha_servicio
  RETURNING pasos;
$$;

REVOKE ALL ON FUNCTION public.merge_cierre_pasos(uuid, date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_cierre_pasos(uuid, date, jsonb) TO service_role;


-- ────────────────────────────────────────────────────────────
-- BLOQUE A3: sustituir_vino_simulacion
--   · Añade SET search_path = public (faltaba)
--   · REVOKE PUBLIC execute, solo service_role
--   · No cambia la lógica
--     Motivo: solo se invoca desde app/api/simulador/sustituir/route.js
--             via supabaseAdmin.rpc()
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sustituir_vino_simulacion(
  p_restaurante_id              uuid,
  p_linea_fuera_id              uuid,
  p_catalogo_vino_id            uuid,
  p_nombre                      text,
  p_bodega                      text    DEFAULT NULL,
  p_tipo                        text    DEFAULT NULL,
  p_region                      text    DEFAULT NULL,
  p_anada                       text    DEFAULT NULL,
  p_formato                     text    DEFAULT NULL,
  p_precio_botella              numeric DEFAULT NULL,
  p_precio_copa                 numeric DEFAULT NULL,
  p_coste_compra                numeric DEFAULT NULL,
  p_pvp_recomendado_catalogo    numeric DEFAULT NULL,
  p_pvp_copa_catalogo           numeric DEFAULT NULL
)
RETURNS carta_simulacion
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nueva carta_simulacion;
BEGIN
  UPDATE carta_simulacion
     SET estado     = 'fuera',
         updated_at = now()
   WHERE id             = p_linea_fuera_id
     AND restaurante_id = p_restaurante_id
     AND estado         = 'actual';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Línea no encontrada o ya no está en estado actual (id: %)', p_linea_fuera_id;
  END IF;

  INSERT INTO carta_simulacion (
    restaurante_id, catalogo_vino_id, sustituye_a,
    nombre, bodega, tipo, region, anada, formato,
    precio_botella, precio_copa, coste_compra,
    pvp_recomendado_catalogo, pvp_copa_catalogo,
    estado
  ) VALUES (
    p_restaurante_id, p_catalogo_vino_id, p_linea_fuera_id,
    p_nombre, p_bodega, p_tipo, p_region, p_anada, p_formato,
    p_precio_botella, p_precio_copa, p_coste_compra,
    p_pvp_recomendado_catalogo, p_pvp_copa_catalogo,
    'nuevo'
  )
  RETURNING * INTO v_nueva;

  RETURN v_nueva;
END;
$$;

REVOKE ALL ON FUNCTION public.sustituir_vino_simulacion(uuid, uuid, uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sustituir_vino_simulacion(uuid, uuid, uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric) TO service_role;


-- ────────────────────────────────────────────────────────────
-- BLOQUE B: Políticas RLS para tablas sin políticas explícitas
-- ────────────────────────────────────────────────────────────

-- B1. consumos_ia — solo service_role puede insertar/leer
ALTER TABLE public.consumos_ia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consumos_ia_deny_public" ON public.consumos_ia;
CREATE POLICY "consumos_ia_deny_public"
  ON public.consumos_ia
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

-- B2. demo_analytics_events — solo service_role
ALTER TABLE public.demo_analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "demo_analytics_deny_public" ON public.demo_analytics_events;
CREATE POLICY "demo_analytics_deny_public"
  ON public.demo_analytics_events
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

-- B3. sesiones_uso — solo service_role
ALTER TABLE public.sesiones_uso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sesiones_uso_deny_public" ON public.sesiones_uso;
CREATE POLICY "sesiones_uso_deny_public"
  ON public.sesiones_uso
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);


-- ────────────────────────────────────────────────────────────
-- BLOQUE C: Bucket facturas-bodega — confirmar que es privado
-- ────────────────────────────────────────────────────────────
-- Verificación manual (SQL Editor no puede cambiar buckets directamente).
-- Ir a Supabase → Storage → facturas-bodega → asegurarse de que "Public bucket" está DESACTIVADO.
-- Si está público por error, ejecutar:
--
-- UPDATE storage.buckets SET public = false WHERE name = 'facturas-bodega';
--
-- (No se ejecuta aquí automáticamente por seguridad.)


-- ────────────────────────────────────────────────────────────
-- BLOQUE D: rate_limits — asegurar que anon no puede leer
-- ────────────────────────────────────────────────────────────
-- Las rutas públicas usan supabaseAdmin (service_role) para insertar rate_limits.
-- service_role salta RLS, por lo que esta política no les afecta.
-- Solo bloquea a clientes anónimos en frontend que intentaran leer/insertar directamente.

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_limits_deny_anon" ON public.rate_limits;
CREATE POLICY "rate_limits_deny_anon"
  ON public.rate_limits
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false);
