-- ─────────────────────────────────────────────────────────────────────────
-- Fase SOMM — rollback: volver NOT NULL DEFAULT 0 en las 4 columnas
-- ─────────────────────────────────────────────────────────────────────────
--
-- EFECTO EN EL CÓDIGO
--   El reader `leerExtrasHistorico` sigue funcionando: la regla
--   "los 4 valores a NULL o 0 ≡ Sin dato" cubre los dos mundos.
--   Se pierde la capacidad de distinguir NULL de 0 en la BD, pero
--   la UI no diferencia (ambos se renderizan como "Sin dato").
--
-- BACKUP PREVIO (obligatorio; esquema privado):
--
--     CREATE SCHEMA IF NOT EXISTS backup_privado;
--     DROP TABLE IF EXISTS backup_privado.historico_mensual_pre_rollback_relax;
--     CREATE TABLE backup_privado.historico_mensual_pre_rollback_relax AS
--       SELECT * FROM public.historico_mensual;
--     -- Verifica el recuento:
--     SELECT count(*) FROM public.historico_mensual;
--     SELECT count(*) FROM backup_privado.historico_mensual_pre_rollback_relax;
--
-- COMPROBACIÓN PREVIA (debe existir backup_privado.historico_mensual_pre_relax
-- con el mismo número de filas que la tabla original en el momento del UP):
--     SELECT count(*) FROM backup_privado.historico_mensual_pre_relax;
--
-- ORDEN DE EJECUCIÓN
--   1. Rellenar los NULL con 0 (obligatorio ANTES de volver a NOT NULL).
--   2. Restaurar DEFAULT 0 y NOT NULL.
--
-- COMPROBACIÓN POSTERIOR
--     SELECT column_name, is_nullable, column_default
--       FROM information_schema.columns
--      WHERE table_schema = 'public'
--        AND table_name   = 'historico_mensual'
--        AND column_name IN ('valor_stock_bodega',
--                            'stock_inicial_valor',
--                            'stock_final_valor',
--                            'compras_total');
--     -- Esperado: is_nullable=NO, column_default=0 en las 4.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Rellenar NULL → 0 para que el posterior SET NOT NULL no falle.
UPDATE public.historico_mensual
   SET valor_stock_bodega  = COALESCE(valor_stock_bodega,  0),
       stock_inicial_valor = COALESCE(stock_inicial_valor, 0),
       stock_final_valor   = COALESCE(stock_final_valor,   0),
       compras_total       = COALESCE(compras_total,       0);

-- 2) Restaurar defaults y NOT NULL.
ALTER TABLE public.historico_mensual
  ALTER COLUMN valor_stock_bodega  SET DEFAULT 0,
  ALTER COLUMN valor_stock_bodega  SET NOT NULL,
  ALTER COLUMN stock_inicial_valor SET DEFAULT 0,
  ALTER COLUMN stock_inicial_valor SET NOT NULL,
  ALTER COLUMN stock_final_valor   SET DEFAULT 0,
  ALTER COLUMN stock_final_valor   SET NOT NULL,
  ALTER COLUMN compras_total       SET DEFAULT 0,
  ALTER COLUMN compras_total       SET NOT NULL;
