-- Sprint de seguridad semana 1. Ejecutar una vez en Supabase SQL Editor.
create extension if not exists pgcrypto;

alter table public.restaurantes
  add column if not exists camarero_pin_hash text;

create or replace function public.configurar_pin_camarero(
  p_restaurante_id uuid,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pin !~ '^[0-9]{4,12}$' then
    raise exception 'PIN no valido';
  end if;

  update public.restaurantes
  set camarero_pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
      camarero_pin = null
  where id = p_restaurante_id;
end;
$$;

create or replace function public.verificar_pin_camarero(
  p_restaurante_id uuid,
  p_pin text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurantes
    where id = p_restaurante_id
      and camarero_pin_hash is not null
      and camarero_pin_hash = extensions.crypt(p_pin, camarero_pin_hash)
  );
$$;

revoke all on function public.configurar_pin_camarero(uuid, text) from public, anon, authenticated;
revoke all on function public.verificar_pin_camarero(uuid, text) from public, anon, authenticated;
grant execute on function public.configurar_pin_camarero(uuid, text) to service_role;
grant execute on function public.verificar_pin_camarero(uuid, text) to service_role;

update public.restaurantes
set camarero_pin_hash = extensions.crypt(camarero_pin, extensions.gen_salt('bf')),
    camarero_pin = null
where nullif(trim(camarero_pin), '') is not null
  and camarero_pin_hash is null;

drop policy if exists "anon_read_restaurantes" on public.restaurantes;
drop policy if exists "anon_read_vinos_activos" on public.vinos;
drop policy if exists "anon_read_platos_activos" on public.platos;
revoke select on public.restaurantes from anon;
revoke select on public.vinos from anon;
revoke select on public.platos from anon;

do $$
begin
  if exists (select from information_schema.tables where table_schema = 'public' and table_name = 'consultor_propuestas') then
    alter table public.consultor_propuestas enable row level security;
    drop policy if exists "consultor_propuestas_select" on public.consultor_propuestas;
    drop policy if exists "consultor_propuestas_update" on public.consultor_propuestas;
  end if;

  if exists (select from information_schema.tables where table_schema = 'public' and table_name = 'restaurante_links') then
    alter table public.restaurante_links enable row level security;
    revoke all on public.restaurante_links from anon;
  end if;

  if exists (select from information_schema.tables where table_schema = 'public' and table_name = 'seleccion_especial') then
    alter table public.seleccion_especial enable row level security;
    revoke all on public.seleccion_especial from anon;
  end if;
end $$;

do $$
begin
  if exists (select from information_schema.tables where table_schema = 'public' and table_name = 'seleccion_especial') then
    drop policy if exists "auth_seleccion_all" on public.seleccion_especial;
    create policy "auth_seleccion_all"
    on public.seleccion_especial for all to authenticated
    using (
      (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
      or restaurante_id in (
        select id from public.restaurantes
        where email = (auth.jwt() ->> 'email')
      )
    )
    with check (
      (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
      or restaurante_id in (
        select id from public.restaurantes
        where email = (auth.jwt() ->> 'email')
      )
    );
  end if;
end $$;

drop policy if exists "restaurante_logo_insert" on storage.objects;
create policy "restaurante_logo_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'logos'
  and (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    or exists (
      select 1
      from public.restaurantes r
      where r.slug = (storage.foldername(name))[1]
        and r.email = (auth.jwt() ->> 'email')
    )
  )
);

-- Verificación rápida:
-- select tablename, policyname, roles, cmd from pg_policies order by tablename, policyname;
