-- Fase 7.3 - Resumen semanal ejecutivo persistido.
-- Ejecutar una vez en Supabase antes de guardar fotos semanales.

create table if not exists public.weekly_executive_summaries (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  periodo_key text not null,
  periodo_inicio timestamptz not null,
  periodo_fin timestamptz not null,
  formula_version text not null default 'weekly-executive-summary-v1',
  titular text not null default '',
  confianza text not null default 'baja' check (confianza in ('alta', 'media', 'baja')),
  resumen jsonb not null default '{}'::jsonb,
  kpis jsonb not null default '{}'::jsonb,
  ganado jsonb not null default '[]'::jsonb,
  pendiente jsonb not null default '[]'::jsonb,
  decisiones jsonb not null default '[]'::jsonb,
  senales jsonb not null default '{}'::jsonb,
  copy_text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  generated_by uuid default auth.uid(),
  generated_by_email text,
  generated_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_channel text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurante_id, periodo_key)
);

create index if not exists weekly_executive_summaries_rest_period_idx
on public.weekly_executive_summaries (restaurante_id, periodo_inicio desc, created_at desc);

alter table public.weekly_executive_summaries enable row level security;

drop policy if exists "weekly_executive_summaries_select_owner" on public.weekly_executive_summaries;
create policy "weekly_executive_summaries_select_owner"
on public.weekly_executive_summaries for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = weekly_executive_summaries.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

-- Las escrituras se hacen desde /api/resumen-semanal con service_role tras validar acceso.
