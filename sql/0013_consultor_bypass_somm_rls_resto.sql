-- 0013_consultor_bypass_somm_rls_resto.sql
--
-- Continuación de 0012: añade bypass admin TO authenticated a las 5 tablas
-- Somm/Economía restantes para cerrar el gap completo del panel de consultor:
-- - parametros_explotacion
-- - libro_compras
-- - historico_mensual
-- - presupuesto_mensual
-- - configuracion_bonus
--
-- Prerrequisito: 0012_consultor_bypass_somm_rls.sql (crea la función helper
-- public.es_admin_consultor()). Aplica primero 0012.
--
-- Aditiva: no toca las policies existentes del propietario. Se apoya en que
-- PostgreSQL combina múltiples policies con OR.
--
-- Aplicar:   psql "$DATABASE_URL" -f sql/0013_consultor_bypass_somm_rls_resto.sql
-- Rollback:  psql "$DATABASE_URL" -f sql/0013_consultor_bypass_somm_rls_resto_rollback.sql

-- ── 1. PARAMETROS_EXPLOTACION ────────────────────────────────────────────────
drop policy if exists "admin_parametros_explotacion_select" on public.parametros_explotacion;
create policy "admin_parametros_explotacion_select"
  on public.parametros_explotacion for select to authenticated
  using ( public.es_admin_consultor() );

drop policy if exists "admin_parametros_explotacion_all" on public.parametros_explotacion;
create policy "admin_parametros_explotacion_all"
  on public.parametros_explotacion for all to authenticated
  using ( public.es_admin_consultor() )
  with check ( public.es_admin_consultor() );

-- ── 2. LIBRO_COMPRAS ─────────────────────────────────────────────────────────
drop policy if exists "admin_libro_compras_select" on public.libro_compras;
create policy "admin_libro_compras_select"
  on public.libro_compras for select to authenticated
  using ( public.es_admin_consultor() );

drop policy if exists "admin_libro_compras_all" on public.libro_compras;
create policy "admin_libro_compras_all"
  on public.libro_compras for all to authenticated
  using ( public.es_admin_consultor() )
  with check ( public.es_admin_consultor() );

-- ── 3. HISTORICO_MENSUAL ─────────────────────────────────────────────────────
drop policy if exists "admin_historico_mensual_select" on public.historico_mensual;
create policy "admin_historico_mensual_select"
  on public.historico_mensual for select to authenticated
  using ( public.es_admin_consultor() );

drop policy if exists "admin_historico_mensual_all" on public.historico_mensual;
create policy "admin_historico_mensual_all"
  on public.historico_mensual for all to authenticated
  using ( public.es_admin_consultor() )
  with check ( public.es_admin_consultor() );

-- ── 4. PRESUPUESTO_MENSUAL ───────────────────────────────────────────────────
drop policy if exists "admin_presupuesto_mensual_select" on public.presupuesto_mensual;
create policy "admin_presupuesto_mensual_select"
  on public.presupuesto_mensual for select to authenticated
  using ( public.es_admin_consultor() );

drop policy if exists "admin_presupuesto_mensual_all" on public.presupuesto_mensual;
create policy "admin_presupuesto_mensual_all"
  on public.presupuesto_mensual for all to authenticated
  using ( public.es_admin_consultor() )
  with check ( public.es_admin_consultor() );

-- ── 5. CONFIGURACION_BONUS ───────────────────────────────────────────────────
drop policy if exists "admin_configuracion_bonus_select" on public.configuracion_bonus;
create policy "admin_configuracion_bonus_select"
  on public.configuracion_bonus for select to authenticated
  using ( public.es_admin_consultor() );

drop policy if exists "admin_configuracion_bonus_all" on public.configuracion_bonus;
create policy "admin_configuracion_bonus_all"
  on public.configuracion_bonus for all to authenticated
  using ( public.es_admin_consultor() )
  with check ( public.es_admin_consultor() );
