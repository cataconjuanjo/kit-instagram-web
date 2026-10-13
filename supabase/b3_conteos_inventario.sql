-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B3 · CONTEOS DE INVENTARIO                                              ║
-- ║                                                                          ║
-- ║  Expand-only. Sin backup (tablas nuevas).                                ║
-- ║  Dependencias: B1 (movimientos_stock, restaurant_economic_settings),     ║
-- ║                B7a (aplicar_ajustes_stock_atomicos v2, parte_servicio_id)║
-- ║                b3_aplicar_ajustes_v2.sql (ya aplicado)                  ║
-- ║                                                                          ║
-- ║  Aplicar en producción: SQL Editor de Supabase → ejecutar.              ║
-- ║  Idempotente (IF NOT EXISTS / CREATE OR REPLACE).                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ── 1. conteos_inventario — cabecera ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conteos_inventario (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurante_id uuid        NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  tipo           text        NOT NULL CHECK (tipo IN ('inicial', 'periodico')),
  estado         text        NOT NULL DEFAULT 'borrador'
                             CHECK (estado IN ('borrador', 'cerrado')),
  cerrado_en     timestamptz,
  notas          text,
  created_at     timestamptz DEFAULT now()
);

-- ── 2. conteos_inventario_lineas — detalle por vino ───────────────────────────
-- stock_teorico: snapshot de vinos.stock en el momento de crear el borrador.
-- diferencia GENERATED: stock_contado - stock_teorico (NULL si aún no contado).
-- Nota sobre teórico: usar stock_nuevo - stock_anterior de movimientos_stock,
-- NO cantidad, porque ventas previas a control_stock_desde tienen cantidad≠0
-- pero no cambiaron stock (stock_nuevo = stock_anterior).
CREATE TABLE IF NOT EXISTS public.conteos_inventario_lineas (
  id                      uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  conteo_id               uuid          NOT NULL
                          REFERENCES public.conteos_inventario(id) ON DELETE CASCADE,
  restaurante_id          uuid          NOT NULL
                          REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  vino_id                 uuid          NOT NULL REFERENCES public.vinos(id),
  stock_teorico           integer       NOT NULL,
  stock_contado           integer,
  diferencia              integer
    GENERATED ALWAYS AS (
      CASE WHEN stock_contado IS NOT NULL
           THEN stock_contado - stock_teorico
      END
    ) STORED,
  coste_unitario_snapshot numeric(10,4),
  motivo                  text          CHECK (motivo IN (
                            'rotura','invitacion_no_reg','error_anterior',
                            'venta_no_reg','otro'
                          )),
  contado                 boolean       NOT NULL DEFAULT false,
  created_at              timestamptz   DEFAULT now(),
  UNIQUE (conteo_id, vino_id)
);

-- ── 3. Índices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS conteos_inventario_rest_estado_idx
  ON public.conteos_inventario (restaurante_id, estado, created_at DESC);

CREATE INDEX IF NOT EXISTS conteos_inventario_lineas_conteo_idx
  ON public.conteos_inventario_lineas (conteo_id);

-- ── 4. RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.conteos_inventario        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conteos_inventario_lineas ENABLE ROW LEVEL SECURITY;

