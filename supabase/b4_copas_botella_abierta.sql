-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B4 · Venta por copa: botella abierta, rendimiento y conversión          ║
-- ║                                                                          ║
-- ║  Cambios:                                                                ║
-- ║  1. vinos.por_copa BOOLEAN DEFAULT false — marca vino servible por copa  ║
-- ║     Backfill: por_copa=true donde precio_copa > 0                        ║
-- ║  2. Tabla botellas_abiertas — saldo de copas por vino                    ║
-- ║     UNIQUE parcial (restaurante_id, vino_id) WHERE estado='abierta'      ║
-- ║  3. RPC gestionar_botella_copa — cerrar botella abierta (delta stock=0)  ║
-- ║  4. aplicar_ajustes_stock_atomicos v4:                                   ║
-- ║     · Lee por_copa y settings copa desde restaurant_economic_settings    ║
-- ║     · venta_copa / invitacion_copa con por_copa=true consume saldo;      ║
-- ║       abre botella nueva si saldo < 1 (stock −1, clampeado a 0)          ║
-- ║     · cambio #2: la parte sin marcar por_copa sigue igual que en v3      ║
-- ║     · cambio #1: el movimiento lleva cantidad=−N_botellas (no copas),    ║
-- ║       copas_vendidas=N — la informe usa copas_vendidas (partes_lineas),  ║
-- ║       no cantidad, así que no hay regresión de coste                     ║
-- ║                                                                          ║
-- ║  Nota parte cerrado: no existe acción reabrir/anular partes hoy.         ║
-- ║  Si un parte cerrado tuviera que revertirse en el futuro, habría que     ║
-- ║  restablecer manualmente los saldos en botellas_abiertas.                ║
-- ║                                                                          ║
-- ║  Rollback: b4_copas_botella_abierta_rollback.sql                         ║
-- ║  Aplicar: SQL Editor de Supabase → ejecutar este fichero completo.       ║
-- ║  Idempotente (IF NOT EXISTS / CREATE OR REPLACE).                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. vinos.por_copa
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.vinos
  ADD COLUMN IF NOT EXISTS por_copa BOOLEAN NOT NULL DEFAULT false;

