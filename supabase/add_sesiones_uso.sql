-- Sesiones de uso del dashboard privado de restaurantes.
-- Ejecutar en Supabase Dashboard -> SQL Editor.

create table if not exists public.sesiones_uso (
  id uuid default gen_random_uuid() primary key,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  user_id uuid not null,
  user_email text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  active_seconds integer not null default 0
);

create index if not exists sesiones_uso_restaurante_started_idx
on public.sesiones_uso (restaurante_id, started_at desc);

create index if not exists sesiones_uso_last_seen_idx
on public.sesiones_uso (last_seen_at desc);

alter table public.sesiones_uso enable row level security;

-- El acceso se realiza solo desde /api/uso con service_role.
-- No se exponen sesiones directamente al navegador.

create or replace function public.registrar_pulso_uso(
  p_sesion_id uuid,
  p_finalizar boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sesiones_uso
  set
    active_seconds = active_seconds + least(
      90,
      greatest(0, extract(epoch from (now() - last_seen_at))::integer)
    ),
    last_seen_at = now(),
    ended_at = case when p_finalizar then now() else ended_at end
  where id = p_sesion_id
    and ended_at is null;
end;
$$;

revoke all on function public.registrar_pulso_uso(uuid, boolean) from public;
revoke all on function public.registrar_pulso_uso(uuid, boolean) from anon;
revoke all on function public.registrar_pulso_uso(uuid, boolean) from authenticated;
grant execute on function public.registrar_pulso_uso(uuid, boolean) to service_role;
