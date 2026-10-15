-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B8a · registrar_ventas_tpv                                              ║
-- ║                                                                           ║
-- ║  RPC principal de B8a. Llamado exclusivamente desde supabaseAdmin         ║
-- ║  (service_role) en el webhook handler de cada TPV.                        ║
-- ║                                                                           ║
-- ║  Contrato:                                                                ║
-- ║  · Un pago = una llamada. Todas las líneas en una transacción.            ║
-- ║  · Advisory lock (hashtextextended) serializa llamadas concurrentes       ║
-- ║    para el mismo (restaurante, payment).                                  ║
-- ║  · Líneas con cantidad ≤0, no entera (botella o copa), sin mapeo o        ║
-- ║    ignoradas → cola tpv_lineas_sin_asignar, no error.                     ║
-- ║  · Error real (vino no encontrado, FK inválida, etc.) → ROLLBACK total.   ║
-- ║  · Idempotente: referencia_externa UNIQUE absorbe reintentos.             ║
-- ║                                                                           ║
-- ║  p_lines jsonb: array de objetos con campos:                              ║
-- ║    uid                  TEXT     line_item uid (obligatorio)              ║
-- ║    producto_externo_id  TEXT     id del producto en el TPV                ║
-- ║    vino_id              UUID?    null si sin mapeo                        ║
-- ║    formato_venta        TEXT?    'botella'|'copa'; null si sin mapeo      ║
-- ║    estado_mapeo         TEXT?    'activo'|'ignorar'; null si sin mapeo    ║
-- ║    nombre_producto      TEXT?    nombre del producto para UI de la cola   ║
-- ║    cantidad             NUMERIC  siempre > 0 (parseFloat del ticket)      ║
-- ║    precio_unitario_bruto NUMERIC precio base por unidad (IVA incluido)    ║
-- ║    descuento_unitario   NUMERIC descuento por unidad                      ║
-- ║    importe_bruto_iva    NUMERIC importe total de la línea (IVA incluido)  ║
-- ║                                                                           ║
-- ║  Rollback: b8a_registrar_ventas_tpv_rollback.sql                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- Eliminar firma anterior (4 params) si fue aplicada previamente.
DROP FUNCTION IF EXISTS public.registrar_ventas_tpv(uuid, text, timestamptz, jsonb);

