-- Rollback de b4_fix2_botella_id_mov.sql
-- Restaura gestionar_botella_copa sin botella_abierta_id y elimina la columna.

BEGIN;

-- ── 1. Restaurar gestionar_botella_copa sin botella_abierta_id ────────────────
CREATE OR REPLACE FUNCTION public.gestionar_botella_copa(
  p_restaurante_id UUID,
  p_vino_id        UUID,
  p_accion         TEXT,
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

  UPDATE public.botellas_abiertas
     SET estado          = 'cerrada_manual',
         cerrada_at      = now(),
         copas_restantes = 0,
         motivo_cierre   = p_motivo
   WHERE id = v_botella_id;

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

-- ── 2. Eliminar índice y columna ──────────────────────────────────────────────
DROP INDEX IF EXISTS public.movimientos_stock_botella_abierta_idx;

ALTER TABLE public.movimientos_stock
  DROP COLUMN IF EXISTS botella_abierta_id;

NOTIFY pgrst, 'reload schema';
COMMIT;
