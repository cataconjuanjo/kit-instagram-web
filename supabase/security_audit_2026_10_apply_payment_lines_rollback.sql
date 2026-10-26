-- =============================================================================
-- security_audit_2026_10_apply_payment_lines_rollback.sql
-- Rollback de security_audit_2026_10_apply_payment_lines.sql
-- Restaura EXECUTE a PUBLIC para las 8 funciones.
-- =============================================================================

BEGIN;

-- ── 1. apply_payment_lines ────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.apply_payment_lines(uuid, text, jsonb)
  FROM service_role;
GRANT EXECUTE ON FUNCTION public.apply_payment_lines(uuid, text, jsonb)
  TO PUBLIC;

-- ── 2. propagar_cambios_catalogo_a_vinos ──────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.propagar_cambios_catalogo_a_vinos(uuid, jsonb)
  FROM service_role;
GRANT EXECUTE ON FUNCTION public.propagar_cambios_catalogo_a_vinos(uuid, jsonb)
  TO PUBLIC;

-- ── 3. publicar_simulacion (uuid) ─────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.publicar_simulacion(uuid)
  FROM service_role;
GRANT EXECUTE ON FUNCTION public.publicar_simulacion(uuid)
  TO PUBLIC;

-- ── 4. publicar_simulacion (uuid, text) ──────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.publicar_simulacion(uuid, text)
  FROM service_role;
GRANT EXECUTE ON FUNCTION public.publicar_simulacion(uuid, text)
  TO PUBLIC;

-- ── 5. restaurar_snapshot ─────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.restaurar_snapshot(uuid, uuid)
  FROM service_role;
GRANT EXECUTE ON FUNCTION public.restaurar_snapshot(uuid, uuid)
  TO PUBLIC;

-- ── 6. sustituir_vino_simulacion (12 params) ──────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text, text, text, text, text, text, numeric, numeric, numeric
)
  FROM service_role;
GRANT EXECUTE ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text, text, text, text, text, text, numeric, numeric, numeric
)
  TO PUBLIC;

-- ── 7. validar_limite_vinos_activos ──────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.validar_limite_vinos_activos()
  TO PUBLIC;

-- ── 8. registrar_pulso_uso ────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.registrar_pulso_uso(uuid, boolean)
  FROM service_role;
GRANT EXECUTE ON FUNCTION public.registrar_pulso_uso(uuid, boolean)
  TO PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;
