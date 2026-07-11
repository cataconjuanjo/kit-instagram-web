-- Fase 7.1 - Radar diario operativo para restaurantes.

create table if not exists public.daily_radar_actions (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  fecha_operativa date not null,
  clave text not null,
  area text not null default 'gerencia' check (area in ('sala', 'bodega', 'precio', 'carta', 'tpv', 'maridaje', 'datos', 'gerencia')),
  titulo text not null,
  detalle text not null,
  accion text not null,
  href text not null default '/dashboard',
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  impacto text not null default 'operativo',
  esfuerzo text not null default 'medio' check (esfuerzo in ('bajo', 'medio', 'alto')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_progreso', 'hecha', 'descartada')),
  origen text not null default 'radar_diario_fase7',
  metricas jsonb not null default '{}'::jsonb,
  periodo_inicio timestamptz,
  periodo_fin timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  hecha_at timestamptz,
  descartada_at timestamptz,
  unique (restaurante_id, fecha_operativa, clave)
);

create index if not exists daily_radar_actions_restaurante_fecha_idx
on public.daily_radar_actions (restaurante_id, fecha_operativa desc, estado, prioridad, created_at desc);

alter table public.daily_radar_actions enable row level security;

drop policy if exists "daily_radar_actions_select_owner" on public.daily_radar_actions;
create policy "daily_radar_actions_select_owner"
on public.daily_radar_actions for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = daily_radar_actions.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);
