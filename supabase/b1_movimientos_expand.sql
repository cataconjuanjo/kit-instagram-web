-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B1 · MIGRACIÓN 1 (EXPAND)                                              ║
-- ║  Movimientos de stock tipificados — vocabulario canónico                 ║
-- ║                                                                          ║
-- ║  Esta migración es expand-only:                                          ║
-- ║  · Añade columnas y tipos nuevos SIN eliminar los legacy                 ║
-- ║  · El código antiguo puede seguir insertando tipos legacy                ║
-- ║    durante la ventana expand → contract                                  ║
-- ║  · El contrato final (quitar legacy del CHECK) va en b1_movimientos_     ║
-- ║    contract.sql, ejecutar solo cuando TODO el código use vocabulario nuevo║
-- ║                                                                          ║
-- ║  Rama:         feat/control-economico-bodega                             ║
-- ║  Dependencias: add_bodega_control.sql                                    ║
-- ║                add_carta_viva_somm.sql  (tipos cocina/grupo_evento/etc.) ║
-- ║                add_economic_traceability.sql  (restaurant_economic_set.) ║
-- ║                                                                          ║
-- ║  Estado previo esperado del CHECK en movimientos_stock:                  ║
-- ║    'entrada','venta','merma','ajuste','cata','invitacion',               ║
-- ║    'cocina','grupo_evento','maridaje','rotura'                           ║
-- ║  (si add_carta_viva_somm.sql está aplicada; idempotente de todas formas) ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FASE A — COLUMNAS NUEVAS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- movimientos_stock: trazabilidad de origen y contexto operativo
ALTER TABLE public.movimientos_stock
  ADD COLUMN IF NOT EXISTS origen TEXT
    NOT NULL DEFAULT 'manual'
    CHECK (origen IN ('manual','tpv','parte','conteo')),
  ADD COLUMN IF NOT EXISTS copas_vendidas INTEGER,       -- nº copas servidas (venta_copa / invitacion_copa)
  ADD COLUMN IF NOT EXISTS mesa TEXT,                   -- identificador de mesa (B7a)
  ADD COLUMN IF NOT EXISTS parte_servicio_id UUID;      -- FK a partes_servicio (se añade en B7a)

-- vinos: PMP separado del último precio de compra
-- · coste_compra = último precio facturado por el proveedor  (no cambia)
-- · coste_medio_pmp = media ponderada acumulada              (B2 lo actualiza)
-- Los márgenes usan coste_medio_pmp cuando exista; coste_compra como fallback.
ALTER TABLE public.vinos
  ADD COLUMN IF NOT EXISTS coste_medio_pmp NUMERIC(10,4);

-- restaurant_economic_settings: control de fuente de ventas y arranque de stock
ALTER TABLE public.restaurant_economic_settings
  ADD COLUMN IF NOT EXISTS fuente_ventas      TEXT
    CHECK (fuente_ventas IN ('tpv','parte','ambas')),
  -- ^ NULL en expand; NOT NULL se aplica en contract tras backfill completo
  ADD COLUMN IF NOT EXISTS fuente_ventas_desde DATE,
  -- ^ fecha de corte al cambiar fuente_ventas; el histórico anterior no se reescribe
  ADD COLUMN IF NOT EXISTS ml_por_copa        INTEGER DEFAULT 125,
  -- ^ solo informativo (B7b "botellas equivalentes"); copas_por_botella sigue
  --   siendo la fuente de verdad para cálculos de precio y margen
  ADD COLUMN IF NOT EXISTS gastos_mensuales   JSONB DEFAULT '[]',
  -- ^ plantilla editable de partidas de gasto (B6); foto inmutable en cierre mensual
  ADD COLUMN IF NOT EXISTS control_stock_desde DATE;
  -- ^ NULL = ventas (origen tpv/parte) NO decrementan stock; se activa tras conteo
  --   inicial (B3). Evita que greatest(0,…) trunque a 0 sobre stock nunca inicializado.


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FASE B — AMPLIAR CHECK DE TIPOS (expand: legacy + nuevo conviven)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE public.movimientos_stock
  DROP CONSTRAINT IF EXISTS movimientos_stock_tipo_check;

