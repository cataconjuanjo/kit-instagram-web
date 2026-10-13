-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B2 · Compras con descuento y PMP                                       ║
-- ║                                                                          ║
-- ║  Cambios:                                                                ║
-- ║  1. Tabla cabecera_compras — una fila por albarán/factura                ║
-- ║  2. Tabla lineas_compra — líneas de producto con descuento y bonus       ║
-- ║  3. movimientos_stock: ADD COLUMN cabecera_compra_id (FK opcional)       ║
-- ║  4. RPC registrar_compra_con_pmp — transacción atómica con PMP           ║
-- ║  5. aplicar_ajustes_stock_atomicos v3:                                   ║
-- ║     · origen 'importacion' permitido                                     ║
-- ║     · tipo 'compra' bloqueado → usar registrar_compra_con_pmp            ║
-- ║     · UPDATE vinos.coste_compra cuando tipo='compra' (ya no aplica,      ║
-- ║       pero se deja el UPDATE en registrar_compra_con_pmp)                ║
-- ║                                                                          ║
-- ║  Rollback: b2_compras_pmp_rollback.sql                                   ║
-- ║  Aplicar: SQL Editor de Supabase → ejecutar este fichero completo.       ║
-- ║  Idempotente (IF NOT EXISTS / CREATE OR REPLACE).                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. cabecera_compras
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cabecera_compras (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id     UUID          NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  proveedor          TEXT          NOT NULL CHECK (btrim(proveedor) <> ''),
  fecha              DATE          NOT NULL,
  numero_documento   TEXT,                          -- nº factura / albarán (opcional)
  referencia_externa TEXT,                          -- UUID anti doble-clic del cliente
  descuento_global   NUMERIC(5,2)  NOT NULL DEFAULT 0
                       CHECK (descuento_global >= 0 AND descuento_global < 100),
  iva_pct            NUMERIC(5,2)  NOT NULL DEFAULT 21
                       CHECK (iva_pct >= 0 AND iva_pct <= 100),
  notas              TEXT,
  origen             TEXT          NOT NULL DEFAULT 'manual'
                       CHECK (origen IN ('manual', 'importacion')),
  estado             TEXT          NOT NULL DEFAULT 'aplicada'
                       CHECK (estado IN ('borrador', 'aplicada')),
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Unicidad: mismo restaurante + mismo proveedor (normalizado) + mismo nº documento
-- NULL en numero_documento → sin constraint (múltiples entradas manuales sin factura)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cab_compras_doc
  ON public.cabecera_compras (restaurante_id, lower(btrim(proveedor)), numero_documento)
  WHERE numero_documento IS NOT NULL;

-- Unicidad por referencia externa (anti doble-clic / anti reintento de importación)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cab_compras_ref_ext
  ON public.cabecera_compras (restaurante_id, referencia_externa)
  WHERE referencia_externa IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. lineas_compra
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lineas_compra (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  cabecera_id       UUID          NOT NULL REFERENCES public.cabecera_compras(id) ON DELETE CASCADE,
  restaurante_id    UUID          NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  vino_id           UUID          NOT NULL REFERENCES public.vinos(id),
  uds               INTEGER       NOT NULL CHECK (uds > 0),
  uds_bonificadas   INTEGER       NOT NULL DEFAULT 0 CHECK (uds_bonificadas >= 0),
  precio_tarifa     NUMERIC(10,4) NOT NULL CHECK (precio_tarifa >= 0),
  descuento_linea   NUMERIC(5,2)  NOT NULL DEFAULT 0
                      CHECK (descuento_linea >= 0 AND descuento_linea < 100),
  -- Campos calculados y almacenados por registrar_compra_con_pmp
  precio_neto_ud    NUMERIC(10,4) NOT NULL,
  importe_neto      NUMERIC(14,4) NOT NULL,  -- base imponible de esta línea (sin IVA)
  iva_importe       NUMERIC(14,4) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. movimientos_stock: FK opcional hacia cabecera_compras
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.movimientos_stock
  ADD COLUMN IF NOT EXISTS cabecera_compra_id UUID
    REFERENCES public.cabecera_compras(id) ON DELETE SET NULL;

-- Índice para la consulta histórico (IS NULL) en calcularMesBodega
CREATE INDEX IF NOT EXISTS idx_movs_cabecera_compra
  ON public.movimientos_stock (restaurante_id, cabecera_compra_id)
  WHERE cabecera_compra_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS — cabecera_compras y lineas_compra
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.cabecera_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineas_compra    ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN

  -- cabecera_compras
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cabecera_compras' AND policyname='cab_compras_select') THEN
    CREATE POLICY cab_compras_select ON public.cabecera_compras FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = cabecera_compras.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cabecera_compras' AND policyname='cab_compras_insert') THEN
    CREATE POLICY cab_compras_insert ON public.cabecera_compras FOR INSERT
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = cabecera_compras.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cabecera_compras' AND policyname='cab_compras_delete') THEN
    CREATE POLICY cab_compras_delete ON public.cabecera_compras FOR DELETE
      USING (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = cabecera_compras.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  -- lineas_compra
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lineas_compra' AND policyname='lineas_compra_select') THEN
    CREATE POLICY lineas_compra_select ON public.lineas_compra FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = lineas_compra.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lineas_compra' AND policyname='lineas_compra_insert') THEN
    CREATE POLICY lineas_compra_insert ON public.lineas_compra FOR INSERT
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = lineas_compra.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lineas_compra' AND policyname='lineas_compra_delete') THEN
    CREATE POLICY lineas_compra_delete ON public.lineas_compra FOR DELETE
      USING (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = lineas_compra.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. registrar_compra_con_pmp
-- ─────────────────────────────────────────────────────────────────────────────
-- Fórmulas:
--   importe_linea   = precio_tarifa × uds × (1 - desc_linea/100)
--   importe_neto    = importe_linea × (1 - desc_global/100)
--   uds_totales     = uds + uds_bonificadas
--   precio_neto_ud  = importe_neto / uds_totales                    (4 decimales)
--   iva_importe     = importe_neto × iva_pct/100
--
--   PMP nuevo       = (stock × PMP_base + uds_totales × precio_neto_ud)
--                     / (stock + uds_totales)
--   (Si stock=0 o PMP_base=NULL → PMP = precio_neto_ud)
--
-- Snapshot en movimiento = precio_neto_ud de esta compra (coste de entrada).
-- coste_compra se actualiza al último precio neto unitario (punto 8).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_compra_con_pmp(
  p_restaurante_id   uuid,
  p_cabecera         jsonb,   -- {proveedor, fecha, numero_documento?, referencia_externa?, descuento_global, iva_pct, notas?, origen?}
  p_lineas           jsonb    -- [{vino_id, uds, uds_bonificadas?, precio_tarifa, descuento_linea?}]
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

    -- Precio neto: importe sobre las uds facturadas, distribuido entre uds+bonificadas
    -- importe_neto  = precio_tarifa × uds × (1−desc_linea/100) × (1−desc_global/100)
    -- precio_neto_ud = importe_neto / (uds + uds_bonificadas)
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
      -- Stock vacío o sin precio previo: el PMP es el coste de esta compra
      v_pmp_nuevo := v_precio_neto_ud;
    ELSE
      v_pmp_nuevo := round(
        (v_stock_actual * v_pmp_base + v_uds_totales * v_precio_neto_ud)
          / (v_stock_actual + v_uds_totales),
        4
      );
    END IF;

    -- ── Actualizar vino: stock + PMP + coste_compra (último precio neto) ──────
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
    -- coste_medio_ponderado = precio_neto_ud de esta compra (snapshot de entrada)
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

REVOKE ALL ON FUNCTION public.registrar_compra_con_pmp(uuid, jsonb, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_compra_con_pmp(uuid, jsonb, jsonb) TO service_role, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. aplicar_ajustes_stock_atomicos v3
--    Cambios sobre v2:
--    · origen 'importacion' permitido
--    · tipo 'compra' bloqueado: debe usar registrar_compra_con_pmp
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

    -- v3: tipo 'compra' bloqueado — usar registrar_compra_con_pmp
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

    -- v3: 'importacion' añadido como origen válido
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

    SELECT
        COALESCE(stock, 0),
        nombre,
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

    v_actualiza_stock := TRUE;
    IF v_tipo IN ('venta_botella','venta_copa','venta') AND v_origen IN ('tpv','parte') THEN
      IF v_ctrl_stock_desde IS NULL OR v_fecha_madrid < v_ctrl_stock_desde THEN
        v_actualiza_stock := FALSE;
      ELSIF v_fuente_ventas = 'ambas' AND v_origen = 'parte' THEN
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
      UPDATE public.vinos
      SET stock = v_stock_nuevo
      WHERE id = v_vino_id;
    END IF;

    IF v_cantidad <> 0
      OR (v_tipo IN ('venta_botella','venta_copa','venta') AND NOT v_actualiza_stock)
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
