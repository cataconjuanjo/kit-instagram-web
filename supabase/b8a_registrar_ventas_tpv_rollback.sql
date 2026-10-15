-- Rollback de b8a_registrar_ventas_tpv.sql

BEGIN;

DROP FUNCTION IF EXISTS public.registrar_ventas_tpv(uuid, text, timestamptz, jsonb, text);
DROP FUNCTION IF EXISTS public.registrar_ventas_tpv(uuid, text, timestamptz, jsonb);

NOTIFY pgrst, 'reload schema';
COMMIT;
