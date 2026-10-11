-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B1 · TESTS SEGUROS PARA PRODUCCIÓN                                     ║
-- ║                                                                          ║
-- ║  Solo SELECT y RAISE NOTICE. Sin INSERT, UPDATE ni DDL.                  ║
-- ║  Se puede ejecutar en producción después del backfill.                   ║
-- ║                                                                          ║
-- ║  Resultado esperado: solo líneas "PASS" en pestaña "Messages".           ║
-- ║  Si hay un "FAIL", la transacción aborta con el motivo.                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── T09-PROD: 0 filas con tipos legacy ───────────────────────────────────────
DO $$
DECLARE v_legacy integer;
BEGIN
  SELECT COUNT(*) INTO v_legacy
  FROM public.movimientos_stock
  WHERE tipo IN ('entrada','venta','merma','invitacion');

  IF v_legacy > 0 THEN
    RAISE EXCEPTION 'T09-PROD FAIL: % filas con tipos legacy. Backfill incompleto.', v_legacy;
  END IF;
  RAISE NOTICE 'T09-PROD PASS: 0 filas legacy. Backfill completo.';
END $$;

-- ── T10-PROD: todas las filas tienen tipo canónico ───────────────────────────
DO $$
DECLARE
  v_total  integer;
  v_canon  integer;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.movimientos_stock;
  SELECT COUNT(*) INTO v_canon
  FROM public.movimientos_stock
  WHERE tipo IN (
    'compra','devolucion','venta_botella','venta_copa',
    'invitacion_botella','invitacion_copa',
    'cocina','grupo_evento','maridaje','rotura','cata','ajuste'
  );

  IF v_total <> v_canon THEN
    RAISE EXCEPTION 'T10-PROD FAIL: % filas en total, % con tipo canónico (diferencia: %)',
      v_total, v_canon, v_total - v_canon;
  END IF;
  RAISE NOTICE 'T10-PROD PASS: % filas, todas con tipo canónico.', v_total;
END $$;

-- ── Recuento por tipo (para inspección manual) ────────────────────────────────
SELECT
  tipo,
  COUNT(*)                              AS filas,
  SUM(ABS(cantidad))                    AS uds_absolutas,
  SUM(cantidad)                         AS delta_stock,
  MIN(created_at)::date                 AS primer_mov,
  MAX(created_at)::date                 AS ultimo_mov,
  COUNT(DISTINCT restaurante_id)        AS restaurantes
FROM public.movimientos_stock
GROUP BY tipo
ORDER BY tipo;
