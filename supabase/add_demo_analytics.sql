-- Embudo anonimo de demos comerciales de Carta Viva.
-- Ejecutar en Supabase Dashboard -> SQL Editor antes de usar /admin/demo.

create table if not exists public.demo_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event text not null
    check (event in (
      'demo_page_view',
      'demo_start',
      'demo_role_open',
      'demo_contact_click',
      'demo_landing_click'
    )),
  demo text not null default 'taberna-del-puerto'
    check (demo in ('taberna-del-puerto', 'sumiller')),
  role text not null default ''
    check (role in ('', 'cliente', 'camarero', 'gerente', 'contacto', 'landing')),
  source text,
  target text,
  path text,
  device_class text not null default 'unknown'
    check (device_class in ('mobile', 'tablet', 'desktop', 'unknown')),
  created_at timestamptz not null default now()
);

create index if not exists demo_analytics_events_demo_created_idx
on public.demo_analytics_events (demo, created_at desc);

create index if not exists demo_analytics_events_event_created_idx
on public.demo_analytics_events (event, created_at desc);

create index if not exists demo_analytics_events_role_created_idx
on public.demo_analytics_events (role, created_at desc);

alter table public.demo_analytics_events enable row level security;

-- El acceso se realiza solo desde APIs con service_role.
-- No hay politicas publicas de select/insert directo desde el navegador.
