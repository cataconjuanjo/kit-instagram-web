-- Modo camarero: PIN deshabilitado por defecto.
-- Ejecutar en Supabase SQL Editor. Borra PINs existentes y deja el modo camarero abierto salvo que cada restaurante active un PIN.

alter table public.restaurantes
  add column if not exists camarero_pin_habilitado boolean not null default false,
  add column if not exists camarero_pin_requerido boolean not null default false,
  add column if not exists camarero_pin_bloqueo_activo boolean not null default false;

update public.restaurantes
set camarero_pin_habilitado = false,
    camarero_pin_requerido = false,
    camarero_pin_bloqueo_activo = false,
    camarero_pin_hash = null,
    camarero_pin = null;

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
      camarero_pin = null,
      camarero_pin_habilitado = true,
      camarero_pin_requerido = true,
      camarero_pin_bloqueo_activo = true
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
      and camarero_pin_bloqueo_activo is true
      and camarero_pin_hash is not null
      and camarero_pin_hash = extensions.crypt(p_pin, camarero_pin_hash)
  );
$$;

revoke all on function public.configurar_pin_camarero(uuid, text) from public, anon, authenticated;
revoke all on function public.verificar_pin_camarero(uuid, text) from public, anon, authenticated;
grant execute on function public.configurar_pin_camarero(uuid, text) to service_role;
grant execute on function public.verificar_pin_camarero(uuid, text) to service_role;
