-- Control económico y operativo de bodega para Carta Viva.
-- Ejecutar en Supabase SQL Editor antes de usar la pantalla /dashboard/bodega en producción.

alter table public.vinos
  add column if not exists coste_compra numeric(10,2) default 0,
  add column if not exists stock_minimo integer default 0,
  add column if not exists proveedor text,
  add column if not exists referencia_proveedor text,
  add column if not exists formato_compra text;

alter table public.restaurantes
  add column if not exists camarero_pin text;

create table if not exists public.movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  vino_id uuid not null references public.vinos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'venta', 'merma', 'ajuste', 'cata', 'invitacion')),
  cantidad integer not null,
  stock_anterior integer,
  stock_nuevo integer,
  motivo text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists movimientos_stock_restaurante_created_idx
on public.movimientos_stock (restaurante_id, created_at desc);

alter table public.movimientos_stock enable row level security;

drop policy if exists "movimientos_stock_select" on public.movimientos_stock;
create policy "movimientos_stock_select"
on public.movimientos_stock
for select
using (
  exists (
    select 1
    from public.restaurantes r
    where r.id = movimientos_stock.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "movimientos_stock_insert" on public.movimientos_stock;
create policy "movimientos_stock_insert"
on public.movimientos_stock
for insert
with check (
  exists (
    select 1
    from public.restaurantes r
    where r.id = movimientos_stock.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "movimientos_stock_update" on public.movimientos_stock;
create policy "movimientos_stock_update"
on public.movimientos_stock
for update
using (
  exists (
    select 1
    from public.restaurantes r
    where r.id = movimientos_stock.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1
    from public.restaurantes r
    where r.id = movimientos_stock.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);
