-- Importacion TPV / CSV para ventas reales de vino.
-- Ejecutar en Supabase SQL Editor antes de usar /dashboard/tpv.

create table if not exists public.pos_import_batches (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  archivo_nombre text,
  archivo_tipo text,
  archivo_hash text,
  duplicate_of uuid references public.pos_import_batches(id) on delete set null,
  estado text not null default 'importado' check (estado in ('importado', 'error')),
  filas_total integer not null default 0,
  filas_match integer not null default 0,
  filas_revision integer not null default 0,
  filas_sin_match integer not null default 0,
  filas_duplicadas integer not null default 0,
  importe_total numeric(14,2) not null default 0,
  mapping jsonb not null default '{}'::jsonb,
  imported_by uuid default auth.uid(),
  imported_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists pos_import_batches_rest_created_idx
on public.pos_import_batches (restaurante_id, created_at desc);

create table if not exists public.pos_sale_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.pos_import_batches(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  fecha date not null,
  servicio_tipo text not null default 'otro' check (servicio_tipo in ('comida', 'cena', 'otro')),
  producto_original text not null,
  producto_normalizado text not null,
  line_hash text,
  duplicada boolean not null default false,
  duplicate_of uuid references public.pos_sale_lines(id) on delete set null,
  cantidad numeric(10,2) not null default 1,
  importe numeric(14,2) not null default 0,
  precio_unitario numeric(12,2) not null default 0,
  vino_id uuid references public.vinos(id) on delete set null,
  match_confidence_pct numeric(6,2) not null default 0,
  estado_match text not null default 'sin_match' check (estado_match in ('match', 'revision', 'sin_match', 'manual')),
  formato_venta text not null default 'desconocido' check (formato_venta in ('botella', 'copa', 'desconocido')),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pos_sale_lines_batch_idx
on public.pos_sale_lines (batch_id);

create index if not exists pos_sale_lines_rest_fecha_idx
on public.pos_sale_lines (restaurante_id, fecha desc);

create index if not exists pos_sale_lines_vino_idx
on public.pos_sale_lines (restaurante_id, vino_id, fecha desc)
where vino_id is not null;

alter table public.pos_import_batches
  add column if not exists archivo_hash text,
  add column if not exists duplicate_of uuid references public.pos_import_batches(id) on delete set null,
  add column if not exists filas_duplicadas integer not null default 0;

alter table public.pos_sale_lines
  add column if not exists line_hash text,
  add column if not exists duplicada boolean not null default false,
  add column if not exists duplicate_of uuid references public.pos_sale_lines(id) on delete set null;

create unique index if not exists pos_import_batches_rest_hash_idx
on public.pos_import_batches (restaurante_id, archivo_hash)
where archivo_hash is not null;

create index if not exists pos_sale_lines_rest_hash_idx
on public.pos_sale_lines (restaurante_id, line_hash)
where line_hash is not null;

create table if not exists public.wine_aliases (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  vino_id uuid not null references public.vinos(id) on delete cascade,
  alias text not null,
  alias_normalizado text not null,
  origen text not null default 'tpv_import',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wine_aliases_rest_alias_idx
on public.wine_aliases (restaurante_id, alias_normalizado);

create index if not exists wine_aliases_vino_idx
on public.wine_aliases (restaurante_id, vino_id);

alter table public.pos_import_batches enable row level security;
alter table public.pos_sale_lines enable row level security;
alter table public.wine_aliases enable row level security;

drop policy if exists "pos_import_batches_select_owner" on public.pos_import_batches;
create policy "pos_import_batches_select_owner"
on public.pos_import_batches for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = pos_import_batches.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "pos_sale_lines_select_owner" on public.pos_sale_lines;
create policy "pos_sale_lines_select_owner"
on public.pos_sale_lines for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = pos_sale_lines.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "wine_aliases_select_owner" on public.wine_aliases;
create policy "wine_aliases_select_owner"
on public.wine_aliases for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = wine_aliases.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "wine_aliases_insert_owner" on public.wine_aliases;
create policy "wine_aliases_insert_owner"
on public.wine_aliases for insert
with check (
  exists (
    select 1 from public.restaurantes r
    where r.id = wine_aliases.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "wine_aliases_update_owner" on public.wine_aliases;
create policy "wine_aliases_update_owner"
on public.wine_aliases for update
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = wine_aliases.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1 from public.restaurantes r
    where r.id = wine_aliases.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);
