-- Motor de oportunidad economica: impacto estimado, dificultad, confianza y prioridad.

create table if not exists public.opportunity_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  periodo_inicio timestamptz not null,
  periodo_fin timestamptz not null,
  recuperacion_anual_estimada numeric(14,2) not null default 0,
  impacto_acciones_rapidas numeric(14,2) not null default 0,
  impacto_medio_plazo numeric(14,2) not null default 0,
  impacto_estrategico numeric(14,2) not null default 0,
  capital_liberable_estimado numeric(14,2) not null default 0,
  confianza_media_pct numeric(7,2) not null default 0,
  oportunidades_total integer not null default 0,
  resumen text,
  created_at timestamptz not null default now()
);

create index if not exists opportunity_snapshots_restaurante_periodo_idx
on public.opportunity_snapshots (restaurante_id, periodo_fin desc);

create table if not exists public.opportunity_items (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.opportunity_snapshots(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  area text not null,
  titulo text not null,
  detalle text,
  accion text not null,
  impacto_estimado numeric(14,2) not null default 0,
  tipo_impacto text not null default 'margen' check (tipo_impacto in ('margen', 'capital', 'ventas', 'riesgo')),
  horizonte text not null default 'medio_plazo' check (horizonte in ('accion_rapida', 'medio_plazo', 'estrategico')),
  dificultad text not null default 'media' check (dificultad in ('baja', 'media', 'alta')),
  confianza_pct numeric(7,2) not null default 0,
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  formula text,
  created_at timestamptz not null default now()
);

create index if not exists opportunity_items_snapshot_idx
on public.opportunity_items (snapshot_id, prioridad, impacto_estimado desc);

create index if not exists opportunity_items_restaurante_idx
on public.opportunity_items (restaurante_id, prioridad, created_at desc);

alter table public.opportunity_snapshots enable row level security;
alter table public.opportunity_items enable row level security;

drop policy if exists "opportunity_snapshots_select_owner" on public.opportunity_snapshots;
create policy "opportunity_snapshots_select_owner"
on public.opportunity_snapshots for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = opportunity_snapshots.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "opportunity_items_select_owner" on public.opportunity_items;
create policy "opportunity_items_select_owner"
on public.opportunity_items for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = opportunity_items.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);
