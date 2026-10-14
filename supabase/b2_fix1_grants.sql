-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B2 fix1 · GRANT de registrar_compra_con_pmp → solo service_role        ║
-- ║                                                                          ║
-- ║  Contexto: b2_compras_pmp.sql concedió execute a service_role y         ║
-- ║  authenticated. La función siempre se llama desde supabaseAdmin          ║
-- ║  (service_role) en /api/compras/route.js, que ya valida la sesión        ║
-- ║  con requireRestaurantAccess. Conceder a authenticated es superfluo      ║
-- ║  y expondría la RPC (SECURITY DEFINER) al cliente directo.              ║
-- ║                                                                          ║
-- ║  Rollback: b2_fix1_grants_rollback.sql                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

REVOKE ALL ON FUNCTION public.registrar_compra_con_pmp(uuid, jsonb, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_compra_con_pmp(uuid, jsonb, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
