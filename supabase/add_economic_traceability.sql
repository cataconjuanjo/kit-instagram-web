-- Fase 8 - Rigor economico y trazabilidad.
-- Ejecutar en Supabase antes de guardar ajustes o fotos de auditoria.

create table if not exists public.restaurant_economic_settings (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade unique,
  formula_version text not null default 'economic-trace-v1',
  iva_venta_pct numeric(6,2) not null default 10,
  pvp_incluye_iva boolean not null default true,
  coste_incluye_iva boolean not null default false,
  formato_botella_ml integer not null default 750,
  copas_por_botella numeric(6,2) not null default 5,
  merma_copa_pct numeric(6,2) not null default 10,
  margen_objetivo_botella_pct numeric(6,2) not null default 65,
  margen_objetivo_copa_pct numeric(6,2) not null default 70,
  precio_minimo_copa numeric(10,2) not null default 4.50,
  stock_seguridad_default numeric(10,2) not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.economic_trace_reports (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  periodo_inicio timestamptz,
  periodo_fin timestamptz,
  formula_version text not null default 'economic-trace-v1',
  generated_by uuid default auth.uid(),
  generated_by_email text,
  settings_snapshot jsonb not null default '{}'::jsonb,
  resumen jsonb not null default '{}'::jsonb,
  fuentes jsonb not null default '[]'::jsonb,
  advertencias jsonb not null default '[]'::jsonb,
  cambios_snapshot jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists economic_trace_reports_rest_created_idx
on public.economic_trace_reports (restaurante_id, created_at desc);

do $$
begin
  if to_regclass('public.recommendation_exposures') is not null then
    alter table public.recommendation_exposures
      add column if not exists formula_version text not null default 'recommendation-attribution-v1',
      add column if not exists economic_source text not null default 'snapshot_recomendacion',
      add column if not exists economic_confidence_pct numeric(7,2) not null default 0,
      add column if not exists economic_snapshot jsonb not null default '{}'::jsonb;
  end if;

  if to_regclass('public.recommendation_outcomes') is not null then
    alter table public.recommendation_outcomes
      add column if not exists formula_version text not null default 'recommendation-outcome-v1',
      add column if not exists economic_source text not null default 'resultado_recomendacion',
      add column if not exists margin_type text not null default 'inferido' check (margin_type in ('real_tpv', 'confirmado_sala', 'inferido', 'estimado', 'contexto')),
      add column if not exists economic_snapshot jsonb not null default '{}'::jsonb;
  end if;

  if to_regclass('public.profit_scenarios') is not null then
    alter table public.profit_scenarios
      add column if not exists settings_snapshot jsonb not null default '{}'::jsonb;
  end if;

  if to_regclass('public.profit_scenario_items') is not null then
    alter table public.profit_scenario_items
      add column if not exists settings_snapshot jsonb not null default '{}'::jsonb;
  end if;

  if to_regclass('public.daily_radar_actions') is not null then
    alter table public.daily_radar_actions
      add column if not exists formula_version text not null default 'radar-diario-fase7',
      add column if not exists economic_source text not null default 'radar_diario';
  end if;
end $$;

alter table public.restaurant_economic_settings enable row level security;
alter table public.economic_trace_reports enable row level security;

drop policy if exists "restaurant_economic_settings_select_owner" on public.restaurant_economic_settings;
create policy "restaurant_economic_settings_select_owner"
on public.restaurant_economic_settings for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = restaurant_economic_settings.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "economic_trace_reports_select_owner" on public.economic_trace_reports;
create policy "economic_trace_reports_select_owner"
on public.economic_trace_reports for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = economic_trace_reports.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

-- Las escrituras se hacen desde /api/economic-traceability con service_role tras validar acceso.
