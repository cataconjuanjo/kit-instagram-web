-- Motor de alertas avanzado: estados, deduplicacion e historial.

alter table public.alerts
  add column if not exists resuelta_at timestamptz,
  add column if not exists descartada_at timestamptz,
  add column if not exists motivo_cierre text,
  add column if not exists asignado_a text,
  add column if not exists ultima_deteccion_at timestamptz,
  add column if not exists veces_detectada integer not null default 1;

create index if not exists alerts_dedupe_idx
on public.alerts (restaurante_id, clave, entidad_tipo, entidad_id, estado);

create table if not exists public.alert_history (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.alerts(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  accion text not null,
  estado_anterior text,
  estado_nuevo text,
  comentario text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists alert_history_alert_idx
on public.alert_history (alert_id, created_at desc);

create index if not exists alert_history_restaurante_idx
on public.alert_history (restaurante_id, created_at desc);

alter table public.alert_history enable row level security;

drop policy if exists "alert_history_select_owner" on public.alert_history;
create policy "alert_history_select_owner"
on public.alert_history for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = alert_history.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);
