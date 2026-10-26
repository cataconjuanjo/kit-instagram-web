-- =============================================================================
-- security_audit_2026_10_apply_payment_lines.sql
-- Auditoría de seguridad – octubre 2026
-- Objetivo: revocar EXECUTE a PUBLIC/anon/authenticated en funciones SECURITY
--   DEFINER que solo son llamadas desde servidor (supabaseAdmin / service_role).
--
-- ¿Qué hace apply_payment_lines?
--   Recibe un pago de Square (tienda_id, payment_id, líneas) y descuenta stock
--   en vinos_tienda usando SELECT FOR UPDATE con bloqueo ordenado por id (evita
--   deadlock), marca cada línea procesada en payment_lines_applied (idempotencia),
--   y devuelve JSONB con el resultado por línea.
--
-- ¿Por qué es crítica?
--   Un atacante anónimo puede llamar a POST /rest/v1/rpc/apply_payment_lines con
--   cualquier tienda_id y lines arbitrarios → lleva todo el stock a 0 (ataque
--   stockout). El REVOKE original de apply_payment_lines_rpc.sql es incompleto:
--   no usa el schema public., ni revoca explícitamente anon/authenticated.
--
-- Funciones cubiertas (las que NO están en security_audit_2026_10_rls_hardening.sql):
--   1. apply_payment_lines(uuid, text, jsonb)
--   2. propagar_cambios_catalogo_a_vinos(uuid, jsonb)
--   3. publicar_simulacion(uuid)                  — firma antigua
--   4. publicar_simulacion(uuid, text)            — firma actual
--   5. restaurar_snapshot(uuid, uuid)
--   6. sustituir_vino_simulacion(12 params)       — firma antigua (la de 14 params
--                                                    está en rls_hardening.sql)
--   7. validar_limite_vinos_activos()             — trigger function, solo REVOKE
--   8. registrar_pulso_uso(uuid, boolean)
--
-- NO aplicar en producción directamente.
-- Ejecutar solo desde el dashboard de Supabase (SQL Editor) o con supabase db push.
-- =============================================================================

BEGIN;

-- ── 1. apply_payment_lines ────────────────────────────────────────────────────
-- Llamador único: app/api/_lib/squareSync.js → supabaseAdmin (server only)
-- SET search_path ya está en la definición original; no se reescribe el cuerpo.
REVOKE ALL ON FUNCTION public.apply_payment_lines(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_lines(uuid, text, jsonb)
  TO service_role;

-- ── 2. propagar_cambios_catalogo_a_vinos ──────────────────────────────────────
-- Llamador: app/api/admin/proveedores/route.js → adminClient() (service_role)
REVOKE ALL ON FUNCTION public.propagar_cambios_catalogo_a_vinos(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.propagar_cambios_catalogo_a_vinos(uuid, jsonb)
  TO service_role;

-- ── 3. publicar_simulacion — firma original (uuid) ────────────────────────────
-- Llamador: app/api/simulador/publicar/route.js → supabaseAdmin (server only)
REVOKE ALL ON FUNCTION public.publicar_simulacion(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_simulacion(uuid)
  TO service_role;

-- ── 4. publicar_simulacion — firma actual (uuid, text) ────────────────────────
REVOKE ALL ON FUNCTION public.publicar_simulacion(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_simulacion(uuid, text)
  TO service_role;

-- ── 5. restaurar_snapshot ─────────────────────────────────────────────────────
-- Llamador: app/api/simulador/historial/restaurar/route.js → supabaseAdmin
REVOKE ALL ON FUNCTION public.restaurar_snapshot(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_snapshot(uuid, uuid)
  TO service_role;

-- ── 6. sustituir_vino_simulacion — firma antigua (12 params) ──────────────────
-- La firma actual de 14 params está cubierta en rls_hardening.sql (bloque A3).
-- Llamador: app/api/simulador/sustituir/route.js → supabaseAdmin (server only)
REVOKE ALL ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text, text, text, text, text, text, numeric, numeric, numeric
)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sustituir_vino_simulacion(
  uuid, uuid, uuid, text, text, text, text, text, text, numeric, numeric, numeric
)
  TO service_role;

-- ── 7. validar_limite_vinos_activos ──────────────────────────────────────────
-- Trigger function (BEFORE INSERT OR UPDATE en vinos). No es callable por RPC.
-- Solo REVOKE por higiene; sin GRANT porque el trigger se ejecuta como el owner.
REVOKE ALL ON FUNCTION public.validar_limite_vinos_activos()
  FROM PUBLIC, anon, authenticated;

-- ── 8. registrar_pulso_uso ────────────────────────────────────────────────────
-- El REVOKE en add_sesiones_uso.sql omitió anon/authenticated y el GRANT
-- a service_role. Si la función ya no tiene llamadores client-side, REVOKE.
-- Llamador conocido: server-side heartbeat o sin llamador activo.
REVOKE ALL ON FUNCTION public.registrar_pulso_uso(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pulso_uso(uuid, boolean)
  TO service_role;

-- Forzar recarga del schema cache de PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
