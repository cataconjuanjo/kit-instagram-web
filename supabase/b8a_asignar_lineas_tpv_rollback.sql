-- Rollback de b8a_asignar_lineas_tpv.sql

BEGIN;

-- Eliminar todas las firmas conocidas (v1: 5, v2: 6, v3: 7).
DROP FUNCTION IF EXISTS public.asignar_lineas_tpv(uuid, text, text, uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.asignar_lineas_tpv(uuid, text, uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.asignar_lineas_tpv(uuid, text, uuid, text, text);

NOTIFY pgrst, 'reload schema';
COMMIT;