-- Backfill: marcar por_copa=true donde ya existe precio_copa > 0
-- (refleja los vinos que ya se venden por copa antes de B4)
-- Para ver el recuento por restaurante antes de aplicar:
--   SELECT restaurante_id, count(*) FROM vinos
--   WHERE precio_copa IS NOT NULL AND precio_copa > 0 GROUP BY restaurante_id;
UPDATE public.vinos
   SET por_copa = true
 WHERE precio_copa IS NOT NULL AND precio_copa > 0 AND por_copa = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. botellas_abiertas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.botellas_abiertas (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id         UUID          NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  vino_id                UUID          NOT NULL REFERENCES public.vinos(id),
  copas_restantes        NUMERIC(8,4)  NOT NULL CHECK (copas_restantes >= 0),
  copas_servidas         NUMERIC(8,4)  NOT NULL DEFAULT 0,
  copas_teoricas         NUMERIC(8,4)  NOT NULL CHECK (copas_teoricas > 0),
  coste_copa             NUMERIC(10,4) NOT NULL DEFAULT 0,
  abierta_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  cerrada_at             TIMESTAMPTZ,
  estado                 TEXT          NOT NULL DEFAULT 'abierta'
                           CHECK (estado IN ('abierta', 'agotada', 'cerrada_manual')),
  movimiento_apertura_id UUID          REFERENCES public.movimientos_stock(id) ON DELETE SET NULL,
  motivo_cierre          TEXT,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Máximo una botella abierta por vino y restaurante
CREATE UNIQUE INDEX IF NOT EXISTS idx_botellas_abiertas_one_per_vino
  ON public.botellas_abiertas (restaurante_id, vino_id)
  WHERE estado = 'abierta';

-- Índice para las consultas de rendimiento (por período y estado)
CREATE INDEX IF NOT EXISTS idx_botellas_abiertas_cerradas
  ON public.botellas_abiertas (restaurante_id, cerrada_at)
  WHERE estado IN ('agotada', 'cerrada_manual');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS — botellas_abiertas
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.botellas_abiertas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='botellas_abiertas' AND policyname='botellas_abiertas_select') THEN
    CREATE POLICY botellas_abiertas_select ON public.botellas_abiertas FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = botellas_abiertas.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='botellas_abiertas' AND policyname='botellas_abiertas_insert') THEN
    CREATE POLICY botellas_abiertas_insert ON public.botellas_abiertas FOR INSERT
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = botellas_abiertas.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='botellas_abiertas' AND policyname='botellas_abiertas_update') THEN
    CREATE POLICY botellas_abiertas_update ON public.botellas_abiertas FOR UPDATE
      USING (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = botellas_abiertas.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='botellas_abiertas' AND policyname='botellas_abiertas_delete') THEN
    CREATE POLICY botellas_abiertas_delete ON public.botellas_abiertas FOR DELETE
      USING (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = botellas_abiertas.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. gestionar_botella_copa
--    Única acción: 'cerrar' (desechar botella abierta manualmente).
--    El movimiento de rotura lleva cantidad=0 — el stock ya se decrementó
--    cuando se abrió la botella; no debe bajar dos veces (cambio #2).
--    Valor registrado: copas_restantes × coste_copa.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gestionar_botella_copa(
  p_restaurante_id UUID,
  p_vino_id        UUID,
  p_accion         TEXT,         -- 'cerrar'
  p_motivo         TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_botella_id       UUID;
  v_copas_restantes  NUMERIC(8,4);
  v_coste_copa       NUMERIC(10,4);
  v_stock_actual     INTEGER;
  v_por_copa         BOOLEAN;
BEGIN
  IF p_accion <> 'cerrar' THEN
    RAISE EXCEPTION 'accion_invalida: %', p_accion;
  END IF;

  SELECT COALESCE(stock, 0), COALESCE(por_copa, false)
    INTO v_stock_actual, v_por_copa
  FROM public.vinos
  WHERE id = p_vino_id AND restaurante_id = p_restaurante_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'vino_no_encontrado: %', p_vino_id; END IF;
  IF NOT v_por_copa THEN RAISE EXCEPTION 'vino_no_por_copa: %', p_vino_id; END IF;

  SELECT id, copas_restantes, coste_copa
    INTO v_botella_id, v_copas_restantes, v_coste_copa
  FROM public.botellas_abiertas
  WHERE restaurante_id = p_restaurante_id
    AND vino_id = p_vino_id
    AND estado = 'abierta'
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'no_botella_abierta'; END IF;

  -- Marcar cerrada (cambio #2: stock NO baja, ya bajó al abrir la botella)
  UPDATE public.botellas_abiertas
     SET estado       = 'cerrada_manual',
         cerrada_at   = now(),
         copas_restantes = 0,
         motivo_cierre = p_motivo
   WHERE id = v_botella_id;

  -- Registrar rotura con cantidad=0 (stock_anterior = stock_nuevo)
  -- El coste_medio_ponderado registra el coste de las copas desechadas
  IF v_copas_restantes > 0 THEN
    INSERT INTO public.movimientos_stock (
      restaurante_id, vino_id, tipo, cantidad,
      stock_anterior, stock_nuevo,
      motivo, coste_medio_ponderado, origen
    ) VALUES (
      p_restaurante_id, p_vino_id, 'rotura', 0,
      v_stock_actual, v_stock_actual,
      COALESCE(p_motivo, 'Cierre manual botella abierta'),
      v_coste_copa, 'manual'
    );
  END IF;

  RETURN jsonb_build_object(
    'botella_id',        v_botella_id,
    'copas_descartadas', v_copas_restantes,
    'coste_descartado',  ROUND(v_copas_restantes * COALESCE(v_coste_copa, 0), 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gestionar_botella_copa(uuid, uuid, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gestionar_botella_copa(uuid, uuid, text, text)
  TO service_role, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. aplicar_ajustes_stock_atomicos v4
--
-- Cambios sobre v3:
-- · Lee copas_por_botella y merma_copa_pct de restaurant_economic_settings
-- · Para venta_copa / invitacion_copa con vino.por_copa=true y v_actualiza_stock=TRUE:
--     - Consume saldo de botellas_abiertas
--     - Si saldo < 1: descarta el resto (merma) y abre botella nueva (stock −1)
--     - La apertura usa GREATEST(0, stock−1): mismo comportamiento que stock=0 en botella
--     - N botellas necesarias abre en un WHILE; protección contra bucle infinito
--   El movimiento lleva cantidad=−N_botellas, copas_vendidas=N_copas (no cambia B5)
-- · Para por_copa=false: comportamiento idéntico a v3 (delta=0, sin saldo)
-- · Siempre registra el movimiento de copa cuando por_copa=true y v_actualiza_stock=TRUE
--
-- Nota (cambio #1 de B4): _agruparLineas (informe semanal y calcularMesBodega) lee
-- copas_vendidas de partes_servicio_lineas, nunca cantidad de movimientos_stock.
-- cantidad=−N en el movimiento no afecta el coste de copas calculado en B5.
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_fecha_madrid        date;
  v_resultado           jsonb := '[]'::jsonb;

  -- v4: copa por botella abierta
  v_por_copa            boolean;
  v_copas_por_botella   numeric(6,2);
  v_merma_pct           numeric(6,2);
  v_copas_teoricas      numeric(8,4);
  v_coste_copa_snap     numeric(10,4);
  v_copas_pendientes    integer;
  v_botellas_count      integer;
  v_stock_actual        integer;
  v_botella_id          uuid;
  v_copas_restantes     numeric(8,4);
  v_servir              integer;
  v_nuevo_mov_id        uuid;
BEGIN
  IF jsonb_typeof(p_ajustes) <> 'array'
    OR jsonb_array_length(p_ajustes) = 0
    OR jsonb_array_length(p_ajustes) > 100
  THEN
    RAISE EXCEPTION 'Lista de ajustes no valida';
  END IF;

  SELECT fuente_ventas, control_stock_desde,
         COALESCE(copas_por_botella, 5), COALESCE(merma_copa_pct, 0)
    INTO v_fuente_ventas, v_ctrl_stock_desde, v_copas_por_botella, v_merma_pct
  FROM public.restaurant_economic_settings
  WHERE restaurante_id = p_restaurante_id;

  -- Defaults si no hay fila en settings
  v_copas_por_botella := COALESCE(v_copas_por_botella, 5);
  v_merma_pct         := COALESCE(v_merma_pct, 0);
  v_copas_teoricas    := ROUND(v_copas_por_botella * (1 - v_merma_pct / 100.0), 4);
  IF v_copas_teoricas < 1 THEN v_copas_teoricas := 1; END IF;  -- mínimo 1 copa por botella

  v_fecha_madrid := (now() AT TIME ZONE 'Europe/Madrid')::date;

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

    IF v_valor IS NULL THEN
      RAISE EXCEPTION 'valor no puede ser NULL (vino_id=%)', v_vino_id;
    END IF;

    IF v_modo NOT IN ('delta', 'establecer') THEN
      RAISE EXCEPTION 'Modo de ajuste no valido: %', v_modo;
    END IF;

    -- compra bloqueada (v3 onward)
    IF v_tipo = 'compra' THEN
      RAISE EXCEPTION 'compra_usar_rpc: las compras deben registrarse con registrar_compra_con_pmp';
    END IF;

    IF v_tipo NOT IN (
      'devolucion','venta_botella','venta_copa',
      'invitacion_botella','invitacion_copa',
      'cocina','grupo_evento','maridaje','rotura','cata','ajuste',
      'entrada','venta','merma','invitacion'
    ) THEN
      RAISE EXCEPTION 'Tipo de movimiento no valido: %', v_tipo;
    END IF;

    IF v_origen NOT IN ('manual','tpv','parte','conteo','importacion') THEN
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
      IF v_tipo IN ('entrada') AND v_valor < 0 THEN
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

    -- ── Leer vino con lock (v4: incluye por_copa) ────────────────────────────
    SELECT
        COALESCE(stock, 0),
        nombre,
        CASE
          WHEN coste_medio_pmp IS NOT NULL THEN coste_medio_pmp
          WHEN coste_compra    IS NOT NULL AND coste_compra > 0 THEN coste_compra
          ELSE NULL
        END,
        COALESCE(por_copa, false)
      INTO v_stock_anterior, v_nombre, v_coste_capturado, v_por_copa
    FROM public.vinos
    WHERE id = v_vino_id
      AND restaurante_id = p_restaurante_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vino no encontrado o no autorizado: %', v_vino_id;
    END IF;

    -- ── v4: vino sin marca por_copa no puede recibir líneas de copa ──────────
    IF v_tipo IN ('venta_copa','invitacion_copa') AND NOT v_por_copa THEN
      RAISE EXCEPTION 'vino_no_por_copa: el vino % no está marcado para servir por copa', v_vino_id;
    END IF;

    -- ── control_stock_desde gate ─────────────────────────────────────────────
    -- Solo aplica a venta_copa/botella/venta con origen parte/tpv
    -- invitacion_copa nunca tiene gate (respeta comportamiento v3)
    v_actualiza_stock := TRUE;
    IF v_tipo IN ('venta_botella','venta_copa','venta') AND v_origen IN ('tpv','parte') THEN
      IF v_ctrl_stock_desde IS NULL OR v_fecha_madrid < v_ctrl_stock_desde THEN
        v_actualiza_stock := FALSE;
      ELSIF v_fuente_ventas = 'ambas' AND v_origen = 'parte' THEN
        v_actualiza_stock := FALSE;
      END IF;
    END IF;

    -- ── Cálculo de stock nuevo y cantidad ────────────────────────────────────
    --
    -- v4: copa por_copa=true con v_actualiza_stock=TRUE → camino copa (WHILE loop)
    -- El resto → camino v3 original
    --
    IF v_por_copa AND v_tipo IN ('venta_copa','invitacion_copa') AND v_actualiza_stock THEN

      -- Validar que llega copas_vendidas
      IF COALESCE(v_copas_vendidas, 0) <= 0 THEN
        RAISE EXCEPTION 'copas_vendidas_requerido para vino % con por_copa=true', v_vino_id;
      END IF;

      -- Snapshot coste copa: coste_botella / copasVendibles
      v_coste_copa_snap := CASE
        WHEN v_coste_capturado IS NOT NULL AND v_coste_capturado > 0 AND v_copas_teoricas > 0
          THEN ROUND(v_coste_capturado / v_copas_teoricas, 4)
        ELSE 0
      END;

      v_copas_pendientes := v_copas_vendidas;
      v_botellas_count   := 0;
      v_stock_actual     := v_stock_anterior;  -- mutable durante el loop

      -- ── Loop: consumir copas, abriendo botellas si necesario ────────────────
      -- Protección: máximo (copas_vendidas / 1) + 1 iteraciones (evita bucle infinito)
      DECLARE v_iter_max integer := v_copas_vendidas + 2; v_iter integer := 0; BEGIN
      WHILE v_copas_pendientes > 0 AND v_iter < v_iter_max LOOP
        v_iter := v_iter + 1;

        -- Intentar obtener botella abierta con lock
        SELECT id, copas_restantes
          INTO v_botella_id, v_copas_restantes
        FROM public.botellas_abiertas
        WHERE restaurante_id = p_restaurante_id
          AND vino_id = v_vino_id
          AND estado = 'abierta'
        FOR UPDATE;

        -- Cambio #4: si no hay botella o queda < 1 copa, descartar resto y abrir nueva
        IF NOT FOUND OR v_copas_restantes < 1 THEN
          IF FOUND AND v_copas_restantes > 0 THEN
            -- Descartar la fracción (< 1 copa) → pasa a merma de rendimiento
            UPDATE public.botellas_abiertas
               SET estado = 'agotada', cerrada_at = now(), copas_restantes = 0
             WHERE id = v_botella_id;
          ELSIF FOUND THEN
            -- copas_restantes ya era 0
            UPDATE public.botellas_abiertas
               SET estado = 'agotada', cerrada_at = now()
             WHERE id = v_botella_id;
          END IF;

          -- Abrir botella nueva: stock −1, clampeado igual que venta_botella (cambio #7)
          v_stock_actual := GREATEST(0, v_stock_actual - 1);
          v_botellas_count := v_botellas_count + 1;

          INSERT INTO public.botellas_abiertas (
            restaurante_id, vino_id,
            copas_restantes, copas_servidas, copas_teoricas, coste_copa,
            estado
          ) VALUES (
            p_restaurante_id, v_vino_id,
            v_copas_teoricas, 0, v_copas_teoricas, v_coste_copa_snap,
            'abierta'
          );

          -- Re-leer la botella recién creada con lock
          SELECT id, copas_restantes
            INTO v_botella_id, v_copas_restantes
          FROM public.botellas_abiertas
          WHERE restaurante_id = p_restaurante_id
            AND vino_id = v_vino_id
            AND estado = 'abierta'
          FOR UPDATE;
        END IF;

        -- Servir FLOOR(copas_restantes) copas (evita fracciones < 1 al siguiente turno)
        v_servir := LEAST(FLOOR(v_copas_restantes)::integer, v_copas_pendientes);

        IF v_servir < 1 THEN
          -- copas_teoricas < 1 → error de configuración
          RAISE EXCEPTION 'copas_teoricas_invalidas: copas_por_botella × (1−merma) < 1 para vino %', v_vino_id;
        END IF;

        UPDATE public.botellas_abiertas
           SET copas_restantes = copas_restantes - v_servir,
               copas_servidas  = copas_servidas  + v_servir
         WHERE id = v_botella_id
         RETURNING copas_restantes INTO v_copas_restantes;

        IF v_copas_restantes = 0 THEN
          UPDATE public.botellas_abiertas
             SET estado = 'agotada', cerrada_at = now()
           WHERE id = v_botella_id;
        END IF;

        v_copas_pendientes := v_copas_pendientes - v_servir;
      END LOOP;
      END;  -- DECLARE v_iter_max / v_iter

      -- Actualizar stock del vino si se abrieron botellas
      IF v_botellas_count > 0 THEN
        UPDATE public.vinos SET stock = v_stock_actual WHERE id = v_vino_id;
      END IF;

      v_stock_nuevo := v_stock_actual;
      v_cantidad    := -v_botellas_count;  -- bottles opened this call (0 or negative)

    ELSE
      -- ── Camino v3 original (sin copa por botella abierta) ─────────────────
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
        UPDATE public.vinos
           SET stock = v_stock_nuevo
         WHERE id = v_vino_id;
      END IF;

    END IF;  -- copa vs regular

    -- ── Registrar movimiento ──────────────────────────────────────────────────
    --
    -- Condición extendida en v4:
    --  · siempre para copa por_copa=true con v_actualiza_stock=TRUE (aunque cantidad=0,
    --    necesitamos el registro para auditar copas servidas y para estadísticas)
    --  · resto: misma condición que v3
    IF v_cantidad <> 0
      OR (v_tipo IN ('venta_botella','venta_copa','venta') AND NOT v_actualiza_stock)
      OR (v_por_copa AND v_tipo IN ('venta_copa','invitacion_copa')
          AND v_actualiza_stock AND COALESCE(v_copas_vendidas, 0) > 0)
    THEN
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
        p_restaurante_id,
        'venta',
        jsonb_build_object(
          'vino_id',   v_vino_id,
          'vino',      v_nombre,
          'resultado', 'vendida',
          'cantidad',  ABS(v_cantidad),
          'origen',    'inventario',
          'actor',     p_actor_email
        )::text
      );
    END IF;

    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object(
      'vino_id',         v_vino_id,
      'stock_anterior',  v_stock_anterior,
      'stock_nuevo',     v_stock_nuevo,
      'cantidad',        v_cantidad,
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

-- Notificar a PostgREST para que recargue el schema
NOTIFY pgrst, 'reload schema';

COMMIT;
