-- Fase 5 - Simulador de rentabilidad.

create table if not exists public.profit_scenarios (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  nombre text not null,
  descripcion text,
  formula_version text not null default 'profit-simulator-v1',
  input jsonb not null default '{}'::jsonb,
  impacto_margen numeric(14,2) not null default 0,
  impacto_capital numeric(14,2) not null default 0,
  impacto_stock numeric(14,2) not null default 0,
  impacto_ticket numeric(14,2) not null default 0,
  confianza text not null default 'media' check (confianza in ('alta', 'media', 'baja')),
  estado text not null default 'borrador' check (estado in ('borrador', 'propuesto', 'aplicado', 'descartado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz,
  discarded_at timestamptz
);

create table if not exists public.profit_scenario_items (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.profit_scenarios(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  vino_id uuid,
  tipo text not null,
  titulo text not null,
  detalle text,
  accion text not null,
  href text not null default '/dashboard/simulador',
  formula_version text not null default 'profit-simulator-v1',
  input jsonb not null default '{}'::jsonb,
  impacto_margen numeric(14,2) not null default 0,
  impacto_capital numeric(14,2) not null default 0,
  impacto_stock numeric(14,2) not null default 0,
  impacto_ticket numeric(14,2) not null default 0,
  confianza text not null default 'media' check (confianza in ('alta', 'media', 'baja')),
  estado text not null default 'borrador' check (estado in ('borrador', 'propuesto', 'aplicado', 'descartado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profit_scenarios_restaurante_estado_idx
on public.profit_scenarios (restaurante_id, estado, created_at desc);

create index if not exists profit_scenario_items_scenario_idx
on public.profit_scenario_items (scenario_id, tipo, impacto_margen desc);

alter table public.profit_scenarios enable row level security;
alter table public.profit_scenario_items enable row level security;

drop policy if exists "profit_scenarios_select_owner" on public.profit_scenarios;
create policy "profit_scenarios_select_owner"
on public.profit_scenarios for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = profit_scenarios.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "profit_scenario_items_select_owner" on public.profit_scenario_items;
create policy "profit_scenario_items_select_owner"
on public.profit_scenario_items for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = profit_scenario_items.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);
