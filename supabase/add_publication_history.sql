-- Historial de publicar/pausar carta publica.
-- Ejecutar en Supabase Dashboard -> SQL Editor para activar la auditoria de publicacion.

create table if not exists public.publication_events (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  accion text not null check (accion in ('publicar', 'pausar')),
  estado_anterior text not null check (estado_anterior in ('publicada', 'borrador')),
  estado_nuevo text not null check (estado_nuevo in ('publicada', 'borrador')),
  contenido_resumen jsonb not null default '{}'::jsonb,
  actor_id uuid,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists publication_events_restaurante_idx
on public.publication_events (restaurante_id, created_at desc);

alter table public.publication_events enable row level security;

drop policy if exists "publication_events_select_owner" on public.publication_events;
create policy "publication_events_select_owner"
on public.publication_events for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = publication_events.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

comment on table public.publication_events is
  'Auditoria de cambios de estado publico de carta/hub: publicar, pausar, actor y resumen de contenido.';
