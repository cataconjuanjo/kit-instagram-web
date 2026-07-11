-- Inteligencia de carta: productividad, Pareto, huecos de precio y eficiencia de gamas.
-- No modifica tablas existentes.

create table if not exists public.wine_list_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  periodo_inicio timestamptz not null,
  periodo_fin timestamptz not null,
  referencias_total integer not null default 0,
  referencias_con_venta integer not null default 0,
  ventas_totales integer not null default 0,
  pareto_top20_refs integer not null default 0,
  pareto_top20_ventas_pct numeric(7,2) not null default 0,
  bottom10_refs integer not null default 0,
  productividad_media numeric(7,2) not null default 0,
  huecos_precio jsonb not null default '[]'::jsonb,
  resumen_gamas jsonb not null default '[]'::jsonb,
  concentracion_tipos jsonb not null default '{}'::jsonb,
  concentracion_regiones jsonb not null default '{}'::jsonb,
  carta_inflada boolean not null default false,
  motivo_principal text,
  created_at timestamptz not null default now()
);

create index if not exists wine_list_snapshots_restaurante_periodo_idx
on public.wine_list_snapshots (restaurante_id, periodo_fin desc);

create table if not exists public.wine_list_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.wine_list_snapshots(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  vino_id uuid not null references public.vinos(id) on delete cascade,
  nombre text,
  bodega text,
  tipo text,
  region text,
  gama text,
  precio_botella numeric(10,2) not null default 0,
  ventas_unidades integer not null default 0,
  margen_bruto_pct numeric(7,2) not null default 0,
  popularidad_pct numeric(7,2) not null default 0,
  productividad_score numeric(7,2) not null default 0,
  valor_stock_coste numeric(14,2) not null default 0,
  es_top20 boolean not null default false,
  es_bottom10 boolean not null default false,
  motivo text,
  created_at timestamptz not null default now()
);

create index if not exists wine_list_snapshot_items_snapshot_idx
on public.wine_list_snapshot_items (snapshot_id, es_bottom10, es_top20);

create index if not exists wine_list_snapshot_items_restaurante_vino_idx
on public.wine_list_snapshot_items (restaurante_id, vino_id, created_at desc);

alter table public.wine_list_snapshots enable row level security;
alter table public.wine_list_snapshot_items enable row level security;

drop policy if exists "wine_list_snapshots_select_owner" on public.wine_list_snapshots;
create policy "wine_list_snapshots_select_owner"
on public.wine_list_snapshots for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = wine_list_snapshots.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "wine_list_snapshot_items_select_owner" on public.wine_list_snapshot_items;
create policy "wine_list_snapshot_items_select_owner"
on public.wine_list_snapshot_items for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = wine_list_snapshot_items.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);
