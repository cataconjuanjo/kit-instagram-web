-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B1 · ROLLBACK DE MIGRACIÓN 1 (EXPAND)                                  ║
-- ║                                                                          ║
-- ║  ANTES DE EJECUTAR:                                                      ║
-- ║  · Verificar que b1_movimientos_contract.sql NO está aplicada            ║
-- ║  · Ejecutar en una copia o rama de test primero                          ║
-- ║                                                                          ║
-- ║  Qué revierte este script:                                               ║
-- ║    · Columnas añadidas en Fase A (origen, copas_vendidas, mesa,          ║
-- ║      parte_servicio_id, coste_medio_pmp, fuente_ventas, …)               ║
-- ║    · Backfill de tipos: compra→entrada, venta_botella/copa→venta,        ║
-- ║      invitacion_botella/copa→invitacion, devolucion→merma                ║
-- ║    · Índices nuevos (rest_created_tipo, rest_origen)                     ║
-- ║    · RPC aplicar_ajustes_stock_atomicos → versión pre-B1                 ║
-- ║                                                                          ║
-- ║  Qué NO toca este script (existía antes de B1):                          ║
-- ║    · Tipos rotura, cocina, grupo_evento, maridaje                        ║
-- ║    · Columna coste_medio_ponderado en movimientos_stock                  ║
-- ║    · Tablas parametros_explotacion, libro_compras, etc.                  ║
-- ║                                                                          ║
-- ║  Pérdida semántica aceptada:                                             ║
-- ║    · devolucion → merma  (el tipo devolucion no existía antes de B1;     ║
-- ║      se mapea al tipo de salida más genérico disponible en legacy)       ║
-- ║    · merma → rotura es irreversible (opción A confirmada en producción): ║
-- ║      las filas que eran merma quedarán como rotura tras el rollback.     ║
-- ║      El rollback NO intenta deshacer este cambio porque rotura existía   ║
-- ║      antes de B1 y no es posible distinguir las filas originales.        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ── PASOS 1-3: Detectar estado pre-B1, revertir tipos y restaurar CHECK ───
-- Todo en un único bloque para poder pasar la variable v_tiene_somm_types
-- entre la detección (antes de modificar nada) y la restauración final.
DO $$
DECLARE
  v_tiene_somm_types  boolean;
  v_filas_revertidas  integer := 0;
  v_n                 integer;
