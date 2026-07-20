-- Planes de activacion de experiencias Carta Viva.
-- Ejecutar en Supabase Dashboard -> SQL Editor para persistir plantillas entre dispositivos.

create table if not exists public.experience_activation_plans (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  template_id text not null
    check (template_id in ('lanzamiento', 'temporada', 'degustacion', 'premium', 'evento')),
  is_active boolean not null default false,
  completed_steps jsonb not null default '{}'::jsonb,
  objective_date date,
  responsible text,
  notes text,
  actor_id uuid,
  actor_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurante_id, template_id)
);

create unique index if not exists experience_activation_plans_active_idx
on public.experience_activation_plans (restaurante_id)
where is_active;

create index if not exists experience_activation_plans_restaurante_idx
on public.experience_activation_plans (restaurante_id, updated_at desc);

alter table public.experience_activation_plans enable row level security;

drop policy if exists "experience_plans_select_owner" on public.experience_activation_plans;
create policy "experience_plans_select_owner"
on public.experience_activation_plans for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = experience_activation_plans.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "experience_plans_insert_owner" on public.experience_activation_plans;
create policy "experience_plans_insert_owner"
on public.experience_activation_plans for insert
with check (
  exists (
    select 1 from public.restaurantes r
    where r.id = experience_activation_plans.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "experience_plans_update_owner" on public.experience_activation_plans;
create policy "experience_plans_update_owner"
on public.experience_activation_plans for update
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = experience_activation_plans.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1 from public.restaurantes r
    where r.id = experience_activation_plans.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

comment on table public.experience_activation_plans is
  'Plantilla activa y plan operativo de experiencia para lanzamiento, temporada, degustacion, premium o evento privado.';
