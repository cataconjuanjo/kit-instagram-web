-- 0012_consultor_bypass_somm_rls.sql
--
-- Scope reducido: solo las dos tablas del Motor de Precios (bug reportado).
-- - public.es_admin_consultor()  (función helper, idempotente)
-- - configuracion_pricing        (2 policies admin_* TO authenticated)
-- - tramos_multiplicador         (2 policies admin_* TO authenticated)
--
-- Aditiva: no toca las policies existentes del propietario. PostgreSQL
-- combina las múltiples policies con OR, de modo que el propietario sigue
-- viendo lo mismo que ahora y el admin (es_admin_consultor()) gana acceso.
--
-- Para extender el bypass a las otras 5 tablas Somm (parametros_explotacion,
-- libro_compras, historico_mensual, presupuesto_mensual, configuracion_bonus)
-- aplica además sql/0013_consultor_bypass_somm_rls_resto.sql.
--
-- Aplicar:   psql "$DATABASE_URL" -f sql/0012_consultor_bypass_somm_rls.sql
-- Rollback:  psql "$DATABASE_URL" -f sql/0012_consultor_bypass_somm_rls_rollback.sql

-- ── Helper ──────────────────────────────────────────────────────────────────
-- Encapsula el literal del email admin en un único sitio para facilitar su
-- refactorización. SECURITY DEFINER no es necesario para una comparación
-- pura, pero STABLE sí (el planner puede inlinear).
create or replace function public.es_admin_consultor()
returns boolean
language sql
stable
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

-- ═════════════════════════════════════════════════════════════════════════════
-- Verificación manual (debe devolver 4 filas):
--
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE policyname LIKE 'admin_%'
--      AND tablename IN ('configuracion_pricing','tramos_multiplicador')
--    ORDER BY tablename, cmd;
-- ═════════════════════════════════════════════════════════════════════════════
