-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  fix_rpc_grants_anon · Revocar anon/authenticated de RPCs SECURITY      ║
-- ║  DEFINER que nunca deben ser accesibles desde el cliente                 ║
-- ║                                                                          ║
-- ║  Contexto: auditoría de pg_proc reveló anon=true en las siguientes      ║
-- ║  funciones. Todas se invocan exclusivamente desde supabaseAdmin          ║
-- ║  (service_role) a través de rutas Next.js API que ya validan la         ║
-- ║  sesión del usuario antes de llamar a la RPC.                            ║
-- ║  Ninguna valida auth.uid() / auth.jwt() internamente.                   ║
-- ║                                                                          ║
-- ║  Estado actual en prod (por qué anon=true):                             ║
-- ║  · merge_cierre_pasos: sin ningún REVOKE ni GRANT → PUBLIC tiene        ║
-- ║    execute por defecto en PostgreSQL.                                    ║
-- ║  · Resto: sus SQL originales hicieron REVOKE FROM PUBLIC pero no        ║
-- ║    GRANT TO service_role explícito; o el REVOKE no se aplicó en prod.   ║
-- ║                                                                          ║
-- ║  Rollback: fix_rpc_grants_anon_rollback.sql                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ── 1. apply_payment_lines ────────────────────────────────────────────────────
-- Square/kiosko: recibe p_tienda_id (no restaurante_id). Sin validación JWT.
-- Caller: app/api/_lib/squareSync.js → supabaseAdmin.
REVOKE ALL ON FUNCTION public.apply_payment_lines(uuid, text, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_lines(uuid, text, jsonb)
  TO service_role;

-- ── 2. merge_cierre_pasos ─────────────────────────────────────────────────────
-- Sin REVOKE/GRANT en el fichero original → PUBLIC tenía execute.
-- Caller: app/api/cierres-servicio/route.js → supabaseAdmin.
REVOKE ALL ON FUNCTION public.merge_cierre_pasos(uuid, date, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_cierre_pasos(uuid, date, jsonb)
  TO service_role;

-- ── 3. propagar_cambios_catalogo_a_vinos ──────────────────────────────────────
-- SQL original ya comentaba "Debe invocarse solo desde la service_role".
-- Caller: app/api/admin/proveedores/route.js → adminClient() (serviceRoleKey).
REVOKE ALL ON FUNCTION public.propagar_cambios_catalogo_a_vinos(uuid, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.propagar_cambios_catalogo_a_vinos(uuid, jsonb)
  TO service_role;

-- ── 4a. publicar_simulacion — firma original (uuid) ──────────────────────────
-- Supersedida por la firma (uuid, text) en add_carta_historial.sql.
-- Se mantiene en pg_proc; se cierra por higiene.
-- Caller: app/api/simulador/publicar/route.js → supabaseAdmin.
REVOKE ALL ON FUNCTION public.publicar_simulacion(uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_simulacion(uuid)
  TO service_role;

-- ── 4b. publicar_simulacion — firma actual (uuid, text) ──────────────────────
REVOKE ALL ON FUNCTION public.publicar_simulacion(uuid, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_simulacion(uuid, text)
  TO service_role;

-- ── 5. restaurar_snapshot ─────────────────────────────────────────────────────
-- Caller: app/api/simulador/historial/restaurar/route.js → supabaseAdmin.
REVOKE ALL ON FUNCTION public.restaurar_snapshot(uuid, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_snapshot(uuid, uuid)
  TO service_role;

-- ── 6. sustituir_vino_simulacion — firma actual (14 params) ──────────────────
-- Caller: app/api/simulador/sustituir/route.js → supabaseAdmin.
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
  TO service_role;

-- ── 6b. sustituir_vino_simulacion — firma antigua (12 params, sin los 2
--    últimos numeric: p_pvp_recomendado_catalogo, p_pvp_copa_catalogo) ─────────
-- TODO: confirmar la firma exacta con:
--   SELECT pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'sustituir_vino_simulacion';
-- Si existe, ejecutar:
--   REVOKE ALL ON FUNCTION public.sustituir_vino_simulacion(
--     uuid, uuid, uuid, text,
--     text, text, text, text, text,
--     numeric, numeric, numeric
--   ) FROM public, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.sustituir_vino_simulacion(
--     uuid, uuid, uuid, text,
--     text, text, text, text, text,
--     numeric, numeric, numeric
--   ) TO service_role;

-- ── 7. validar_limite_vinos_activos ──────────────────────────────────────────
-- TRIGGER FUNCTION (RETURNS trigger) — BEFORE INSERT OR UPDATE en vinos.
-- No puede invocarse por RPC (el engine devuelve error inmediato).
-- El anon=true en pg_proc es inofensivo pero se limpia por higiene.
-- No necesita GRANT: el trigger engine no requiere permiso de execute explícito.
REVOKE ALL ON FUNCTION public.validar_limite_vinos_activos()
  FROM public, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
