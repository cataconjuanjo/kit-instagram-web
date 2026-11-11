-- Rollback de 0012_consultor_bypass_somm_rls.sql
-- Elimina las políticas admin_* y la función es_admin_consultor.
-- Deja intactas las políticas preexistentes del propietario.

drop policy if exists "admin_configuracion_pricing_select"   on public.configuracion_pricing;
drop policy if exists "admin_configuracion_pricing_all"      on public.configuracion_pricing;

drop policy if exists "admin_tramos_multiplicador_select"    on public.tramos_multiplicador;
drop policy if exists "admin_tramos_multiplicador_all"       on public.tramos_multiplicador;

drop policy if exists "admin_parametros_explotacion_select"  on public.parametros_explotacion;
drop policy if exists "admin_parametros_explotacion_all"     on public.parametros_explotacion;

drop policy if exists "admin_libro_compras_select"           on public.libro_compras;
drop policy if exists "admin_libro_compras_all"              on public.libro_compras;

drop policy if exists "admin_historico_mensual_select"       on public.historico_mensual;
drop policy if exists "admin_historico_mensual_all"          on public.historico_mensual;

drop policy if exists "admin_presupuesto_mensual_select"     on public.presupuesto_mensual;
drop policy if exists "admin_presupuesto_mensual_all"        on public.presupuesto_mensual;

drop policy if exists "admin_configuracion_bonus_select"     on public.configuracion_bonus;
drop policy if exists "admin_configuracion_bonus_all"        on public.configuracion_bonus;

drop function if exists public.es_admin_consultor();
