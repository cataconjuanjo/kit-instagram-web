-- Inteligencia de inventario: fotos historicas de bodega y detalle por referencia.
-- Complementa kpi_history, alerts y recommendations sin modificar tablas existentes.

create table if not exists public.inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  periodo_inicio timestamptz not null,
  periodo_fin timestamptz not null,
  referencias_activas integer not null default 0,
  unidades_totales integer not null default 0,
  valor_coste_total numeric(14,2) not null default 0,
  valor_venta_total numeric(14,2) not null default 0,
  stock_inmovilizado_refs integer not null default 0,
  stock_inmovilizado_valor numeric(14,2) not null default 0,
  referencias_lentas integer not null default 0,
  exceso_stock_refs integer not null default 0,
  proveedor_principal text,
  proveedor_principal_pct numeric(7,2) not null default 0,
  merma_unidades integer not null default 0,
  tasa_merma_pct numeric(7,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists inventory_snapshots_restaurante_periodo_idx
on public.inventory_snapshots (restaurante_id, periodo_fin desc);

create table if not exists public.inventory_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.inventory_snapshots(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  vino_id uuid not null references public.vinos(id) on delete cascade,
  proveedor text,
  stock_actual integer not null default 0,
  stock_minimo integer not null default 0,
  ventas_unidades integer not null default 0,
  coste_compra numeric(10,2) not null default 0,
  precio_botella numeric(10,2) not null default 0,
  valor_stock_coste numeric(14,2) not null default 0,
  dias_cobertura integer,
  estado_inventario text not null default 'normal' check (estado_inventario in ('normal', 'bajo_minimo', 'inmovilizado', 'lento', 'exceso', 'sin_datos')),
  motivo text,
  created_at timestamptz not null default now()
);

create index if not exists inventory_snapshot_items_snapshot_idx
on public.inventory_snapshot_items (snapshot_id, estado_inventario);

create index if not exists inventory_snapshot_items_restaurante_vino_idx
on public.inventory_snapshot_items (restaurante_id, vino_id, created_at desc);

alter table public.inventory_snapshots enable row level security;
alter table public.inventory_snapshot_items enable row level security;

drop policy if exists "inventory_snapshots_select_owner" on public.inventory_snapshots;
create policy "inventory_snapshots_select_owner"
on public.inventory_snapshots for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = inventory_snapshots.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "inventory_snapshot_items_select_owner" on public.inventory_snapshot_items;
create policy "inventory_snapshot_items_select_owner"
on public.inventory_snapshot_items for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = inventory_snapshot_items.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);
