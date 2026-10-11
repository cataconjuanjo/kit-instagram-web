-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B7a · PARTE DE SERVICIO EN SALA                                         ║
-- ║                                                                          ║
-- ║  Expand-only. Sin backup (solo tablas nuevas).                           ║
-- ║  Dependencias: B1 (parte_servicio_id en movimientos_stock ya existe)     ║
-- ║                                                                          ║
-- ║  Novedades:                                                              ║
-- ║    · partes_servicio          — cabecera de turno (borrador/cerrado)     ║
-- ║    · partes_servicio_lineas   — líneas de consumo del turno              ║
-- ║    · FK movimientos_stock.parte_servicio_id → partes_servicio            ║
-- ║    · aplicar_ajustes_stock_atomicos actualizado (añade parte_servicio_id)║
-- ║    · cerrar_parte_servicio — RPC atómica de cierre                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ── 1. partes_servicio ────────────────────────────────────────────────────────
CREATE TABLE public.partes_servicio (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurante_id uuid        NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  fecha          date        NOT NULL DEFAULT CURRENT_DATE,
  turno          text        NOT NULL DEFAULT 'unico'
    CHECK (turno IN ('mediodia','noche','unico')),
  estado         text        NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','cerrado')),
  cerrado_at     timestamptz,
  created_by     uuid,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (restaurante_id, fecha, turno)
);

-- ── 2. partes_servicio_lineas ─────────────────────────────────────────────────
-- cantidad: siempre positivo (botellas físicas).
-- copas_vendidas: solo para venta_copa / invitacion_copa.
-- precio_unitario: snapshot del precio de venta al crear la línea.
CREATE TABLE public.partes_servicio_lineas (
  id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  parte_id        uuid         NOT NULL REFERENCES public.partes_servicio(id) ON DELETE CASCADE,
  restaurante_id  uuid         NOT NULL,
  vino_id         uuid         NOT NULL REFERENCES public.vinos(id),
  tipo            text         NOT NULL
    CHECK (tipo IN (
      'venta_botella','venta_copa',
      'invitacion_botella','invitacion_copa',
      'cocina','grupo_evento','maridaje','rotura','cata'
    )),
  cantidad        integer      NOT NULL CHECK (cantidad > 0),
  copas_vendidas  integer,
  mesa            text         CHECK (length(mesa) <= 60),
  precio_unitario numeric(10,2),
  created_at      timestamptz  DEFAULT now()
);

-- ── 3. FK diferida: movimientos_stock.parte_servicio_id → partes_servicio ─────
-- La columna se añadió en B1 Fase A sin FK porque partes_servicio no existía.
ALTER TABLE public.movimientos_stock
  ADD CONSTRAINT movimientos_stock_parte_servicio_fk
  FOREIGN KEY (parte_servicio_id)
  REFERENCES public.partes_servicio(id)
  ON DELETE SET NULL;

-- ── 4. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.partes_servicio        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partes_servicio_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY partes_servicio_select ON public.partes_servicio FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.restaurantes r
    WHERE r.id = partes_servicio.restaurante_id
      AND r.email = (auth.jwt() ->> 'email')
  ));

CREATE POLICY partes_servicio_insert ON public.partes_servicio FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurantes r
    WHERE r.id = partes_servicio.restaurante_id
      AND r.email = (auth.jwt() ->> 'email')
  ));

CREATE POLICY partes_servicio_update ON public.partes_servicio FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.restaurantes r
    WHERE r.id = partes_servicio.restaurante_id
      AND r.email = (auth.jwt() ->> 'email')
  ));

CREATE POLICY partes_servicio_lineas_select ON public.partes_servicio_lineas FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.restaurantes r
    WHERE r.id = partes_servicio_lineas.restaurante_id
      AND r.email = (auth.jwt() ->> 'email')
  ));

CREATE POLICY partes_servicio_lineas_insert ON public.partes_servicio_lineas FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurantes r
    WHERE r.id = partes_servicio_lineas.restaurante_id
      AND r.email = (auth.jwt() ->> 'email')
  ));

CREATE POLICY partes_servicio_lineas_delete ON public.partes_servicio_lineas FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.restaurantes r
    WHERE r.id = partes_servicio_lineas.restaurante_id
      AND r.email = (auth.jwt() ->> 'email')
  ));

-- ── 5. Índices ────────────────────────────────────────────────────────────────
CREATE INDEX partes_servicio_rest_fecha_idx
  ON public.partes_servicio (restaurante_id, fecha DESC);

CREATE INDEX partes_servicio_lineas_parte_idx
  ON public.partes_servicio_lineas (parte_id);

