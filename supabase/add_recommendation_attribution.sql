-- Atribucion de recomendaciones: exposiciones y resultados.
-- Permite medir que vino se recomendo, si salio y con que confianza.

create table if not exists public.recommendation_exposures (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  recommendation_id text not null,
  grupo_recomendacion_id text,
  source_event_id uuid references public.estadisticas(id) on delete set null,
  origen text not null default 'camarero' check (origen in ('cliente', 'camarero', 'consultor', 'simulador', 'sistema')),
  vino_id uuid references public.vinos(id) on delete set null,
  vino_nombre text,
  plato_id uuid references public.platos(id) on delete set null,
  consulta text,
  etiqueta text,
  posicion integer,
  servicio_fecha date not null default current_date,
  servicio_tipo text not null default 'otro' check (servicio_tipo in ('comida', 'cena', 'otro')),
  precio_botella_snapshot numeric(10,2) not null default 0,
  precio_copa_snapshot numeric(10,2) not null default 0,
  coste_snapshot numeric(10,2) not null default 0,
  stock_snapshot integer not null default 0,
  margen_snapshot_pct numeric(7,2) not null default 0,
  maridaje_score numeric(10,2) not null default 0,
  maridaje_estado text not null default 'sin_dato' check (maridaje_estado in ('fuerte', 'valido', 'debil', 'incompatible', 'sin_dato')),
  score_comercial numeric(10,2) not null default 0,
  confidence_base_pct numeric(7,2) not null default 0,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists recommendation_exposures_rest_rec_idx
on public.recommendation_exposures (restaurante_id, recommendation_id);

create unique index if not exists recommendation_exposures_source_event_idx
on public.recommendation_exposures (source_event_id)
where source_event_id is not null;

create index if not exists recommendation_exposures_rest_fecha_idx
on public.recommendation_exposures (restaurante_id, servicio_fecha desc, created_at desc);

create index if not exists recommendation_exposures_vino_idx
on public.recommendation_exposures (restaurante_id, vino_id, created_at desc);

create table if not exists public.recommendation_outcomes (
  id uuid primary key default gen_random_uuid(),
  exposure_id uuid references public.recommendation_exposures(id) on delete set null,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  recommendation_id text,
  grupo_recomendacion_id text,
  source_event_id uuid references public.estadisticas(id) on delete set null,
  source_pos_sale_line_id uuid,
  source_pos_import_batch_id uuid,
  vino_id uuid references public.vinos(id) on delete set null,
  vino_nombre text,
  estado text not null default 'sin_resolver' check (estado in ('vendida_confirmada', 'vendida_probable', 'venta_posible', 'no_vendida', 'rechazada', 'sin_stock', 'sin_resolver')),
  fuente text not null default 'motor_inferido' check (fuente in ('camarero', 'cierre', 'stock', 'tpv', 'importacion', 'motor_inferido')),
  cantidad numeric(10,2) not null default 1,
  formato_venta text not null default 'desconocido' check (formato_venta in ('botella', 'copa', 'desconocido')),
  importe_estimado numeric(14,2) not null default 0,
  confidence_pct numeric(7,2) not null default 0,
  servicio_fecha date not null default current_date,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists recommendation_outcomes_source_event_idx
on public.recommendation_outcomes (source_event_id)
where source_event_id is not null;

alter table public.recommendation_outcomes
add column if not exists source_pos_sale_line_id uuid;

alter table public.recommendation_outcomes
add column if not exists source_pos_import_batch_id uuid;

create index if not exists recommendation_outcomes_rest_fecha_idx
on public.recommendation_outcomes (restaurante_id, servicio_fecha desc, created_at desc);

create index if not exists recommendation_outcomes_rec_idx
on public.recommendation_outcomes (restaurante_id, recommendation_id, created_at desc);

create index if not exists recommendation_outcomes_pos_line_idx
on public.recommendation_outcomes (restaurante_id, source_pos_sale_line_id)
where source_pos_sale_line_id is not null;

create index if not exists recommendation_outcomes_pos_batch_idx
on public.recommendation_outcomes (restaurante_id, source_pos_import_batch_id, created_at desc)
where source_pos_import_batch_id is not null;

alter table public.recommendation_exposures enable row level security;
alter table public.recommendation_outcomes enable row level security;

drop policy if exists "recommendation_exposures_select_owner" on public.recommendation_exposures;
create policy "recommendation_exposures_select_owner"
on public.recommendation_exposures for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = recommendation_exposures.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "recommendation_outcomes_select_owner" on public.recommendation_outcomes;
create policy "recommendation_outcomes_select_owner"
on public.recommendation_outcomes for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = recommendation_outcomes.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

-- Las escrituras se hacen desde APIs con service_role tras validar acceso.