ALTER TABLE public.movimientos_stock
  ADD CONSTRAINT movimientos_stock_tipo_check
  CHECK (tipo IN (
    -- ── VOCABULARIO CANÓNICO B1 ─────────────────────────────
    'compra',             -- entrada de mercancía del proveedor          (+stock)
    'devolucion',         -- devolución al proveedor                     (-stock)
    'venta_botella',      -- botella vendida en mesa                     (-stock)
    'venta_copa',         -- botella(s) abiertas para venta por copa     (-stock)
    'invitacion_botella', -- botella invitada / cortesía                 (-stock)
    'invitacion_copa',    -- copa invitada (botella abierta)             (-stock)
    -- ── YA EXISTENTES DESDE add_carta_viva_somm.sql ──────────
    'cocina',             -- consumo en cocina                           (-stock)
    'grupo_evento',       -- consumo en evento o grupo                   (-stock)
    'maridaje',           -- consumo en menú maridaje                    (-stock)
    'rotura',             -- rotura o defecto físico                     (-stock)  UI: "Rotura / defecto"
    'cata',               -- cata interna                                (-stock)
    'ajuste',             -- corrección de inventario (±)                (±stock)
    -- ── LEGACY (compatibilidad durante ventana expand→contract) ─
    'entrada',            -- → compra
    'venta',              -- → venta_botella
    'merma',              -- → rotura
    'invitacion'          -- → invitacion_botella
  ));


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FASE C — BACKFILL IDEMPOTENTE
-- Renombra tipos legacy al vocabulario canónico.
-- No toca stocks ni cantidades. Seguro de ejecutar dos veces.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
DECLARE
  v_cnt_entrada  INTEGER;
  v_cnt_venta    INTEGER;
  v_cnt_merma    INTEGER;
  v_cnt_invit    INTEGER;
  v_stock_antes  JSONB;
  v_stock_despues JSONB;
BEGIN
  -- ── Conteo ANTES ─────────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_cnt_entrada FROM public.movimientos_stock WHERE tipo = 'entrada';
  SELECT COUNT(*) INTO v_cnt_venta   FROM public.movimientos_stock WHERE tipo = 'venta';
  SELECT COUNT(*) INTO v_cnt_merma   FROM public.movimientos_stock WHERE tipo = 'merma';
  SELECT COUNT(*) INTO v_cnt_invit   FROM public.movimientos_stock WHERE tipo = 'invitacion';

  RAISE NOTICE '────────────────────────────────────────────────';
  RAISE NOTICE 'BACKFILL B1 — tipos legacy ANTES del backfill:';
  RAISE NOTICE '  entrada=%  venta=%  merma=%  invitacion=%',
    v_cnt_entrada, v_cnt_venta, v_cnt_merma, v_cnt_invit;

  -- ── Snapshot de stock actual (para verificar integridad post-backfill) ───
  SELECT jsonb_object_agg(id, stock)
    INTO v_stock_antes
  FROM public.vinos
  WHERE restaurante_id IN (
    SELECT DISTINCT restaurante_id FROM public.movimientos_stock
  );

  -- ── Backfill: entrada → compra ───────────────────────────────────────────
  UPDATE public.movimientos_stock
  SET tipo = 'compra'
  WHERE tipo = 'entrada';

  -- ── Backfill: venta → venta_botella ──────────────────────────────────────
  UPDATE public.movimientos_stock
  SET tipo = 'venta_botella'
  WHERE tipo = 'venta';

  -- ── Backfill: merma → rotura ─────────────────────────────────────────────
  UPDATE public.movimientos_stock
  SET tipo = 'rotura'
  WHERE tipo = 'merma';

  -- ── Backfill: invitacion → invitacion_botella ────────────────────────────
  -- Valor conservador: sin información sobre si era copa o botella.
  UPDATE public.movimientos_stock
  SET tipo = 'invitacion_botella'
  WHERE tipo = 'invitacion';

  -- ── Verificación: no deben quedar tipos legacy ───────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.movimientos_stock
    WHERE tipo IN ('entrada','venta','merma','invitacion')
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Backfill incompleto: quedan filas con tipos legacy. Abortando.';
  END IF;

  -- ── Verificación de integridad de stock ──────────────────────────────────
  -- El backfill no toca stocks; si difieren, algo más cambió mientras tanto.
  SELECT jsonb_object_agg(id, stock)
    INTO v_stock_despues
  FROM public.vinos
  WHERE restaurante_id IN (
    SELECT DISTINCT restaurante_id FROM public.movimientos_stock
  );

  IF v_stock_antes IS DISTINCT FROM v_stock_despues THEN
    RAISE EXCEPTION 'El backfill modificó stocks de forma inesperada. Revisar manualmente.';
  END IF;

  RAISE NOTICE 'BACKFILL B1 — completado sin errores:';
  RAISE NOTICE '  entrada→compra=%  venta→venta_botella=%  merma→rotura=%  invitacion→invitacion_botella=%',
    v_cnt_entrada, v_cnt_venta, v_cnt_merma, v_cnt_invit;
  RAISE NOTICE '  Stocks de vinos: sin cambios (verificado)';
  RAISE NOTICE '────────────────────────────────────────────────';