-- Políticas por email del restaurante (mismo patrón que partes_servicio)
DO $$ BEGIN

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conteos_inventario' AND policyname = 'ci_select') THEN
    CREATE POLICY ci_select ON public.conteos_inventario FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = conteos_inventario.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conteos_inventario' AND policyname = 'ci_insert') THEN
    CREATE POLICY ci_insert ON public.conteos_inventario FOR INSERT
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = conteos_inventario.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conteos_inventario' AND policyname = 'ci_update') THEN
    CREATE POLICY ci_update ON public.conteos_inventario FOR UPDATE
      USING (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = conteos_inventario.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conteos_inventario_lineas' AND policyname = 'cil_select') THEN
    CREATE POLICY cil_select ON public.conteos_inventario_lineas FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = conteos_inventario_lineas.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conteos_inventario_lineas' AND policyname = 'cil_insert') THEN
    CREATE POLICY cil_insert ON public.conteos_inventario_lineas FOR INSERT
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = conteos_inventario_lineas.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conteos_inventario_lineas' AND policyname = 'cil_update') THEN
    CREATE POLICY cil_update ON public.conteos_inventario_lineas FOR UPDATE
      USING (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = conteos_inventario_lineas.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

END $$;

-- ── 5. RPC cerrar_conteo_inventario ──────────────────────────────────────────
-- Idempotente: si ya está cerrado devuelve {status: 'already_closed'}.
-- Llama aplicar_ajustes_stock_atomicos en modo 'establecer' para las líneas
-- contadas con diferencia ≠ 0.
-- Si tipo='inicial': fija control_stock_desde en restaurant_economic_settings.
CREATE OR REPLACE FUNCTION public.cerrar_conteo_inventario(p_conteo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conteo        record;
  v_ajustes       jsonb := '[]'::jsonb;
  v_resultado     jsonb;
  v_linea_vino_id uuid;
  v_linea_contado integer;
  v_linea_teorico integer;
  v_linea_motivo  text;
BEGIN
  -- ── Lock y verificación de estado ────────────────────────────────────────
  SELECT id, restaurante_id, tipo, estado
    INTO v_conteo
  FROM public.conteos_inventario
  WHERE id = p_conteo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conteo no encontrado: %', p_conteo_id;
  END IF;

  IF v_conteo.estado = 'cerrado' THEN
    RETURN jsonb_build_object('status', 'already_closed');
  END IF;

  -- ── Construir lote de ajustes (solo líneas contadas con diferencia ≠ 0) ──
  FOR v_linea_vino_id, v_linea_contado, v_linea_teorico, v_linea_motivo IN
    SELECT vino_id, stock_contado, stock_teorico, motivo
    FROM   public.conteos_inventario_lineas
    WHERE  conteo_id    = p_conteo_id
      AND  contado      = true
      AND  stock_contado IS NOT NULL
      AND  stock_contado <> stock_teorico
  LOOP
    v_ajustes := v_ajustes || jsonb_build_array(jsonb_build_object(
      'vino_id', v_linea_vino_id,
      'modo',    'establecer',
      'tipo',    'ajuste',
      'valor',   v_linea_contado,
      'motivo',  COALESCE(v_linea_motivo, 'Conteo de inventario'),
      'origen',  'manual'
    ));
  END LOOP;

  -- ── Aplicar ajustes si los hay ────────────────────────────────────────────
  -- Límite actual: 100 por lote. Con ~80 vinos activos es suficiente.
  IF jsonb_array_length(v_ajustes) > 0 THEN
    v_resultado := public.aplicar_ajustes_stock_atomicos(
      v_conteo.restaurante_id,
      v_ajustes
    );
  ELSE
    v_resultado := '[]'::jsonb;
  END IF;

  -- ── Conteo inicial: fijar control_stock_desde ─────────────────────────────
  IF v_conteo.tipo = 'inicial' THEN
    INSERT INTO public.restaurant_economic_settings (restaurante_id, control_stock_desde)
    VALUES (v_conteo.restaurante_id, (now() AT TIME ZONE 'Europe/Madrid')::date)
    ON CONFLICT (restaurante_id) DO UPDATE
      SET control_stock_desde = EXCLUDED.control_stock_desde;
  END IF;

  -- ── Marcar conteo como cerrado ────────────────────────────────────────────
  UPDATE public.conteos_inventario
  SET estado     = 'cerrado',
      cerrado_en = now()
  WHERE id = p_conteo_id;

  RETURN jsonb_build_object(
    'status',            'closed',
    'ajustes_aplicados', jsonb_array_length(v_ajustes),
    'movimientos',       v_resultado
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cerrar_conteo_inventario(uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_conteo_inventario(uuid)
  TO service_role;

COMMIT;
