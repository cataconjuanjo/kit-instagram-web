-- ─────────────────────────────────────────────────────────────────────────
-- Fase SOMM — relajar las 4 columnas de stock/compras de historico_mensual
-- ─────────────────────────────────────────────────────────────────────────
--
-- MOTIVO
--   Las columnas se añadieron como NOT NULL DEFAULT 0:
--     valor_stock_bodega, stock_inicial_valor, stock_final_valor, compras_total
--   Con esa definición, las filas creadas antes de poblarlas (p. ej. Casa
--   Marisma 2025) tienen 0 en los cuatro campos, lo que es indistinguible
--   de "hay dato y vale 0 €" (imposible en este dominio). El código ya
--   trata "los cuatro a 0 o NULL a la vez" como "Sin dato", pero la BD
--   debe poder expresar ese "Sin dato" de forma explícita (NULL) para
--   los nuevos registros.
--
-- CARACTERÍSTICAS DE ESTA MIGRACIÓN
--   - ADITIVA en semántica: ningún dato existente cambia de valor salvo
--     los 0→NULL en filas que los tengan los CUATRO en 0 simultáneamente.
--   - IDEMPOTENTE: re-ejecutable sin efectos (DROP NOT NULL / DROP
--     DEFAULT son no-ops si ya se aplicaron; el UPDATE 0→NULL filtra
--     filas que ya están NULL).
--   - NO toca RLS ni ninguna policy.
--   - NO toca ninguna otra columna, trigger ni índice.
--
-- COMPATIBILIDAD CON EL CÓDIGO
--   El reader (`app/lib/historicoExtras.js → leerExtrasHistorico`)
--   trata NULL y 0-en-los-cuatro como "Sin dato". El writer que
--   proviene del cierre (`/api/cierres-mes` → `historicoPayloadDesdeCierre`)
--   sigue enviando números concretos (no NULL), por lo que la inserción
--   del cierre no se ve afectada. El formulario de Explotación usa
--   `extrasHistoricoPayload`, que OMITE las claves vacías (no manda
--   NULL explícito), compatible con y sin NOT NULL.
--
-- BACKUP PREVIO (obligatorio; esquema privado `backup_privado`, nunca `public`):
--
--     CREATE SCHEMA IF NOT EXISTS backup_privado;
--     DROP TABLE IF EXISTS backup_privado.historico_mensual_pre_relax;
--     CREATE TABLE backup_privado.historico_mensual_pre_relax AS
--       SELECT * FROM public.historico_mensual;
--     -- Comprueba que ha copiado todas las filas:
--     SELECT count(*) FROM public.historico_mensual;
--     SELECT count(*) FROM backup_privado.historico_mensual_pre_relax;
--
-- COMPROBACIÓN PREVIA (NOT NULL = YES, default = 0 en las 4):
--     SELECT column_name, is_nullable, column_default
--       FROM information_schema.columns
--      WHERE table_schema = 'public'
--        AND table_name   = 'historico_mensual'
--        AND column_name IN ('valor_stock_bodega',
--                            'stock_inicial_valor',
--                            'stock_final_valor',
--                            'compras_total');
--
-- COMPROBACIÓN POSTERIOR (NOT NULL = YES → NO, default = 0 → sin default):
--     -- Mismo SELECT; debe mostrar is_nullable=YES y column_default NULL.
--
--     SELECT restaurante_id, anio, mes
--       FROM public.historico_mensual
--      WHERE valor_stock_bodega IS NULL
--        AND stock_inicial_valor IS NULL
--        AND stock_final_valor  IS NULL
--        AND compras_total      IS NULL;
--     -- Esperado: las filas antes "0 en los cuatro" ahora están a NULL.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.historico_mensual
  ALTER COLUMN valor_stock_bodega  DROP NOT NULL,
  ALTER COLUMN valor_stock_bodega  DROP DEFAULT,
  ALTER COLUMN stock_inicial_valor DROP NOT NULL,
  ALTER COLUMN stock_inicial_valor DROP DEFAULT,
  ALTER COLUMN stock_final_valor   DROP NOT NULL,
  ALTER COLUMN stock_final_valor   DROP DEFAULT,
  ALTER COLUMN compras_total       DROP NOT NULL,
  ALTER COLUMN compras_total       DROP DEFAULT;

-- Rellena con NULL las filas en las que los 4 están a 0 (= "Sin dato"
-- registrado por el default). Idempotente: si los 4 ya están a NULL,
-- la fila no entra en el filtro y no se actualiza.
UPDATE public.historico_mensual
   SET valor_stock_bodega  = NULL,
       stock_inicial_valor = NULL,
       stock_final_valor   = NULL,
       compras_total       = NULL
 WHERE COALESCE(valor_stock_bodega,  0) = 0
   AND COALESCE(stock_inicial_valor, 0) = 0
   AND COALESCE(stock_final_valor,   0) = 0
   AND COALESCE(compras_total,       0) = 0;