-- ── 6. aplicar_ajustes_stock_atomicos — añade soporte para parte_servicio_id ──
-- Backward-compatible: campo opcional en cada item JSON (NULL si no se envía).
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
      INSERT INTO public.movimientos_stock (
        restaurante_id, vino_id, tipo, cantidad,
        stock_anterior, stock_nuevo, motivo, coste_medio_ponderado,
        origen, copas_vendidas, mesa, parte_servicio_id, created_by
      ) VALUES (
        p_restaurante_id, v_vino_id, v_tipo, v_cantidad,
        v_stock_anterior, v_stock_nuevo, v_motivo, v_coste_capturado,
        v_origen, v_copas_vendidas, v_mesa, v_parte_servicio_id, p_actor_id
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

-- ── 7. cerrar_parte_servicio ───────────────────────────────────────────────────
-- Respeta fuente_ventas:
--   NULL / 'parte' → líneas de venta generan movimientos normalmente
--   'tpv'          → falla si hay líneas de venta (origen conflicto)
--   'ambas'        → líneas de venta se omiten (solo conciliación informativa)
-- Respeta control_stock_desde: la RPC ya maneja esto por origen='parte'.
-- invitaciones, cocina, maridaje, etc. siempre mueven stock (no son venta).
-- Copa (venta_copa / invitacion_copa): delta=0 (sin deducción de botella en B7a).
-- Idempotente: doble clic devuelve 'already_closed' sin error.
CREATE OR REPLACE FUNCTION public.cerrar_parte_servicio(
  p_parte_id    uuid,
  p_actor_id    uuid  DEFAULT NULL,
  p_actor_email text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parte          record;
  v_fuente_ventas  text;
  v_ajustes        jsonb := '[]'::jsonb;
  v_linea          record;
  v_delta          integer;
  v_resultado      jsonb;
BEGIN
  SELECT * INTO v_parte
  FROM public.partes_servicio
  WHERE id = p_parte_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parte no encontrado: %', p_parte_id;
  END IF;

  IF v_parte.estado = 'cerrado' THEN
    RETURN jsonb_build_object('status', 'already_closed', 'parte_id', p_parte_id);
  END IF;

  SELECT fuente_ventas
    INTO v_fuente_ventas
  FROM public.restaurant_economic_settings
  WHERE restaurante_id = v_parte.restaurante_id;

  IF v_fuente_ventas = 'tpv' THEN
    IF EXISTS (
      SELECT 1 FROM public.partes_servicio_lineas
      WHERE parte_id = p_parte_id
        AND tipo IN ('venta_botella','venta_copa')
    ) THEN
      RAISE EXCEPTION 'fuente_ventas_conflict: restaurante en modo tpv; elimina las lineas de venta antes de cerrar el parte';
    END IF;
  END IF;

  FOR v_linea IN
    SELECT * FROM public.partes_servicio_lineas
    WHERE parte_id = p_parte_id
    ORDER BY created_at
  LOOP
    -- 'ambas': ventas solo son conciliación informativa, sin movimiento de stock
    IF v_fuente_ventas = 'ambas'
      AND v_linea.tipo IN ('venta_botella','venta_copa') THEN
      CONTINUE;
    END IF;

    -- Copa: sin deducción de botella en B7a (conversión en B4)
    v_delta := CASE
      WHEN v_linea.tipo IN ('venta_copa','invitacion_copa') THEN 0
      ELSE -(v_linea.cantidad)
    END;

    v_ajustes := v_ajustes || jsonb_build_array(jsonb_build_object(
      'vino_id',           v_linea.vino_id,
      'modo',              'delta',
      'tipo',              v_linea.tipo,
      'valor',             v_delta,
      'motivo',            'Parte ' || v_parte.fecha::text || ' ' || v_parte.turno,
      'origen',            'parte',
      'copas_vendidas',    v_linea.copas_vendidas,
      'mesa',              v_linea.mesa,
      'parte_servicio_id', p_parte_id
    ));
  END LOOP;

  IF jsonb_array_length(v_ajustes) > 0 THEN
    v_resultado := public.aplicar_ajustes_stock_atomicos(
      v_parte.restaurante_id, v_ajustes, p_actor_id, p_actor_email
    );
  ELSE
    v_resultado := '[]'::jsonb;
  END IF;

  UPDATE public.partes_servicio
  SET estado = 'cerrado', cerrado_at = now()
  WHERE id = p_parte_id;

  RETURN jsonb_build_object(
    'status',      'closed',
    'parte_id',    p_parte_id,
    'movimientos', v_resultado
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cerrar_parte_servicio(uuid, uuid, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_parte_servicio(uuid, uuid, text)
  TO service_role;

COMMIT;
