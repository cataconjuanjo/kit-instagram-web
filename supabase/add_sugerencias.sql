-- Buzon privado de sugerencias de restaurantes.
-- Ejecutar en Supabase Dashboard -> SQL Editor antes de publicar la pantalla.

create table if not exists public.sugerencias_restaurante (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  user_id uuid not null,
  user_email text not null,
  tipo text not null default 'mejora'
    check (tipo in ('mejora', 'problema', 'nueva_funcion', 'otro')),
  mensaje text not null,
  pagina text,
  estado text not null default 'nueva'
    check (estado in ('nueva', 'revisando', 'resuelta', 'descartada')),
  respuesta_interna text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sugerencias_restaurante_created_idx
on public.sugerencias_restaurante (created_at desc);

create index if not exists sugerencias_restaurante_restaurante_idx
on public.sugerencias_restaurante (restaurante_id, created_at desc);

alter table public.sugerencias_restaurante enable row level security;

-- El acceso se realiza solo desde /api/sugerencias con service_role.
-- No se exponen sugerencias directamente al navegador.
