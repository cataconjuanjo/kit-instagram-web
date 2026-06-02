-- Propuestas del consultor para convertir Carta Viva en canal recurrente de consultoría.
-- Ejecutar en Supabase SQL Editor antes de usar /admin/propuestas.

create table if not exists public.consultor_propuestas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  titulo text not null,
  vino text,
  tipo text,
  zona text,
  proveedor_sugerido text,
  coste_estimado numeric(10,2) default 0,
  precio_recomendado numeric(10,2) default 0,
  margen_objetivo integer default 0,
  plato_objetivo text,
  motivo text,
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  estado text not null default 'propuesta' check (estado in ('propuesta', 'interesa', 'descartada', 'incorporada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.consultor_propuestas enable row level security;

-- Sin políticas públicas. add_dashboard_policies.sql concede acceso autenticado
-- por propietario o admin después de crear la tabla.
