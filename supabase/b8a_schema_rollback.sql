-- Rollback de b8a_schema.sql (versión generalizada)
-- ADVERTENCIA: elimina tpv_vino_map, tpv_lineas_sin_asignar y columnas B8a.
-- El rename de tabla (square_vino_map → tpv_vino_map) es unidireccional;
-- este rollback elimina la tabla con su nombre actual.

BEGIN;

DROP TABLE IF EXISTS public.tpv_lineas_sin_asignar;
DROP TABLE IF EXISTS public.tpv_vino_map;
DROP TABLE IF EXISTS public.square_vino_map;  -- cubre instalaciones pre-rename

ALTER TABLE public.movimientos_stock
  DROP COLUMN IF EXISTS movimiento_origen_id,
  DROP COLUMN IF EXISTS es_reverso,
  DROP COLUMN IF EXISTS afecto_stock,
  DROP COLUMN IF EXISTS importe_neto,
  DROP COLUMN IF EXISTS descuento_unitario,
  DROP COLUMN IF EXISTS precio_unitario_bruto,
  DROP COLUMN IF EXISTS fecha_movimiento,
  DROP COLUMN IF EXISTS referencia_externa;

DROP INDEX IF EXISTS public.movimientos_stock_referencia_externa_idx;

DROP INDEX IF EXISTS public.restaurant_economic_settings_tpv_local_idx;
DROP INDEX IF EXISTS public.restaurant_economic_settings_square_location_idx;  -- versión anterior

ALTER TABLE public.restaurant_economic_settings
  DROP COLUMN IF EXISTS tpv_local_id,
  DROP COLUMN IF EXISTS tpv_fuente,
  DROP COLUMN IF EXISTS tpv_movimientos_activo;

NOTIFY pgrst, 'reload schema';
COMMIT;
