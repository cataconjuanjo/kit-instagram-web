-- Catálogos privados de proveedores para el consultor.
-- Ejecutar en Supabase SQL Editor antes de usar /admin/proveedores.
-- Por defecto no se exponen a restaurantes: el acceso se hace solo desde API admin con service role.

create table if not exists public.proveedores_vino (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  contacto text,
  email text,
  telefono text,
  zona text,
  notas text,
  visible_restaurantes boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proveedor_catalogo_vinos (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores_vino(id) on delete cascade,
  nombre text not null,
  bodega text,
  tipo text,
  region text,
  uva text,
  anada text,
  referencia text,
  formato text,
  coste_estimado numeric(10,2) default 0,
  pvp_recomendado numeric(10,2) default 0,
  disponibilidad text,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proveedores_vino_nombre_idx
on public.proveedores_vino (nombre);

create index if not exists proveedor_catalogo_vinos_proveedor_idx
on public.proveedor_catalogo_vinos (proveedor_id, activo);

alter table public.proveedores_vino enable row level security;
alter table public.proveedor_catalogo_vinos enable row level security;

-- Sin políticas RLS públicas de forma intencionada.
-- El modulo admin usa SUPABASE_SERVICE_ROLE_KEY y valida NEXT_PUBLIC_ADMIN_EMAIL.
