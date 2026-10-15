-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B8a · asignar_lineas_tpv                                                ║
-- ║                                                                           ║
-- ║  RPC atómico para asignar (o descartar) líneas de tpv_lineas_sin_asignar. ║
-- ║  Llamado exclusivamente desde supabaseAdmin (service_role).               ║
-- ║                                                                           ║
-- ║  Acciones:                                                                ║
-- ║  · 'asignar'         — Upsert tpv_vino_map + procesa hasta 200 líneas     ║
-- ║                        asignables (cantidad entera > 0) del mismo         ║
-- ║                        producto_externo_id y fuente. Las no asignables    ║
-- ║                        permanecen pendientes; se devuelven en             ║
-- ║                        no_asignables.                                     ║
-- ║  · 'ignorar'         — Upsert tpv_vino_map como ignorar + descarta        ║
-- ║                        hasta 200 líneas pendientes (cualquier cantidad).  ║
-- ║  · 'descartar_linea' — Descarta UNA línea por p_linea_id, sin tocar       ║
-- ║                        tpv_vino_map (descarte manual puntual).            ║
-- ║                                                                           ║
-- ║  Paginación para 'asignar'/'ignorar':                                     ║
-- ║  - pendientes_restantes > 0 → hay más líneas asignables; repetir.         ║
-- ║  - pendientes_restantes = 0 → cola asignable agotada.                     ║
-- ║  El caller debe detener el bucle si procesadas = 0 Y                      ║
-- ║  pendientes_restantes = 0 (todas no asignables o vacía).                  ║
-- ║                                                                           ║
-- ║  Firma: 7 params (v3). DROPs: v1 (5), v2 (6).                            ║
-- ║  Rollback: b8a_asignar_lineas_tpv_rollback.sql                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- Eliminar firmas anteriores (v1: 5 params, v2: 6 params).
DROP FUNCTION IF EXISTS public.asignar_lineas_tpv(uuid, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.asignar_lineas_tpv(uuid, text, uuid, text, text, uuid);

CREATE OR REPLACE FUNCTION public.asignar_lineas_tpv(
  p_restaurante_id      UUID,
  p_fuente              TEXT,            -- 'square' | futura fuente
  p_producto_externo_id TEXT,            -- id del producto en el TPV
  p_vino_id             UUID,            -- NULL cuando p_accion='ignorar'|'descartar_linea'
  p_formato_venta       TEXT,            -- 'botella'|'copa'|NULL cuando ignorar/descartar_linea
  p_accion              TEXT,            -- 'asignar'|'ignorar'|'descartar_linea'
  p_linea_id            UUID DEFAULT NULL  -- requerido solo para descartar_linea
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linea                 RECORD;
  v_ref_ext               text;
  v_ajuste                jsonb;
  v_ajuste_res            jsonb;
  v_cantidad_entera       integer;
  v_vino_por_copa         boolean;
  v_procesadas            integer := 0;
  v_no_asignables         integer := 0;
  v_pendientes_restantes  integer := 0;
  v_resultado             jsonb := '[]'::jsonb;
BEGIN

  -- ── Descarte individual de una línea (fast path, no toca tpv_vino_map) ────
  IF p_accion = 'descartar_linea' THEN
    IF p_linea_id IS NULL THEN
      RAISE EXCEPTION 'asignar_lineas_tpv: p_linea_id requerido para accion=descartar_linea';
    END IF;

    UPDATE public.tpv_lineas_sin_asignar
       SET estado = 'descartada', procesada_at = now()
     WHERE id             = p_linea_id
       AND restaurante_id = p_restaurante_id
       AND estado         = 'pendiente';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'asignar_lineas_tpv: línea % no encontrada o no está pendiente', p_linea_id;
    END IF;

    RETURN jsonb_build_object(
      'procesadas',           1,
      'no_asignables',        0,
      'pendientes_restantes', 0,
      'lineas', jsonb_build_array(
        jsonb_build_object('linea_id', p_linea_id, 'status', 'descartada')
      )
    );
  END IF;

  -- ── Validación para asignar / ignorar ─────────────────────────────────────
  IF p_accion NOT IN ('asignar', 'ignorar') THEN
    RAISE EXCEPTION 'asignar_lineas_tpv: p_accion debe ser asignar, ignorar o descartar_linea';
  END IF;

  IF p_accion = 'asignar' THEN
    IF p_vino_id IS NULL OR p_formato_venta IS NULL THEN
      RAISE EXCEPTION 'asignar_lineas_tpv: vino_id y formato_venta requeridos para accion=asignar';
    END IF;
    IF p_formato_venta NOT IN ('botella', 'copa') THEN
      RAISE EXCEPTION 'asignar_lineas_tpv: formato_venta debe ser botella o copa';
    END IF;

    SELECT COALESCE(por_copa, false) INTO v_vino_por_copa
    FROM public.vinos
    WHERE id = p_vino_id AND restaurante_id = p_restaurante_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'asignar_lineas_tpv: vino % no encontrado o no autorizado', p_vino_id;
    END IF;
    IF p_formato_venta = 'copa' AND NOT v_vino_por_copa THEN
      RAISE EXCEPTION 'asignar_lineas_tpv: el vino % no está marcado para servir por copa', p_vino_id;
    END IF;

    -- Contar líneas pendientes pero NO asignables (cantidad NULL/0/decimal).
    -- No entran en el loop; permanecen pendientes para revisión o descartar_linea.
    SELECT COUNT(*) INTO v_no_asignables
    FROM public.tpv_lineas_sin_asignar
    WHERE restaurante_id      = p_restaurante_id
      AND fuente              = p_fuente
      AND producto_externo_id = p_producto_externo_id
      AND estado              = 'pendiente'
      AND (cantidad IS NULL OR cantidad <= 0 OR cantidad <> FLOOR(cantidad));
  END IF;

  -- ── Upsert en tpv_vino_map ────────────────────────────────────────────────
  INSERT INTO public.tpv_vino_map (
    restaurante_id, fuente, producto_externo_id, vino_id, formato_venta, estado
  ) VALUES (
    p_restaurante_id,
    p_fuente,
    p_producto_externo_id,
    CASE p_accion WHEN 'asignar' THEN p_vino_id        ELSE NULL END,
    CASE p_accion WHEN 'asignar' THEN p_formato_venta  ELSE NULL END,
    CASE p_accion WHEN 'asignar' THEN 'activo'         ELSE 'ignorar' END
  )
  ON CONFLICT (restaurante_id, fuente, producto_externo_id)
    DO UPDATE SET
      vino_id       = EXCLUDED.vino_id,
      formato_venta = EXCLUDED.formato_venta,
      estado        = EXCLUDED.estado,
      activo        = true,
      updated_at    = now();

  -- ── Procesar hasta 200 líneas pendientes ──────────────────────────────────
  -- Para 'asignar': el filtro excluye líneas no asignables (cantidad inválida)
  -- del loop Y del conteo de pendientes_restantes, evitando bucle infinito en
  -- el caller si 200+ líneas malas están al frente de la cola.
  -- Para 'ignorar': procesa todas las pendientes (cantidad irrelevante al descartar).
  FOR v_linea IN
    SELECT id, referencia_ticket, referencia_linea,
           cantidad, precio_unitario, descuento_unitario, importe_bruto_iva, fecha
    FROM public.tpv_lineas_sin_asignar
    WHERE restaurante_id      = p_restaurante_id
      AND fuente              = p_fuente
      AND producto_externo_id = p_producto_externo_id
      AND estado              = 'pendiente'
      AND (p_accion = 'ignorar'
           OR (cantidad IS NOT NULL AND cantidad > 0 AND cantidad = FLOOR(cantidad)))
    ORDER BY created_at
    LIMIT 200
    FOR UPDATE
  LOOP

    IF p_accion = 'ignorar' THEN
      UPDATE public.tpv_lineas_sin_asignar
         SET estado = 'descartada', procesada_at = now()
       WHERE id = v_linea.id;
      v_procesadas := v_procesadas + 1;
      CONTINUE;
    END IF;

    v_cantidad_entera := v_linea.cantidad::integer;
    v_ref_ext := p_fuente || '_' || v_linea.referencia_ticket || '_' || v_linea.referencia_linea;

    -- ── Idempotencia: movimiento ya registrado ────────────────────────────
    IF EXISTS (
      SELECT 1 FROM public.movimientos_stock
      WHERE restaurante_id    = p_restaurante_id
        AND referencia_externa = v_ref_ext
    ) THEN
      UPDATE public.tpv_lineas_sin_asignar
         SET estado           = 'asignada',
             vino_id          = p_vino_id,
             formato_asignado = p_formato_venta,
             procesada_at     = now()
       WHERE id = v_linea.id;
      v_resultado := v_resultado || jsonb_build_array(
        jsonb_build_object('linea_id', v_linea.id, 'status', 'already_applied', 'ref_ext', v_ref_ext)
      );
      v_procesadas := v_procesadas + 1;
      CONTINUE;
    END IF;

    -- ── Llamar v5 con la fecha original del pago ──────────────────────────
    v_ajuste := jsonb_build_object(
      'vino_id',               p_vino_id,
      'tipo',                  CASE p_formato_venta WHEN 'copa' THEN 'venta_copa'
                                                    ELSE 'venta_botella' END,
      'modo',                  'delta',
      'valor',                 CASE p_formato_venta WHEN 'copa' THEN -1
                                                    ELSE -v_cantidad_entera END,
      'origen',                'tpv',
      'motivo',                'Venta TPV ' || p_fuente || ' (asignación retroactiva)',
      'copas_vendidas',        CASE p_formato_venta WHEN 'copa' THEN v_cantidad_entera
                                                    ELSE NULL END,
      'referencia_externa',    v_ref_ext,
      'fecha_pago',            v_linea.fecha,
      'precio_unitario_bruto', v_linea.precio_unitario,
      'descuento_unitario',    v_linea.descuento_unitario,
      'importe_bruto_iva',     v_linea.importe_bruto_iva
    );

    v_ajuste_res := public.aplicar_ajustes_stock_atomicos(
      p_restaurante_id,
      jsonb_build_array(v_ajuste),
      NULL,
      NULL
    );

    UPDATE public.tpv_lineas_sin_asignar
       SET estado           = 'asignada',
           vino_id          = p_vino_id,
           formato_asignado = p_formato_venta,
           procesada_at     = now()
     WHERE id = v_linea.id;

    v_resultado := v_resultado || jsonb_build_array(
      jsonb_build_object(
        'linea_id', v_linea.id,
        'ref_ext',  v_ref_ext,
        'status',   'ok',
        'detalles', v_ajuste_res -> 0
      )
    );
    v_procesadas := v_procesadas + 1;

  END LOOP;

  -- ── Contar líneas asignables pendientes restantes ─────────────────────────
  -- Usa el mismo filtro que el loop: el caller para cuando este valor sea 0.
  SELECT COUNT(*) INTO v_pendientes_restantes
  FROM public.tpv_lineas_sin_asignar
  WHERE restaurante_id      = p_restaurante_id
    AND fuente              = p_fuente
    AND producto_externo_id = p_producto_externo_id
    AND estado              = 'pendiente'
    AND (p_accion = 'ignorar'
         OR (cantidad IS NOT NULL AND cantidad > 0 AND cantidad = FLOOR(cantidad)));

  RETURN jsonb_build_object(
    'procesadas',           v_procesadas,
    'no_asignables',        v_no_asignables,
    'pendientes_restantes', v_pendientes_restantes,
    'lineas',               v_resultado
  );
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_lineas_tpv(uuid, text, text, uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asignar_lineas_tpv(uuid, text, text, uuid, text, text, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
