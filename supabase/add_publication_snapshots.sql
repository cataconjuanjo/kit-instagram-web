-- Versiones publicadas de carta.
-- Ejecutar en Supabase Dashboard -> SQL Editor para guardar una foto de contenido al publicar.

create table if not exists public.publication_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  publication_event_id uuid references public.publication_events(id) on delete set null,
  version_number integer not null,
  estado text not null default 'publicada' check (estado in ('publicada')),
  contenido_resumen jsonb not null default '{}'::jsonb,
  restaurante_resumen jsonb not null default '{}'::jsonb,
  vinos_snapshot jsonb not null default '[]'::jsonb,
  platos_snapshot jsonb not null default '[]'::jsonb,
  actor_id uuid,
  actor_email text,
  created_at timestamptz not null default now(),
  unique (restaurante_id, version_number)
);

create index if not exists publication_snapshots_restaurante_idx
on public.publication_snapshots (restaurante_id, version_number desc);

create index if not exists publication_snapshots_event_idx
on public.publication_snapshots (publication_event_id);

alter table public.publication_snapshots enable row level security;

drop policy if exists "publication_snapshots_select_owner" on public.publication_snapshots;
create policy "publication_snapshots_select_owner"
on public.publication_snapshots for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = publication_snapshots.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

comment on table public.publication_snapshots is
  'Foto versionada del contenido visible cuando una carta se publica.';
