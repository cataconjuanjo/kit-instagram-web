-- Aprobaciones de vista previa privada.
-- Ejecutar en Supabase Dashboard -> SQL Editor para registrar "preview revisada" antes de publicar.

create table if not exists public.publication_preview_approvals (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  token_hash text not null unique,
  token_tipo text,
  destino text not null default 'carta' check (destino in ('carta', 'hub')),
  reviewer_name text,
  reviewer_email text,
  note text,
  user_agent text,
  content_fingerprint text,
  content_fingerprint_version integer not null default 1,
  content_summary jsonb not null default '{}'::jsonb,
  token_expires_at timestamptz,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.publication_preview_approvals
  add column if not exists content_fingerprint text,
  add column if not exists content_fingerprint_version integer not null default 1,
  add column if not exists content_summary jsonb not null default '{}'::jsonb;

create index if not exists publication_preview_approvals_restaurante_idx
on public.publication_preview_approvals (restaurante_id, approved_at desc);

create index if not exists publication_preview_approvals_content_idx
on public.publication_preview_approvals (restaurante_id, destino, content_fingerprint, approved_at desc);

alter table public.publication_preview_approvals enable row level security;

drop policy if exists "preview_approvals_select_owner" on public.publication_preview_approvals;
create policy "preview_approvals_select_owner"
on public.publication_preview_approvals for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = publication_preview_approvals.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

comment on table public.publication_preview_approvals is
  'Confirmaciones hechas desde enlaces privados de preview antes de publicar la carta.';

comment on column public.publication_preview_approvals.content_fingerprint is
  'Huella sha256 del contenido publico aprobado. Si el contenido cambia, la aprobacion deja de ser vigente.';