CREATE OR REPLACE FUNCTION public.registrar_ventas_tpv(
  p_restaurante_id UUID,
  p_payment_id     TEXT,
  p_payment_date   TIMESTAMPTZ,
  p_lines          JSONB,
  p_fuente         TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line            jsonb;
  v_uid             text;
  v_producto_id     text;
  v_vino_id         uuid;
  v_formato         text;
  v_estado_mapeo    text;
  v_nombre_producto text;
  v_cantidad        numeric(10,4);
  v_precio_bruto    numeric(10,2);
  v_descuento       numeric(10,2);
  v_importe_bruto   numeric(10,2);
  v_ref_ext         text;
  v_incidencia      text;
  v_cantidad_entera integer;
  v_ajuste          jsonb;
  v_ajuste_res      jsonb;
  v_vino_por_copa   boolean;
  v_resultado       jsonb := '[]'::jsonb;
BEGIN

  -- ── Serializar por (restaurante, payment) ────────────────────────────────
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_restaurante_id::text || ':' || p_payment_id, 0)
  );

  IF jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'registrar_ventas_tpv: p_lines debe ser un array JSON';
  END IF;
  IF jsonb_array_length(p_lines) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_uid             := v_line ->> 'uid';
    v_producto_id     := v_line ->> 'producto_externo_id';
    v_vino_id         := (v_line ->> 'vino_id')::uuid;
    v_formato         := v_line ->> 'formato_venta';
    v_estado_mapeo    := COALESCE(v_line ->> 'estado_mapeo', '');
    v_nombre_producto := v_line ->> 'nombre_producto';
    v_cantidad        := (v_line ->> 'cantidad')::numeric;
    v_precio_bruto    := (v_line ->> 'precio_unitario_bruto')::numeric;
    v_descuento       := (v_line ->> 'descuento_unitario')::numeric;
    v_importe_bruto   := (v_line ->> 'importe_bruto_iva')::numeric;
    v_ref_ext         := p_fuente || '_' || p_payment_id || '_' || v_uid;
    v_incidencia      := NULL;

    -- ── Idempotencia: ¿ya existe este movimiento? ─────────────────────────
    IF EXISTS (
      SELECT 1 FROM public.movimientos_stock
      WHERE restaurante_id = p_restaurante_id
        AND referencia_externa = v_ref_ext
    ) THEN
      v_resultado := v_resultado || jsonb_build_array(
        jsonb_build_object('uid', v_uid, 'status', 'already_applied')
      );
      CONTINUE;
    END IF;

    -- ── Idempotencia: ¿ya está en la cola? ───────────────────────────────
    IF EXISTS (
      SELECT 1 FROM public.tpv_lineas_sin_asignar
      WHERE restaurante_id    = p_restaurante_id
        AND fuente            = p_fuente
        AND referencia_ticket = p_payment_id
        AND referencia_linea  = v_uid
    ) THEN
      v_resultado := v_resultado || jsonb_build_array(
        jsonb_build_object('uid', v_uid, 'status', 'already_queued')
      );
      CONTINUE;
    END IF;

    -- ── Producto ignorado (comida, bebida no mapeada intencionalmente) ────
    IF v_estado_mapeo = 'ignorar' THEN
      v_resultado := v_resultado || jsonb_build_array(
        jsonb_build_object('uid', v_uid, 'status', 'ignorado')
      );
      CONTINUE;
    END IF;

    -- ── Validación de cantidad ─────────────────────────────────────────────
    IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
      v_incidencia := 'cantidad_cero';
    ELSIF v_cantidad <> FLOOR(v_cantidad) THEN
      v_incidencia := 'cantidad_no_entera';
    END IF;

    -- ── Sin mapeo → cola ──────────────────────────────────────────────────
    IF v_incidencia IS NULL AND v_vino_id IS NULL THEN
      v_incidencia := 'sin_mapeo';
    END IF;

    -- ── Vino mapeado: validar existencia y compatibilidad con formato ──────
    IF v_incidencia IS NULL THEN
      SELECT COALESCE(por_copa, false)
        INTO v_vino_por_copa
      FROM public.vinos
      WHERE id = v_vino_id AND restaurante_id = p_restaurante_id;

      IF NOT FOUND THEN
        v_incidencia := 'mapeo_invalido';
      ELSIF v_formato = 'copa' AND NOT v_vino_por_copa THEN
        v_incidencia := 'mapeo_invalido';
      END IF;
    END IF;

    -- ── Cualquier incidencia → cola (no error, la transacción continúa) ──
    IF v_incidencia IS NOT NULL THEN
      INSERT INTO public.tpv_lineas_sin_asignar (
        restaurante_id, fuente, referencia_ticket, referencia_linea,
        nombre_producto, producto_externo_id, cantidad, precio_unitario,
        descuento_unitario, importe_bruto_iva,
        fecha, estado, tipo_incidencia
      ) VALUES (
        p_restaurante_id, p_fuente, p_payment_id, v_uid,
        v_nombre_producto, v_producto_id,
        v_cantidad,
        v_precio_bruto,
        v_descuento,
        v_importe_bruto,
        p_payment_date, 'pendiente', v_incidencia
      )
      ON CONFLICT (restaurante_id, fuente, referencia_ticket, referencia_linea)
        DO NOTHING;

      v_resultado := v_resultado || jsonb_build_array(
        jsonb_build_object('uid', v_uid, 'status', v_incidencia)
      );
      CONTINUE;
    END IF;

    -- ── Movimiento válido ─────────────────────────────────────────────────
    v_cantidad_entera := v_cantidad::integer;

    v_ajuste := jsonb_build_object(
      'vino_id',               v_vino_id,
      'tipo',                  CASE v_formato WHEN 'copa' THEN 'venta_copa'
                                              ELSE            'venta_botella' END,
      'modo',                  'delta',
      'valor',                 CASE v_formato WHEN 'copa' THEN -1
                                              ELSE            -v_cantidad_entera END,
      'origen',                'tpv',
      'motivo',                'Venta TPV ' || p_fuente,
      'copas_vendidas',        CASE v_formato WHEN 'copa' THEN v_cantidad_entera
                                              ELSE            NULL END,
      'referencia_externa',    v_ref_ext,
      'fecha_pago',            p_payment_date,
      'precio_unitario_bruto', v_precio_bruto,
      'descuento_unitario',    v_descuento,
      'importe_bruto_iva',     v_importe_bruto
    );

    v_ajuste_res := public.aplicar_ajustes_stock_atomicos(
      p_restaurante_id,
      jsonb_build_array(v_ajuste),
      NULL,
      NULL
    );

    v_resultado := v_resultado || jsonb_build_array(
      jsonb_build_object(
        'uid',      v_uid,
        'status',   'ok',
        'vino_id',  v_vino_id,
        'detalles', v_ajuste_res -> 0
      )
    );

  END LOOP;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_ventas_tpv(uuid, text, timestamptz, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_ventas_tpv(uuid, text, timestamptz, jsonb, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
