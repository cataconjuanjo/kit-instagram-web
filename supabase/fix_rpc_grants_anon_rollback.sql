-- Rollback de fix_rpc_grants_anon.sql
-- Restaura el estado anterior (PUBLIC/anon con execute implícito).
-- ADVERTENCIA: vuelve al estado inseguro previo.

BEGIN;

-- 1. apply_payment_lines
REVOKE ALL ON FUNCTION public.apply_payment_lines(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_lines(uuid, text, jsonb)
  TO PUBLIC;

-- 2. merge_cierre_pasos
REVOKE ALL ON FUNCTION public.merge_cierre_pasos(uuid, date, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_cierre_pasos(uuid, date, jsonb)
  TO PUBLIC;

-- 3. propagar_cambios_catalogo_a_vinos
REVOKE ALL ON FUNCTION public.propagar_cambios_catalogo_a_vinos(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.propagar_cambios_catalogo_a_vinos(uuid, jsonb)
  TO PUBLIC;

-- 4. publicar_simulacion (uuid)
REVOKE ALL ON FUNCTION public.publicar_simulacion(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_simulacion(uuid)
  TO PUBLIC;

-- 5. publicar_simulacion (uuid, text)
REVOKE ALL ON FUNCTION public.publicar_simulacion(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_simulacion(uuid, text)
  TO PUBLIC;

-- 6. restaurar_snapshot
REVOKE ALL ON FUNCTION public.restaurar_snapshot(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_snapshot(uuid, uuid)
  TO PUBLIC;

-- 7. sustituir_vino_simulacion (12 params)
REVOKE ALL ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text, text, text, text, text, text, numeric, numeric, numeric
)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text, text, text, text, text, text, numeric, numeric, numeric
)
  TO PUBLIC;

-- 8. sustituir_vino_simulacion (14 params)
REVOKE ALL ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, numeric
)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, numeric
)
  TO PUBLIC;

-- 9. validar_limite_vinos_activos
REVOKE ALL ON FUNCTION public.validar_limite_vinos_activos()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_limite_vinos_activos()
  TO PUBLIC;

NOTIFY pgrst, 'reload schema';
COMMIT;
