-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  fix_rpc_grants_anon · Revocar anon/authenticated de RPCs SECURITY      ║
-- ║  DEFINER que nunca deben ser accesibles desde el cliente                 ║
-- ║                                                                          ║
-- ║  Evidencia grep: todas las funciones se invocan exclusivamente desde     ║
-- ║  supabaseAdmin (service_role) o adminClient() (serviceRoleKey) en rutas  ║
-- ║  Next.js API. Ninguna aparece en componentes 'use client'. Todas las     ║
-- ║  rutas llaman a requireRestaurantAccess o validarAdmin antes de la RPC.  ║
-- ║  Ninguna función valida auth.uid() / auth.jwt() internamente.            ║
-- ║                                                                          ║
-- ║  Firmas exactas obtenidas de pg_proc (regprocedure).                    ║
-- ║                                                                          ║
-- ║  Rollback: fix_rpc_grants_anon_rollback.sql                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ── 1. apply_payment_lines ────────────────────────────────────────────────────
-- Caller: app/api/_lib/squareSync.js:1961 → supabaseAdmin
REVOKE ALL ON FUNCTION public.apply_payment_lines(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_lines(uuid, text, jsonb)
  TO service_role;

-- ── 2. merge_cierre_pasos ─────────────────────────────────────────────────────
-- Caller: app/api/cierres-servicio/route.js:97 → supabaseAdmin
REVOKE ALL ON FUNCTION public.merge_cierre_pasos(uuid, date, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_cierre_pasos(uuid, date, jsonb)
  TO service_role;

-- ── 3. propagar_cambios_catalogo_a_vinos ──────────────────────────────────────
-- Caller: app/api/admin/proveedores/route.js:63 → adminClient() (serviceRoleKey)
REVOKE ALL ON FUNCTION public.propagar_cambios_catalogo_a_vinos(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.propagar_cambios_catalogo_a_vinos(uuid, jsonb)
  TO service_role;

-- ── 4. publicar_simulacion — firma original (uuid) ────────────────────────────
-- Caller: app/api/simulador/publicar/route.js:35 → supabaseAdmin
-- Supersedida por (uuid,text); sigue en pg_proc — se cierra por higiene.
REVOKE ALL ON FUNCTION public.publicar_simulacion(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_simulacion(uuid)
  TO service_role;

-- ── 5. publicar_simulacion — firma actual (uuid, text) ────────────────────────
REVOKE ALL ON FUNCTION public.publicar_simulacion(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_simulacion(uuid, text)
  TO service_role;

-- ── 6. restaurar_snapshot ─────────────────────────────────────────────────────
-- Caller: app/api/simulador/historial/restaurar/route.js:36 → supabaseAdmin
REVOKE ALL ON FUNCTION public.restaurar_snapshot(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_snapshot(uuid, uuid)
  TO service_role;

-- ── 7. sustituir_vino_simulacion — firma antigua (12 params) ──────────────────
-- Caller: app/api/simulador/sustituir/route.js:99 → supabaseAdmin
REVOKE ALL ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text, text, text, text, text, text, numeric, numeric, numeric
)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text, text, text, text, text, text, numeric, numeric, numeric
)
  TO service_role;

-- ── 8. sustituir_vino_simulacion — firma actual (14 params) ───────────────────
REVOKE ALL ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, numeric
)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, numeric
)
  TO service_role;

-- ── 9. validar_limite_vinos_activos ──────────────────────────────────────────
-- TRIGGER FUNCTION — BEFORE INSERT OR UPDATE en vinos.
-- No se puede llamar por RPC. Solo REVOKE por higiene; sin GRANT.
REVOKE ALL ON FUNCTION public.validar_limite_vinos_activos()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