END $$;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FASE D — ÍNDICES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Para agregaciones por periodo + tipo (B5, B7b: semanal/mensual por canal)
CREATE INDEX IF NOT EXISTS movimientos_stock_rest_created_tipo_idx
  ON public.movimientos_stock (restaurante_id, created_at DESC, tipo);

-- Para filtros por origen (invariante D1, informes TPV vs parte vs manual)
CREATE INDEX IF NOT EXISTS movimientos_stock_rest_origen_idx
  ON public.movimientos_stock (restaurante_id, origen);

-- Nota sobre RLS: las políticas existentes filtran por restaurante_id.
-- Los índices de agregación incluyen restaurante_id como primer campo,
-- por lo que el planificador puede usarlos directamente dentro del predicado RLS.


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FASE E — RPC ACTUALIZADA
-- Reemplaza aplicar_ajustes_stock_atomicos con soporte para:
-- · Vocabulario canónico B1 (+ legacy temporal)
-- · Validación de signo por tipo
-- · Invariante D1 (fuente_ventas vs origen)
-- · control_stock_desde (ventas tpv/parte no tocan stock hasta conteo inicial)
-- · Captura de coste_medio_ponderado desde PMP o coste_compra
-- · Nuevos campos: origen, copas_vendidas, mesa
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
  v_stock_anterior      integer;
  v_stock_nuevo         integer;
  v_cantidad            integer;
  v_actualiza_stock     boolean;
  v_coste_capturado     numeric(10,4);
  v_fuente_ventas       text;
  v_ctrl_stock_desde    date;
  v_resultado           jsonb := '[]'::jsonb;
