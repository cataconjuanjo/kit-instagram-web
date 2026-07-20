-- Eventos internos del embudo de entrega/publicacion.
-- Ejecutar en Supabase Dashboard -> SQL Editor para medir previews, aprobaciones, publicaciones y uso del QR.

create table if not exists public.publication_delivery_events (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  event text not null
    check (event in (
      'preview_generated',
      'preview_link_copied',
      'preview_message_copied',
      'preview_opened_from_dashboard',
      'preview_approved',
      'preview_approval_refreshed',
      'publication_published',
      'publication_paused',
      'qr_downloaded',
      'qr_print_opened',
      'public_link_copied',
      'team_message_copied',
      'public_destination_opened',
      'quick_view_opened'
    )),
  destino text not null default 'carta' check (destino in ('carta', 'hub')),
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid,
  actor_email text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists publication_delivery_events_restaurante_idx
on public.publication_delivery_events (restaurante_id, created_at desc);

create index if not exists publication_delivery_events_event_idx
on public.publication_delivery_events (restaurante_id, event, created_at desc);

alter table public.publication_delivery_events enable row level security;

drop policy if exists "delivery_events_select_owner" on public.publication_delivery_events;
create policy "delivery_events_select_owner"
on public.publication_delivery_events for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = publication_delivery_events.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

comment on table public.publication_delivery_events is
  'Eventos del embudo de entrega: preview, aprobacion, publicacion, QR y enlaces.';
