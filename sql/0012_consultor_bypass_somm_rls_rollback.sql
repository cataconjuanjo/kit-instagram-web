-- Rollback de 0012_consultor_bypass_somm_rls.sql
-- Elimina las policies admin_* de configuracion_pricing y
-- tramos_multiplicador, y la función es_admin_consultor().
--
-- Importante: si has aplicado 0013 (resto de tablas Somm), lanza
-- primero su rollback — 0013 también usa la función es_admin_consultor().

drop policy if exists "admin_configuracion_pricing_select" on public.configuracion_pricing;
drop policy if exists "admin_configuracion_pricing_all"    on public.configuracion_pricing;

drop policy if exists "admin_tramos_multiplicador_select"  on public.tramos_multiplicador;
drop policy if exists "admin_tramos_multiplicador_all"     on public.tramos_multiplicador;

drop function if exists public.es_admin_consultor();
