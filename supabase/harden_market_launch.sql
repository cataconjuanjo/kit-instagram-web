-- Endurecimiento previo a lanzamiento.
-- 1) Ajustes de stock y movimientos en una unica transaccion.
-- 2) Limite de vinos activos aplicado tambien en base de datos.

create or replace function public.aplicar_ajustes_stock_atomicos(
  p_restaurante_id uuid,
  p_ajustes jsonb,
  p_actor_id uuid default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_vino_id uuid;
  v_nombre text;
  v_modo text;
  v_tipo text;
  v_motivo text;
  v_valor integer;
  v_stock_anterior integer;
  v_stock_nuevo integer;
  v_cantidad integer;
  v_resultado jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_ajustes) <> 'array'
    or jsonb_array_length(p_ajustes) = 0
    or jsonb_array_length(p_ajustes) > 100 then
    raise exception 'Lista de ajustes no valida';
  end if;

  for v_item in select value from jsonb_array_elements(p_ajustes)
  loop
    v_vino_id := (v_item ->> 'vino_id')::uuid;
    v_modo := coalesce(v_item ->> 'modo', '');
    v_tipo := coalesce(v_item ->> 'tipo', '');
    v_motivo := left(coalesce(nullif(trim(v_item ->> 'motivo'), ''), 'Ajuste de stock'), 500);
    v_valor := (v_item ->> 'valor')::integer;

    if v_modo not in ('delta', 'establecer') then
      raise exception 'Modo de ajuste no valido';
    end if;
    if v_tipo not in ('entrada', 'venta', 'merma', 'ajuste', 'cata', 'invitacion') then
      raise exception 'Tipo de movimiento no valido';
    end if;

    select coalesce(stock, 0), nombre
      into v_stock_anterior, v_nombre
    from public.vinos
    where id = v_vino_id
      and restaurante_id = p_restaurante_id
    for update;

    if not found then
      raise exception 'Vino no encontrado o no autorizado';
    end if;

    v_stock_nuevo := case
      when v_modo = 'delta' then greatest(0, v_stock_anterior + v_valor)
      else greatest(0, v_valor)
    end;
    v_cantidad := v_stock_nuevo - v_stock_anterior;

    if v_cantidad <> 0 then
      update public.vinos
      set stock = v_stock_nuevo
      where id = v_vino_id;

      insert into public.movimientos_stock (
        restaurante_id,
        vino_id,
        tipo,
        cantidad,
        stock_anterior,
        stock_nuevo,
        motivo,
        created_by
      ) values (
        p_restaurante_id,
        v_vino_id,
        v_tipo,
        v_cantidad,
        v_stock_anterior,
        v_stock_nuevo,
        v_motivo,
        p_actor_id
      );

      if coalesce((v_item ->> 'registrar_venta')::boolean, false)
        and v_tipo = 'venta'
        and v_cantidad < 0 then
        insert into public.estadisticas (restaurante_id, tipo, detalle)
        values (
          p_restaurante_id,
          'venta',
          jsonb_build_object(
            'vino_id', v_vino_id,
            'vino', v_nombre,
            'resultado', 'vendida',
            'cantidad', abs(v_cantidad),
            'origen', 'inventario',
            'actor', p_actor_email
          )::text
        );
      end if;
    end if;

    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object(
      'vino_id', v_vino_id,
      'stock_anterior', v_stock_anterior,
      'stock_nuevo', v_stock_nuevo,
      'cantidad', v_cantidad
    ));
  end loop;

  return v_resultado;
end;
$$;

revoke all on function public.aplicar_ajustes_stock_atomicos(uuid, jsonb, uuid, text)
from public, anon, authenticated;
grant execute on function public.aplicar_ajustes_stock_atomicos(uuid, jsonb, uuid, text)
to service_role;

create or replace function public.validar_limite_vinos_activos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limite integer;
  v_activos integer;
begin
  if new.activo is not true then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.activo is true
    and old.restaurante_id = new.restaurante_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.restaurante_id::text));

  select coalesce(plan, 'basic')
    into v_plan
  from public.restaurantes
  where id = new.restaurante_id;

  if not found then
    raise exception 'Restaurante no encontrado';
  end if;

  v_limite := case v_plan
    when 'premium' then 9999
    when 'pro' then 200
    else 100
  end;

  select count(*)
    into v_activos
  from public.vinos
  where restaurante_id = new.restaurante_id
    and activo is true
    and (tg_op = 'INSERT' or id <> new.id);

  if v_activos >= v_limite then
    raise exception 'El plan % permite un maximo de % vinos activos', v_plan, v_limite;
  end if;

  return new;
end;
$$;

drop trigger if exists validar_limite_vinos_activos_trigger on public.vinos;
create trigger validar_limite_vinos_activos_trigger
before insert or update of activo, restaurante_id on public.vinos
for each row execute function public.validar_limite_vinos_activos();
