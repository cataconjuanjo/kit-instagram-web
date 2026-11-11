-- Rollback de 0013_consultor_bypass_somm_rls_resto.sql
-- Elimina las policies admin_* de las 5 tablas añadidas.
-- NO borra la función es_admin_consultor(): pertenece a 0012.

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
