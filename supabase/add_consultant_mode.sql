-- Modo consultor: diagnostico, problemas y plan de accion presentable.

create table if not exists public.consultant_diagnostics (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  periodo_inicio timestamptz not null,
  periodo_fin timestamptz not null,
  score integer not null default 0,
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  resumen_ejecutivo text,
  estado_actual text,
  problema_principal text,
  quick_wins jsonb not null default '[]'::jsonb,
  medio_plazo jsonb not null default '[]'::jsonb,
  estrategico jsonb not null default '[]'::jsonb,
  problemas_detectados jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists consultant_diagnostics_restaurante_periodo_idx
on public.consultant_diagnostics (restaurante_id, periodo_fin desc);

create table if not exists public.consultant_action_items (
  id uuid primary key default gen_random_uuid(),
  diagnostic_id uuid not null references public.consultant_diagnostics(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  fase text not null check (fase in ('accion_rapida', 'medio_plazo', 'estrategico')),
  titulo text not null,
  detalle text,
  accion text not null,
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  impacto text not null default 'medio' check (impacto in ('alto', 'medio', 'bajo')),
  esfuerzo text not null default 'medio' check (esfuerzo in ('bajo', 'medio', 'alto')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_progreso', 'hecha', 'descartada')),
  origen text not null default 'modo_consultor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consultant_action_items_diagnostic_idx
on public.consultant_action_items (diagnostic_id, fase, prioridad);

create index if not exists consultant_action_items_restaurante_idx
on public.consultant_action_items (restaurante_id, estado, prioridad, created_at desc);

alter table public.consultant_diagnostics enable row level security;
alter table public.consultant_action_items enable row level security;

drop policy if exists "consultant_diagnostics_select_owner" on public.consultant_diagnostics;
create policy "consultant_diagnostics_select_owner"
on public.consultant_diagnostics for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = consultant_diagnostics.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "consultant_action_items_select_owner" on public.consultant_action_items;
create policy "consultant_action_items_select_owner"
on public.consultant_action_items for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = consultant_action_items.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);
