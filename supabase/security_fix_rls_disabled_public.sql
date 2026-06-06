-- Correccion urgente para aviso Supabase: rls_disabled_in_public.
-- Ejecutar en Supabase Dashboard -> SQL Editor.
--
-- Objetivo:
-- 1. Ver que tablas public tenian RLS desactivado.
-- 2. Activar RLS en todas las tablas base de public.
-- 3. Quitar acceso directo anon a tablas public.
-- 4. Reponer policies autenticadas esenciales del dashboard.

-- 1) Diagnostico antes del fix.
select
  n.nspname as schema,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', c.oid, 'select') as anon_select,
  has_table_privilege('anon', c.oid, 'insert') as anon_insert,
  has_table_privilege('anon', c.oid, 'update') as anon_update,
  has_table_privilege('anon', c.oid, 'delete') as anon_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relrowsecurity, c.relname;

-- 2) Activar RLS y revocar acceso anon directo en todas las tablas public.
do $$
declare
  r record;
begin
  for r in
    select format('%I.%I', n.nspname, c.relname) as qname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute 'alter table ' || r.qname || ' enable row level security';
    execute 'revoke all on table ' || r.qname || ' from anon';
  end loop;
end $$;

-- 3) Policies base para tablas usadas directamente por usuarios autenticados.
-- Admin total: cataconjuanjo@gmail.com.
-- Restaurante: acceso solo a filas de su email/restaurante_id.

drop policy if exists "auth_restaurantes_select" on public.restaurantes;
create policy "auth_restaurantes_select"
on public.restaurantes for select to authenticated
using (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or email = (auth.jwt() ->> 'email')
);

drop policy if exists "auth_restaurantes_update" on public.restaurantes;
create policy "auth_restaurantes_update"
on public.restaurantes for update to authenticated
using (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or email = (auth.jwt() ->> 'email')
)
with check (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or email = (auth.jwt() ->> 'email')
);

drop policy if exists "auth_vinos_select" on public.vinos;
create policy "auth_vinos_select"
on public.vinos for select to authenticated
using (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
);

drop policy if exists "auth_vinos_insert" on public.vinos;
create policy "auth_vinos_insert"
on public.vinos for insert to authenticated
with check (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
);

drop policy if exists "auth_vinos_update" on public.vinos;
create policy "auth_vinos_update"
on public.vinos for update to authenticated
using (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
)
with check (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
);

drop policy if exists "auth_vinos_delete" on public.vinos;
create policy "auth_vinos_delete"
on public.vinos for delete to authenticated
using (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
);

drop policy if exists "auth_platos_select" on public.platos;
create policy "auth_platos_select"
on public.platos for select to authenticated
using (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
);

drop policy if exists "auth_platos_insert" on public.platos;
create policy "auth_platos_insert"
on public.platos for insert to authenticated
with check (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
);

drop policy if exists "auth_platos_update" on public.platos;
create policy "auth_platos_update"
on public.platos for update to authenticated
using (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
)
with check (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
);

drop policy if exists "auth_platos_delete" on public.platos;
create policy "auth_platos_delete"
on public.platos for delete to authenticated
using (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
);

drop policy if exists "auth_estadisticas_select" on public.estadisticas;
create policy "auth_estadisticas_select"
on public.estadisticas for select to authenticated
using (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
);

drop policy if exists "auth_estadisticas_insert" on public.estadisticas;
create policy "auth_estadisticas_insert"
on public.estadisticas for insert to authenticated
with check (
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
);

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'movimientos_stock') then
    drop policy if exists "auth_movimientos_all" on public.movimientos_stock;
    create policy "auth_movimientos_all"
    on public.movimientos_stock for all to authenticated
    using (
      (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
      or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
    )
    with check (
      (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
      or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
    );
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'consultor_propuestas') then
    drop policy if exists "auth_propuestas_all" on public.consultor_propuestas;
    create policy "auth_propuestas_all"
    on public.consultor_propuestas for all to authenticated
    using (
      (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
      or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
    )
    with check (
      (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
      or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
    );
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'seleccion_especial') then
    drop policy if exists "auth_seleccion_all" on public.seleccion_especial;
    create policy "auth_seleccion_all"
    on public.seleccion_especial for all to authenticated
    using (
      (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
      or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
    )
    with check (
      (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
      or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
    );
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'restaurante_links') then
    -- Policy antigua detectada por Supabase Advisor como demasiado permisiva.
    drop policy if exists "Authenticated can manage hub links" on public.restaurante_links;
    drop policy if exists "auth_links_all" on public.restaurante_links;
    create policy "auth_links_all"
    on public.restaurante_links for all to authenticated
    using (
      (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
      or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
    )
    with check (
      (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
      or restaurante_id in (select id from public.restaurantes where email = (auth.jwt() ->> 'email'))
    );
  end if;
end $$;

-- 4) Verificacion despues del fix: esta consulta debe devolver 0 filas.
select
  n.nspname as schema,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relrowsecurity = false
order by c.relname;

-- 5) Verificacion extra: policies peligrosas que usan true para escritura.
-- Esta consulta debe devolver 0 filas.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  and (
    lower(coalesce(qual, '')) in ('true', '(true)')
    or lower(coalesce(with_check, '')) in ('true', '(true)')
  )
order by tablename, policyname;

-- 6) Storage logos: bucket publico sin policy amplia de SELECT.
-- Las URLs publicas siguen funcionando por ser bucket publico; no hace falta
-- permitir que clientes listen todo storage.objects.
drop policy if exists "Permitir lectura de logos" on storage.objects;
drop policy if exists "Public read logos" on storage.objects;
drop policy if exists "public_read_logos" on storage.objects;

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

-- Verificacion storage: no debe aparecer ninguna policy SELECT amplia para logos.
select
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and cmd = 'SELECT'
  and (
    lower(coalesce(qual, '')) in ('true', '(true)')
    or qual ilike '%bucket_id%logos%'
  )
order by policyname;
