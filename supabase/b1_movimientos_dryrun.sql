-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B1 · DRY-RUN — Ejecutar en rama/copia de test ANTES de producción      ║
-- ║                                                                          ║
-- ║  Este script NO modifica datos. Solo consulta y reporta.                 ║
-- ║  Pegar en Supabase SQL Editor → Ver los RAISE NOTICE en la pestaña      ║
-- ║  "Messages" y los SELECT en "Results".                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. ESTADO ACTUAL DE movimientos_stock (snapshot antes del expand)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT
  tipo,
  COUNT(*)                        AS filas,
  SUM(ABS(cantidad))              AS uds_absolutas,
  SUM(cantidad)                   AS delta_stock_acumulado,
  MIN(created_at)::date           AS primer_movimiento,
  MAX(created_at)::date           AS ultimo_movimiento,
  COUNT(DISTINCT restaurante_id)  AS restaurantes
FROM public.movimientos_stock
GROUP BY tipo
ORDER BY tipo;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. TIPOS LEGACY QUE SERÁN RENOMBRADOS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT
  tipo                  AS tipo_actual,
  CASE tipo
    WHEN 'entrada'    THEN 'compra'
    WHEN 'venta'      THEN 'venta_botella'
    WHEN 'merma'      THEN 'rotura'
    WHEN 'invitacion' THEN 'invitacion_botella'
  END                   AS tipo_despues,
  COUNT(*)              AS filas_afectadas,
  SUM(ABS(cantidad))    AS uds_afectadas
FROM public.movimientos_stock
WHERE tipo IN ('entrada','venta','merma','invitacion')
GROUP BY tipo
ORDER BY tipo;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. TIPOS QUE NO SE TOCAN (ya son canónicos o neutros)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT
  tipo,
  COUNT(*)    AS filas,
  'sin cambio' AS accion
FROM public.movimientos_stock
WHERE tipo IN ('ajuste','cata','cocina','grupo_evento','maridaje','rotura')
GROUP BY tipo
ORDER BY tipo;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. STOCK ACTUAL POR VINO (para verificar integridad post-backfill)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT
  v.restaurante_id,
  v.id AS vino_id,
  v.nombre,
  v.stock,
  v.coste_compra,
  v.coste_medio_pmp   -- será NULL antes del expand; NULL es correcto
FROM public.vinos v
WHERE v.activo = TRUE
ORDER BY v.restaurante_id, v.nombre;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. ESTADO DE restaurant_economic_settings (antes del expand)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT
  res.restaurante_id,
  r.nombre                                            AS restaurante,
  res.fuente_ventas,                                  -- NULL antes del expand
  res.control_stock_desde,                            -- NULL antes del expand
  (SELECT COUNT(*) FROM public.pos_import_batches b
   WHERE b.restaurante_id = res.restaurante_id
     AND b.estado = 'importado'
     AND b.created_at > NOW() - INTERVAL '60 days')  AS imports_ultimos_60d,
  CASE
    WHEN (SELECT COUNT(*) FROM public.pos_import_batches b2
          WHERE b2.restaurante_id = res.restaurante_id
            AND b2.estado = 'importado'
            AND b2.created_at > NOW() - INTERVAL '60 days') > 0
    THEN 'tpv'
    ELSE 'parte'
  END                                                 AS fuente_ventas_derivada
FROM public.restaurant_economic_settings res
JOIN public.restaurantes r ON r.id = res.restaurante_id
ORDER BY r.nombre;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. RESTAURANTES SIN FILA EN restaurant_economic_settings
--    (estos necesitarán INSERT en la migración 2 contract)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT
  r.id,
  r.nombre,
  r.email
FROM public.restaurantes r
WHERE NOT EXISTS (
  SELECT 1 FROM public.restaurant_economic_settings res
  WHERE res.restaurante_id = r.id
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. CHECK ACTUAL DEL CONSTRAINT (verificar estado previo)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT
  conname   AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.movimientos_stock'::regclass
  AND conname LIKE '%tipo%';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. COLUMNAS ACTUALES DE movimientos_stock Y vinos (verificar idempotencia)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'movimientos_stock'
ORDER BY ordinal_position;

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('vinos','restaurant_economic_settings')
  AND column_name IN (
    'coste_medio_pmp',
    'fuente_ventas','fuente_ventas_desde','ml_por_copa',
    'gastos_mensuales','control_stock_desde'
  )
ORDER BY table_name, column_name;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 9. TEST DE IDEMPOTENCIA — simula ejecutar el backfill dos veces
--    Los UPDATE deben afectar 0 filas en la segunda ejecución.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
DECLARE
  v_legacy_count INTEGER;
BEGIN
  -- Tras aplicar el expand, no debe haber ningún tipo legacy
  SELECT COUNT(*) INTO v_legacy_count
  FROM public.movimientos_stock
  WHERE tipo IN ('entrada','venta','merma','invitacion');

  IF v_legacy_count > 0 THEN
    RAISE NOTICE 'IDEMPOTENCIA: quedan % filas legacy — migración pendiente o parcial', v_legacy_count;
  ELSE
    RAISE NOTICE 'IDEMPOTENCIA OK: cero filas legacy. El backfill es seguro de re-ejecutar.';
  END IF;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 10. INVARIANTE D1 — preview de conflictos potenciales
--     (movimientos con tipo venta + origen tpv en restaurantes modo 'parte')
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT
  ms.restaurante_id,
  r.nombre                  AS restaurante,
  res.fuente_ventas,
  ms.tipo,
  ms.origen,
  COUNT(*)                  AS conflictos
FROM public.movimientos_stock ms
JOIN public.restaurantes r ON r.id = ms.restaurante_id
LEFT JOIN public.restaurant_economic_settings res ON res.restaurante_id = ms.restaurante_id
WHERE ms.tipo IN ('venta_botella','venta_copa')
  AND ms.origen IN ('tpv','parte')
  AND (
    (res.fuente_ventas = 'tpv'   AND ms.origen <> 'tpv')  OR
    (res.fuente_ventas = 'parte' AND ms.origen <> 'parte')
  )
GROUP BY ms.restaurante_id, r.nombre, res.fuente_ventas, ms.tipo, ms.origen;
-- Resultado esperado: 0 filas. Si hay filas → revisar antes de contract.
