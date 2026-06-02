-- Telemetria de consumo Anthropic para controlar el coste variable por restaurante.
-- Ejecutar en Supabase Dashboard -> SQL Editor.

create table if not exists public.consumos_ia (
  id uuid default gen_random_uuid() primary key,
  restaurante_id uuid references public.restaurantes(id) on delete cascade,
  endpoint text not null,
  modelo text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  coste_estimado_usd numeric(12, 6) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists consumos_ia_restaurante_created_idx
on public.consumos_ia (restaurante_id, created_at desc);

create index if not exists consumos_ia_endpoint_created_idx
on public.consumos_ia (endpoint, created_at desc);

alter table public.consumos_ia enable row level security;

-- Se registra y consulta solo desde rutas de servidor con service_role.
-- No se exponen consumos directamente al navegador.
