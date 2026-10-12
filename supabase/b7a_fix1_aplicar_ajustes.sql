-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B7a · FIX 1 — aplicar_ajustes_stock_atomicos                           ║
-- ║                                                                          ║
-- ║  Causa del error: la función intentaba insertar la columna "created_by"  ║
-- ║  en movimientos_stock, pero esa columna no existe en la tabla.           ║
-- ║                                                                          ║
-- ║  Fix: quitar "created_by" del INSERT (y el parámetro p_actor_id que     ║
-- ║  se le asignaba). El actor ya queda registrado en partes_servicio y en   ║
-- ║  estadisticas vía p_actor_email cuando aplica.                           ║
-- ║                                                                          ║
-- ║  Comando para aplicar en producción:                                     ║
-- ║    psql $DATABASE_URL -f supabase/b7a_fix1_aplicar_ajustes.sql           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

CREATE OR REPLACE FUNCTION public.aplicar_ajustes_stock_atomicos(
  p_restaurante_id  uuid,
  p_ajustes         jsonb,
  p_actor_id        uuid  DEFAULT NULL,
  p_actor_email     text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item                jsonb;
  v_vino_id             uuid;
  v_nombre              text;
  v_modo                text;
  v_tipo                text;
  v_motivo              text;
  v_valor               integer;
  v_origen              text;
  v_copas_vendidas      integer;
  v_mesa                text;
  v_parte_servicio_id   uuid;
  v_stock_anterior      integer;
  v_stock_nuevo         integer;
  v_cantidad            integer;
  v_actualiza_stock     boolean;
  v_coste_capturado     numeric(10,4);
  v_fuente_ventas       text;
  v_ctrl_stock_desde    date;
  v_resultado           jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_ajustes) <> 'array'
    OR jsonb_array_length(p_ajustes) = 0
    OR jsonb_array_length(p_ajustes) > 100
  THEN
    RAISE EXCEPTION 'Lista de ajustes no valida';
  END IF;

  SELECT fuente_ventas, control_stock_desde
    INTO v_fuente_ventas, v_ctrl_stock_desde
  FROM public.restaurant_economic_settings
  WHERE restaurante_id = p_restaurante_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_ajustes)
  LOOP
    v_vino_id           := (v_item ->> 'vino_id')::uuid;
    v_modo              := COALESCE(v_item ->> 'modo', '');
    v_tipo              := COALESCE(v_item ->> 'tipo', '');
    v_motivo            := LEFT(COALESCE(NULLIF(TRIM(v_item ->> 'motivo'), ''), 'Ajuste de stock'), 500);
    v_valor             := (v_item ->> 'valor')::integer;
    v_origen            := COALESCE(NULLIF(TRIM(v_item ->> 'origen'), ''), 'manual');
    v_copas_vendidas    := NULLIF((v_item ->> 'copas_vendidas')::integer, 0);
    v_mesa              := NULLIF(LEFT(COALESCE(v_item ->> 'mesa', ''), 60), '');
    v_parte_servicio_id := NULLIF(v_item ->> 'parte_servicio_id', '')::uuid;

    IF v_modo NOT IN ('delta', 'establecer') THEN
      RAISE EXCEPTION 'Modo de ajuste no valido: %', v_modo;
    END IF;

    IF v_tipo NOT IN (
      'compra','devolucion','venta_botella','venta_copa',
      'invitacion_botella','invitacion_copa',
      'cocina','grupo_evento','maridaje','rotura','cata','ajuste',
      'entrada','venta','merma','invitacion'
    ) THEN
      RAISE EXCEPTION 'Tipo de movimiento no valido: %', v_tipo;
    END IF;

    IF v_origen NOT IN ('manual','tpv','parte','conteo') THEN
      RAISE EXCEPTION 'Origen no valido: %', v_origen;
    END IF;

    IF v_modo = 'delta' THEN
      IF v_tipo IN (
        'devolucion','venta_botella','venta_copa',
        'invitacion_botella','invitacion_copa',
        'cocina','grupo_evento','maridaje','rotura','cata',
        'venta','merma','invitacion'
      ) AND v_valor > 0 THEN
        RAISE EXCEPTION 'tipo % es salida: valor debe ser <= 0 en modo delta (recibido: %)', v_tipo, v_valor;
      END IF;
      IF v_tipo IN ('compra','entrada') AND v_valor < 0 THEN
        RAISE EXCEPTION 'tipo % es entrada: valor debe ser >= 0 en modo delta (recibido: %)', v_tipo, v_valor;
      END IF;
    END IF;

    IF v_tipo IN ('venta_botella','venta_copa','venta')
      AND v_origen IN ('tpv','parte')
      AND v_fuente_ventas IS NOT NULL
    THEN
      IF v_fuente_ventas = 'tpv' AND v_origen <> 'tpv' THEN
        RAISE EXCEPTION 'invariant_violated: restaurante en modo tpv; se requiere origen=tpv, recibido=%', v_origen;
      END IF;
      IF v_fuente_ventas = 'parte' AND v_origen <> 'parte' THEN
        RAISE EXCEPTION 'invariant_violated: restaurante en modo parte; se requiere origen=parte, recibido=%', v_origen;
      END IF;
    END IF;

    SELECT
        COALESCE(stock, 0),
        nombre,
        CASE
          WHEN coste_medio_pmp IS NOT NULL THEN coste_medio_pmp
          WHEN coste_compra IS NOT NULL AND coste_compra > 0 THEN coste_compra
          ELSE NULL
        END
      INTO v_stock_anterior, v_nombre, v_coste_capturado
    FROM public.vinos
    WHERE id = v_vino_id
      AND restaurante_id = p_restaurante_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vino no encontrado o no autorizado: %', v_vino_id;
    END IF;

    v_actualiza_stock := TRUE;
    IF v_tipo IN ('venta_botella','venta_copa','venta') AND v_origen IN ('tpv','parte') THEN
      IF v_ctrl_stock_desde IS NULL OR CURRENT_DATE < v_ctrl_stock_desde THEN
        v_actualiza_stock := FALSE;
      END IF;
    END IF;

    IF v_actualiza_stock THEN
      v_stock_nuevo := CASE
        WHEN v_modo = 'delta'      THEN GREATEST(0, v_stock_anterior + v_valor)
        WHEN v_modo = 'establecer' THEN GREATEST(0, v_valor)
      END;
      v_cantidad := v_stock_nuevo - v_stock_anterior;
    ELSE
      v_stock_nuevo := v_stock_anterior;
      v_cantidad := CASE
        WHEN v_modo = 'delta'      THEN v_valor
        WHEN v_modo = 'establecer' THEN GREATEST(0, v_valor) - v_stock_anterior
      END;
    END IF;

    IF v_actualiza_stock AND v_cantidad <> 0 THEN
      UPDATE public.vinos SET stock = v_stock_nuevo WHERE id = v_vino_id;
    END IF;

    IF v_cantidad <> 0
      OR (v_tipo IN ('venta_botella','venta_copa','venta') AND NOT v_actualiza_stock)
    THEN
      -- created_by omitido: la columna no existe en movimientos_stock
      INSERT INTO public.movimientos_stock (
        restaurante_id, vino_id, tipo, cantidad,
        stock_anterior, stock_nuevo, motivo, coste_medio_ponderado,
        origen, copas_vendidas, mesa, parte_servicio_id
      ) VALUES (
        p_restaurante_id, v_vino_id, v_tipo, v_cantidad,
        v_stock_anterior, v_stock_nuevo, v_motivo, v_coste_capturado,
        v_origen, v_copas_vendidas, v_mesa, v_parte_servicio_id
      );
    END IF;

    IF COALESCE((v_item ->> 'registrar_venta')::boolean, FALSE)
      AND v_tipo IN ('venta','venta_botella','venta_copa')
      AND v_cantidad < 0
    THEN
      INSERT INTO public.estadisticas (restaurante_id, tipo, detalle)
      VALUES (
        p_restaurante_id, 'venta',
        jsonb_build_object(
          'vino_id', v_vino_id, 'vino', v_nombre, 'resultado', 'vendida',
          'cantidad', ABS(v_cantidad), 'origen', 'inventario', 'actor', p_actor_email
        )::text
      );
    END IF;

    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object(
      'vino_id', v_vino_id, 'stock_anterior', v_stock_anterior,
      'stock_nuevo', v_stock_nuevo, 'cantidad', v_cantidad,
      'actualizo_stock', v_actualiza_stock
    ));
  END LOOP;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_ajustes_stock_atomicos(uuid, jsonb, uuid, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_ajustes_stock_atomicos(uuid, jsonb, uuid, text)
  TO service_role;

COMMIT;
