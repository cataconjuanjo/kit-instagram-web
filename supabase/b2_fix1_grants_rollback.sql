-- Rollback de b2_fix1_grants.sql
-- Restaura el estado previo (b2_compras_pmp.sql): service_role + authenticated.

BEGIN;

REVOKE ALL ON FUNCTION public.registrar_compra_con_pmp(uuid, jsonb, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_compra_con_pmp(uuid, jsonb, jsonb)
  TO service_role, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