BEGIN
  -- ── Verificar nombre real del constraint ────────────────────────────────
  -- Si el nombre difiere en producción, el script fallaría silenciosamente
  -- (DROP CONSTRAINT IF EXISTS no lanza error aunque no exista).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.movimientos_stock'::regclass
      AND contype = 'c'
      AND conname = 'movimientos_stock_tipo_check'
  ) THEN
    RAISE EXCEPTION
      'El constraint no se llama "movimientos_stock_tipo_check" en esta base. '
      'Ejecutar antes: SELECT conname FROM pg_constraint WHERE conrelid = ''public.movimientos_stock''::regclass AND contype = ''c''; '
      'Luego ajustar el script con el nombre real.';
  END IF;
  RAISE NOTICE 'Constraint movimientos_stock_tipo_check verificado ✓';

  -- Detectar si add_carta_viva_somm.sql estaba aplicada ANTES que B1.
  -- Usamos la existencia de parametros_explotacion como indicador fiable
  -- (esa tabla la crea add_carta_viva_somm.sql y B1 no la toca).
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'parametros_explotacion'
  ) INTO v_tiene_somm_types;

  RAISE NOTICE 'Estado pre-B1: add_carta_viva_somm aplicada = %', v_tiene_somm_types;

  -- ── Ampliar el CHECK temporalmente para que los UPDATE no fallen ──────
  -- El CHECK post-B1 ya los acepta todos, pero si por alguna razón el CHECK
  -- fue modificado manualmente, lo dejamos en estado seguro antes de los UPDATE.
  ALTER TABLE public.movimientos_stock DROP CONSTRAINT IF EXISTS movimientos_stock_tipo_check;
  ALTER TABLE public.movimientos_stock ADD CONSTRAINT movimientos_stock_tipo_check
    CHECK (tipo IN (
      'compra','devolucion','venta_botella','venta_copa',
      'invitacion_botella','invitacion_copa',
      'cocina','grupo_evento','maridaje','rotura','cata','ajuste',
      'entrada','venta','merma','invitacion'
    ));

  -- ── Revertir SOLO los tipos que B1 introdujo ─────────────────────────
  -- rotura / cocina / grupo_evento / maridaje / cata / ajuste: SIN CAMBIO.

  UPDATE public.movimientos_stock SET tipo = 'entrada'    WHERE tipo = 'compra';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_filas_revertidas := v_filas_revertidas + v_n;
  RAISE NOTICE '  compra → entrada:              % filas', v_n;

  UPDATE public.movimientos_stock SET tipo = 'venta'      WHERE tipo IN ('venta_botella','venta_copa');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_filas_revertidas := v_filas_revertidas + v_n;
  RAISE NOTICE '  venta_botella/copa → venta:    % filas', v_n;

  UPDATE public.movimientos_stock SET tipo = 'invitacion' WHERE tipo IN ('invitacion_botella','invitacion_copa');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_filas_revertidas := v_filas_revertidas + v_n;
  RAISE NOTICE '  invitacion_botella/copa → inv: % filas', v_n;

  UPDATE public.movimientos_stock SET tipo = 'merma'      WHERE tipo = 'devolucion';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_filas_revertidas := v_filas_revertidas + v_n;
  RAISE NOTICE '  devolucion → merma:            % filas', v_n;

  RAISE NOTICE 'Total filas revertidas: %', v_filas_revertidas;

  -- ── Restaurar el CHECK al estado exacto pre-B1 ───────────────────────
  ALTER TABLE public.movimientos_stock DROP CONSTRAINT IF EXISTS movimientos_stock_tipo_check;

  IF v_tiene_somm_types THEN
    -- add_carta_viva_somm estaba aplicada → CHECK con 10 tipos
    ALTER TABLE public.movimientos_stock ADD CONSTRAINT movimientos_stock_tipo_check
      CHECK (tipo IN (
        'entrada','venta','merma','ajuste','cata','invitacion',
        'cocina','grupo_evento','maridaje','rotura'
      ));
    RAISE NOTICE 'CHECK restaurado: estado add_carta_viva_somm (10 tipos)';
  ELSE
    -- Entorno sin add_carta_viva_somm → CHECK original de add_bodega_control
    ALTER TABLE public.movimientos_stock ADD CONSTRAINT movimientos_stock_tipo_check
      CHECK (tipo IN ('entrada','venta','merma','ajuste','cata','invitacion'));
    RAISE NOTICE 'CHECK restaurado: estado add_bodega_control (6 tipos)';
  END IF;

END $$;

-- ── PASO 4: Eliminar columnas nuevas de movimientos_stock ─────────────────
-- coste_medio_ponderado NO se toca: existía antes de B1 (add_carta_viva_somm)
ALTER TABLE public.movimientos_stock
  DROP COLUMN IF EXISTS origen,
  DROP COLUMN IF EXISTS copas_vendidas,
  DROP COLUMN IF EXISTS mesa,
  DROP COLUMN IF EXISTS parte_servicio_id;

-- ── PASO 5: Eliminar coste_medio_pmp de vinos ─────────────────────────────
-- coste_compra y coste_medio_ponderado (en movimientos) NO se tocan.
ALTER TABLE public.vinos
  DROP COLUMN IF EXISTS coste_medio_pmp;

-- ── PASO 6: Eliminar columnas nuevas de restaurant_economic_settings ───────
ALTER TABLE public.restaurant_economic_settings
  DROP COLUMN IF EXISTS fuente_ventas,
  DROP COLUMN IF EXISTS fuente_ventas_desde,
  DROP COLUMN IF EXISTS ml_por_copa,
  DROP COLUMN IF EXISTS gastos_mensuales,
  DROP COLUMN IF EXISTS control_stock_desde;