BEGIN
  -- ── Validación básica del array ─────────────────────────────────────────
  IF jsonb_typeof(p_ajustes) <> 'array'
    OR jsonb_array_length(p_ajustes) = 0
    OR jsonb_array_length(p_ajustes) > 100
  THEN
    RAISE EXCEPTION 'Lista de ajustes no valida';
  END IF;

  -- ── Configuración del restaurante (una sola lectura para todo el lote) ──
  SELECT fuente_ventas, control_stock_desde
    INTO v_fuente_ventas, v_ctrl_stock_desde
  FROM public.restaurant_economic_settings
  WHERE restaurante_id = p_restaurante_id;
  -- Si no existe fila, v_fuente_ventas = NULL → invariante D1 no bloquea

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_ajustes)
  LOOP
    v_vino_id        := (v_item ->> 'vino_id')::uuid;
    v_modo           := COALESCE(v_item ->> 'modo', '');
    v_tipo           := COALESCE(v_item ->> 'tipo', '');
    v_motivo         := LEFT(COALESCE(NULLIF(TRIM(v_item ->> 'motivo'), ''), 'Ajuste de stock'), 500);
    v_valor          := (v_item ->> 'valor')::integer;
    v_origen         := COALESCE(NULLIF(TRIM(v_item ->> 'origen'), ''), 'manual');
    v_copas_vendidas := NULLIF((v_item ->> 'copas_vendidas')::integer, 0);
    v_mesa           := NULLIF(LEFT(COALESCE(v_item ->> 'mesa', ''), 60), '');

    -- ── Validación de modo ────────────────────────────────────────────────
    IF v_modo NOT IN ('delta', 'establecer') THEN
      RAISE EXCEPTION 'Modo de ajuste no valido: %', v_modo;
    END IF;

    -- ── Validación de tipo ────────────────────────────────────────────────
    IF v_tipo NOT IN (
      -- canónico
      'compra','devolucion','venta_botella','venta_copa',
      'invitacion_botella','invitacion_copa',
      'cocina','grupo_evento','maridaje','rotura','cata','ajuste',
      -- legacy (expand window)
      'entrada','venta','merma','invitacion'
    ) THEN
      RAISE EXCEPTION 'Tipo de movimiento no valido: %', v_tipo;
    END IF;

    -- ── Validación de origen ──────────────────────────────────────────────
    IF v_origen NOT IN ('manual','tpv','parte','conteo') THEN
      RAISE EXCEPTION 'Origen no valido: %', v_origen;
    END IF;

    -- ── Validación de signo para modo delta ──────────────────────────────
    -- Evita que el caller pase un signo incorrecto, lo que generaría stock
    -- incorrecto de forma silenciosa.
    IF v_modo = 'delta' THEN
      -- Tipos de salida: valor debe ser negativo (o 0)
      IF v_tipo IN (
        'devolucion','venta_botella','venta_copa',
        'invitacion_botella','invitacion_copa',
        'cocina','grupo_evento','maridaje','rotura','cata',
        'venta','merma','invitacion'   -- legacy compat
      ) AND v_valor > 0 THEN
        RAISE EXCEPTION 'tipo % es salida: valor debe ser <= 0 en modo delta (recibido: %)', v_tipo, v_valor;
      END IF;
      -- Tipos de entrada: valor debe ser positivo (o 0)
      IF v_tipo IN ('compra','entrada') AND v_valor < 0 THEN
        RAISE EXCEPTION 'tipo % es entrada: valor debe ser >= 0 en modo delta (recibido: %)', v_tipo, v_valor;
      END IF;
      -- ajuste: acepta cualquier signo (corrección ±)
    END IF;

    -- ── Invariante D1: origen vs fuente_ventas ────────────────────────────
    -- Solo aplica a tipos de venta con origen no-manual.
    -- origen='manual' siempre pasa (son correcciones de stock, no ventas).
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
      -- 'ambas': acepta tpv y parte
    END IF;

    -- ── Lock y lectura del vino ───────────────────────────────────────────
    SELECT
        COALESCE(stock, 0),
        nombre,
        -- PMP si existe; último precio de compra como fallback; NULL si no hay coste
        CASE
          WHEN coste_medio_pmp IS NOT NULL THEN coste_medio_pmp
          WHEN coste_compra    IS NOT NULL AND coste_compra > 0 THEN coste_compra
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

    -- ── ¿Este movimiento actualiza el stock? ─────────────────────────────
    -- Ventas con origen tpv/parte: solo actualizan stock si control_stock_desde
    -- está configurado Y la fecha actual la ha alcanzado.
    -- Todos los demás tipos (compra, salidas sin venta, ajuste) siempre actualizan.
    v_actualiza_stock := TRUE;
    IF v_tipo IN ('venta_botella','venta_copa','venta') AND v_origen IN ('tpv','parte') THEN
      IF v_ctrl_stock_desde IS NULL OR CURRENT_DATE < v_ctrl_stock_desde THEN
        v_actualiza_stock := FALSE;
      END IF;
    END IF;

    -- ── Calcular stock resultante ─────────────────────────────────────────
    IF v_actualiza_stock THEN
      v_stock_nuevo := CASE
        WHEN v_modo = 'delta'      THEN GREATEST(0, v_stock_anterior + v_valor)
        WHEN v_modo = 'establecer' THEN GREATEST(0, v_valor)
      END;
      v_cantidad := v_stock_nuevo - v_stock_anterior;
    ELSE
      -- No toca stock: registra el delta intencional para informes, stock sin cambio
      v_stock_nuevo := v_stock_anterior;
      v_cantidad := CASE
        WHEN v_modo = 'delta'      THEN v_valor
        WHEN v_modo = 'establecer' THEN GREATEST(0, v_valor) - v_stock_anterior
      END;
    END IF;

    -- ── Actualizar stock en vinos ─────────────────────────────────────────
    IF v_actualiza_stock AND v_cantidad <> 0 THEN
      UPDATE public.vinos
      SET stock = v_stock_nuevo
      WHERE id = v_vino_id;
    END IF;

    -- ── Insertar movimiento ───────────────────────────────────────────────
    -- Se inserta si:
    -- · El delta real es != 0, o
    -- · Es venta no-stock (para que B5/B7b la cuenten igual)
    IF v_cantidad <> 0
      OR (v_tipo IN ('venta_botella','venta_copa','venta') AND NOT v_actualiza_stock)
    THEN
      INSERT INTO public.movimientos_stock (
        restaurante_id,
        vino_id,
        tipo,
        cantidad,
        stock_anterior,
        stock_nuevo,
        motivo,
        coste_medio_ponderado,   -- columna existente; aquí rellena con PMP/coste
        origen,
        copas_vendidas,
        mesa,
        created_by
      ) VALUES (
        p_restaurante_id,
        v_vino_id,
        v_tipo,
        v_cantidad,
        v_stock_anterior,
        v_stock_nuevo,
        v_motivo,
        v_coste_capturado,       -- NULL si el vino no tiene coste (nunca 0)
        v_origen,
        v_copas_vendidas,
        v_mesa,
        p_actor_id
      );
    END IF;

    -- ── Estadísticas legacy (solo ventas manuales, como antes) ───────────
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

COMMIT;
