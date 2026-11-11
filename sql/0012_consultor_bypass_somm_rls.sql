-- 0012_consultor_bypass_somm_rls.sql
--
-- Añade bypass de consultor (email admin) a las tablas del módulo Somm /
-- Economía que hoy solo autorizan al propietario del restaurante. Sin este
-- bypass, cuando el admin abre un restaurante desde el panel de consultoría
-- (openRestaurantDashboard → setAdminRestaurantId → navegación con
-- ?restaurante_id=...), la sesión sigue siendo la del admin mientras que
-- las RLS filtran por restaurantes.email = auth.jwt().email → 0 filas.
--
-- Esta migración es ADITIVA: crea políticas NUEVAS "TO authenticated"
-- alongside las existentes, aprovechando que PostgreSQL combina múltiples
-- policies con OR. No modifica ni elimina ninguna política existente.
-- No abre acceso a nadie que no fuera el admin ya reconocido en
-- add_dashboard_policies.sql.
--
-- Scope del bug reportado: tramos_multiplicador + configuracion_pricing
-- (Motor de Precios). Para cerrar el gap en el resto del módulo Somm
-- añadimos también las otras 5 tablas con la misma política, en el mismo
-- bloque, porque heredan la misma limitación y lo pide la revisión de
-- consultor completa. Si prefieres aplicar solo la mitad, borra los
-- bloques que no quieras antes de ejecutar.
--
-- Aplicar:   psql "$DATABASE_URL" -f sql/0012_consultor_bypass_somm_rls.sql
-- Rollback:  psql "$DATABASE_URL" -f sql/0012_consultor_bypass_somm_rls_rollback.sql

-- ── Helper para no repetir el literal del admin ──────────────────────────────
-- Función idempotente que devuelve true si la sesión es admin consultor.
-- Centraliza el email en un solo sitio para futura refactorización.
create or replace function public.es_admin_consultor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
$$;

revoke all on function public.es_admin_consultor() from public;
grant execute on function public.es_admin_consultor() to authenticated, anon;

-- ── 1. CONFIGURACION_PRICING ─────────────────────────────────────────────────
drop policy if exists "admin_configuracion_pricing_select" on public.configuracion_pricing;
create policy "admin_configuracion_pricing_select"
  on public.configuracion_pricing for select to authenticated
  using ( public.es_admin_consultor() );

drop policy if exists "admin_configuracion_pricing_all" on public.configuracion_pricing;
create policy "admin_configuracion_pricing_all"
  on public.configuracion_pricing for all to authenticated
  using ( public.es_admin_consultor() )
  with check ( public.es_admin_consultor() );

-- ── 2. TRAMOS_MULTIPLICADOR ──────────────────────────────────────────────────
drop policy if exists "admin_tramos_multiplicador_select" on public.tramos_multiplicador;
create policy "admin_tramos_multiplicador_select"
  on public.tramos_multiplicador for select to authenticated
  using ( public.es_admin_consultor() );

drop policy if exists "admin_tramos_multiplicador_all" on public.tramos_multiplicador;
create policy "admin_tramos_multiplicador_all"
  on public.tramos_multiplicador for all to authenticated
  using ( public.es_admin_consultor() )
  with check ( public.es_admin_consultor() );

-- ── 3. PARAMETROS_EXPLOTACION ────────────────────────────────────────────────
drop policy if exists "admin_parametros_explotacion_select" on public.parametros_explotacion;
create policy "admin_parametros_explotacion_select"
  on public.parametros_explotacion for select to authenticated
  using ( public.es_admin_consultor() );

drop policy if exists "admin_parametros_explotacion_all" on public.parametros_explotacion;
create policy "admin_parametros_explotacion_all"
  on public.parametros_explotacion for all to authenticated
  using ( public.es_admin_consultor() )
  with check ( public.es_admin_consultor() );

-- ── 4. LIBRO_COMPRAS ─────────────────────────────────────────────────────────
drop policy if exists "admin_libro_compras_select" on public.libro_compras;
create policy "admin_libro_compras_select"
  on public.libro_compras for select to authenticated
  using ( public.es_admin_consultor() );

drop policy if exists "admin_libro_compras_all" on public.libro_compras;
create policy "admin_libro_compras_all"
  on public.libro_compras for all to authenticated
  using ( public.es_admin_consultor() )
  with check ( public.es_admin_consultor() );

-- ── 5. HISTORICO_MENSUAL ─────────────────────────────────────────────────────
drop policy if exists "admin_historico_mensual_select" on public.historico_mensual;
create policy "admin_historico_mensual_select"
  on public.historico_mensual for select to authenticated
  using ( public.es_admin_consultor() );

drop policy if exists "admin_historico_mensual_all" on public.historico_mensual;
create policy "admin_historico_mensual_all"
  on public.historico_mensual for all to authenticated
  using ( public.es_admin_consultor() )
  with check ( public.es_admin_consultor() );

-- ── 6. PRESUPUESTO_MENSUAL ───────────────────────────────────────────────────
drop policy if exists "admin_presupuesto_mensual_select" on public.presupuesto_mensual;
create policy "admin_presupuesto_mensual_select"
  on public.presupuesto_mensual for select to authenticated
  using ( public.es_admin_consultor() );

drop policy if exists "admin_presupuesto_mensual_all" on public.presupuesto_mensual;
create policy "admin_presupuesto_mensual_all"
  on public.presupuesto_mensual for all to authenticated
  using ( public.es_admin_consultor() )
  with check ( public.es_admin_consultor() );

-- ── 7. CONFIGURACION_BONUS ───────────────────────────────────────────────────
drop policy if exists "admin_configuracion_bonus_select" on public.configuracion_bonus;
create policy "admin_configuracion_bonus_select"
  on public.configuracion_bonus for select to authenticated
  using ( public.es_admin_consultor() );

drop policy if exists "admin_configuracion_bonus_all" on public.configuracion_bonus;
create policy "admin_configuracion_bonus_all"
  on public.configuracion_bonus for all to authenticated
  using ( public.es_admin_consultor() )
  with check ( public.es_admin_consultor() );

-- ═════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN manual tras aplicar (debería devolver 14 filas, 2 por tabla):
--
--   SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE policyname LIKE 'admin_%'
--     AND tablename IN (
--       'configuracion_pricing','tramos_multiplicador','parametros_explotacion',
--       'libro_compras','historico_mensual','presupuesto_mensual','configuracion_bonus'
--     )
--   ORDER BY tablename, cmd;
-- ═════════════════════════════════════════════════════════════════════════════