-- ── PASO 7: Eliminar índices nuevos ──────────────────────────────────────
DROP INDEX IF EXISTS public.movimientos_stock_rest_created_tipo_idx;
DROP INDEX IF EXISTS public.movimientos_stock_rest_origen_idx;

-- ── PASO 8: Restaurar la RPC al estado pre-B1 (harden_market_launch.sql) ──
CREATE OR REPLACE FUNCTION public.aplicar_ajustes_stock_atomicos(
  p_restaurante_id uuid,
  p_ajustes jsonb,
  p_actor_id uuid DEFAULT NULL,
  p_actor_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_vino_id uuid;
  v_nombre text;
  v_modo text;
  v_tipo text;
  v_motivo text;
  v_valor integer;
  v_stock_anterior integer;
  v_stock_nuevo integer;
  v_cantidad integer;
  v_resultado jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_ajustes) <> 'array'
    OR jsonb_array_length(p_ajustes) = 0
    OR jsonb_array_length(p_ajustes) > 100 THEN
    RAISE EXCEPTION 'Lista de ajustes no valida';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_ajustes)
  LOOP
    v_vino_id := (v_item ->> 'vino_id')::uuid;
    v_modo    := COALESCE(v_item ->> 'modo', '');
    v_tipo    := COALESCE(v_item ->> 'tipo', '');
    v_motivo  := LEFT(COALESCE(NULLIF(TRIM(v_item ->> 'motivo'), ''), 'Ajuste de stock'), 500);
    v_valor   := (v_item ->> 'valor')::integer;

    IF v_modo NOT IN ('delta', 'establecer') THEN
      RAISE EXCEPTION 'Modo de ajuste no valido';
    END IF;
    IF v_tipo NOT IN ('entrada','venta','merma','ajuste','cata','invitacion',
                      'cocina','grupo_evento','maridaje','rotura') THEN
      RAISE EXCEPTION 'Tipo de movimiento no valido';
    END IF;

    SELECT COALESCE(stock, 0), nombre
      INTO v_stock_anterior, v_nombre
    FROM public.vinos
    WHERE id = v_vino_id AND restaurante_id = p_restaurante_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vino no encontrado o no autorizado';
    END IF;

    v_stock_nuevo := CASE
      WHEN v_modo = 'delta'      THEN GREATEST(0, v_stock_anterior + v_valor)
      ELSE                            GREATEST(0, v_valor)
    END;
    v_cantidad := v_stock_nuevo - v_stock_anterior;

    IF v_cantidad <> 0 THEN
      UPDATE public.vinos SET stock = v_stock_nuevo WHERE id = v_vino_id;
      INSERT INTO public.movimientos_stock (
        restaurante_id, vino_id, tipo, cantidad,
        stock_anterior, stock_nuevo, motivo, created_by
      ) VALUES (
        p_restaurante_id, v_vino_id, v_tipo, v_cantidad,
        v_stock_anterior, v_stock_nuevo, v_motivo, p_actor_id
      );

      IF COALESCE((v_item ->> 'registrar_venta')::boolean, FALSE)
        AND v_tipo = 'venta' AND v_cantidad < 0 THEN
        INSERT INTO public.estadisticas (restaurante_id, tipo, detalle)
        VALUES (p_restaurante_id, 'venta', jsonb_build_object(
          'vino_id', v_vino_id, 'vino', v_nombre, 'resultado', 'vendida',
          'cantidad', ABS(v_cantidad), 'origen', 'inventario', 'actor', p_actor_email
        )::text);
      END IF;
    END IF;

    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object(
      'vino_id', v_vino_id, 'stock_anterior', v_stock_anterior,
      'stock_nuevo', v_stock_nuevo, 'cantidad', v_cantidad
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
