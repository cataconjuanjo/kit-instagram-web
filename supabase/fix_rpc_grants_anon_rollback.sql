-- Rollback de fix_rpc_grants_anon.sql
-- Restaura el estado anterior (anon/authenticated con execute).
-- ADVERTENCIA: este rollback vuelve al estado inseguro previo.
-- Usarlo solo si algo se rompe en producción tras aplicar fix_rpc_grants_anon.sql.

BEGIN;

-- 1. apply_payment_lines
REVOKE ALL ON FUNCTION public.apply_payment_lines(uuid, text, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_lines(uuid, text, jsonb)
  TO PUBLIC;

-- 2. merge_cierre_pasos
REVOKE ALL ON FUNCTION public.merge_cierre_pasos(uuid, date, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_cierre_pasos(uuid, date, jsonb)
  TO PUBLIC;

-- 3. propagar_cambios_catalogo_a_vinos
REVOKE ALL ON FUNCTION public.propagar_cambios_catalogo_a_vinos(uuid, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.propagar_cambios_catalogo_a_vinos(uuid, jsonb)
  TO PUBLIC;

-- 4a. publicar_simulacion (uuid)
REVOKE ALL ON FUNCTION public.publicar_simulacion(uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_simulacion(uuid)
  TO PUBLIC;

-- 4b. publicar_simulacion (uuid, text)
REVOKE ALL ON FUNCTION public.publicar_simulacion(uuid, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_simulacion(uuid, text)
  TO PUBLIC;

-- 5. restaurar_snapshot
REVOKE ALL ON FUNCTION public.restaurar_snapshot(uuid, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_snapshot(uuid, uuid)
  TO PUBLIC;

-- 6. sustituir_vino_simulacion (14 params)
REVOKE ALL ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text,
  text, text, text, text, text,
  numeric, numeric, numeric,
  numeric, numeric
)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text,
  text, text, text, text, text,
  numeric, numeric, numeric,
  numeric, numeric
)
  TO PUBLIC;

-- 6b. sustituir_vino_simulacion (12 params) — si existe en pg_proc:
-- GRANT EXECUTE ON FUNCTION public.sustituir_vino_simulacion(
--   uuid, uuid, uuid, text,
--   text, text, text, text, text,
--   numeric, numeric, numeric
-- ) TO PUBLIC;

-- 7. validar_limite_vinos_activos (trigger — no necesita GRANT a PUBLIC,
--    pero restauramos para consistencia)
GRANT EXECUTE ON FUNCTION public.validar_limite_vinos_activos()
  TO PUBLIC;

NOTIFY pgrst, 'reload schema';
COMMIT;
