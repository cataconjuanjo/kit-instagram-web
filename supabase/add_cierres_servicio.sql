-- Cierres diarios compartidos entre los responsables del restaurante.
-- Ejecutar en Supabase Dashboard -> SQL Editor antes de publicar la mejora.

create table if not exists public.cierres_servicio (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  fecha_servicio date not null default current_date,
  eventos_revisados jsonb not null default '[]'::jsonb,
  cerrado boolean not null default false,
  cerrado_por uuid,
  cerrado_por_email text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurante_id, fecha_servicio)
);

create index if not exists cierres_servicio_restaurante_fecha_idx
on public.cierres_servicio (restaurante_id, fecha_servicio desc);

alter table public.cierres_servicio enable row level security;

-- El acceso se realiza solo desde /api/cierres-servicio con service_role.
-- No se exponen cierres directamente al navegador.
