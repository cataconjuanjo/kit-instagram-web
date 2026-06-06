-- Fase 1 consultoria inteligente: historico KPI, alertas, recomendaciones
-- y clasificacion de referencias. No modifica flujos existentes.

create table if not exists public.kpi_history (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  periodo_inicio timestamptz not null,
  periodo_fin timestamptz not null,
  clave text not null,
  nombre text not null,
  valor numeric(14,4) not null default 0,
  unidad text not null default '',
  categoria text not null default 'general',
  fuente text not null default 'motor_consultoria_fase1',
  coeficientes jsonb not null default '{}'::jsonb,
  interpretacion text,
  created_at timestamptz not null default now()
);

create index if not exists kpi_history_restaurante_periodo_idx
on public.kpi_history (restaurante_id, periodo_fin desc, clave);

create table if not exists public.wine_performance (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  vino_id uuid not null references public.vinos(id) on delete cascade,
  periodo_inicio timestamptz not null,
  periodo_fin timestamptz not null,
  ventas_unidades integer not null default 0,
  ingresos_estimados numeric(14,2) not null default 0,
  coste_estimado numeric(14,2) not null default 0,
  beneficio_bruto numeric(14,2) not null default 0,
  margen_bruto_pct numeric(7,2) not null default 0,
  popularidad_pct numeric(7,2) not null default 0,
  rotacion_estimada numeric(10,2) not null default 0,
  stock_actual integer not null default 0,
  valor_stock_coste numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists wine_performance_restaurante_periodo_idx
on public.wine_performance (restaurante_id, periodo_fin desc, vino_id);

create table if not exists public.wine_classifications (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  vino_id uuid not null references public.vinos(id) on delete cascade,
  periodo_inicio timestamptz not null,
  periodo_fin timestamptz not null,
  categoria text not null check (categoria in ('estrella', 'joya', 'caballo', 'revisar')),
  categoria_ingles text not null check (categoria_ingles in ('star', 'puzzle', 'plowhorse', 'dog')),
  margen_bruto_pct numeric(7,2) not null default 0,
  popularidad_pct numeric(7,2) not null default 0,
  umbral_margen_pct numeric(7,2) not null default 0,
  umbral_popularidad_pct numeric(7,2) not null default 0,
  explicacion text,
  acciones jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wine_classifications_restaurante_periodo_idx
on public.wine_classifications (restaurante_id, periodo_fin desc, categoria);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  entidad_tipo text not null default 'restaurante',
  entidad_id uuid,
  severidad text not null check (severidad in ('critica', 'aviso', 'info')),
  clave text not null,
  titulo text not null,
  detalle text not null,
  impacto text,
  accion_sugerida text,
  estado text not null default 'abierta' check (estado in ('abierta', 'en_progreso', 'resuelta', 'descartada')),
  periodo_inicio timestamptz,
  periodo_fin timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alerts_restaurante_estado_idx
on public.alerts (restaurante_id, estado, severidad, created_at desc);

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  entidad_tipo text not null default 'restaurante',
  entidad_id uuid,
  tipo text not null,
  titulo text not null,
  detalle text not null,
  accion text not null,
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  esfuerzo text not null default 'medio' check (esfuerzo in ('bajo', 'medio', 'alto')),
  origen text not null default 'motor_consultoria_fase1',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_progreso', 'hecha', 'descartada')),
  coeficientes jsonb not null default '{}'::jsonb,
  periodo_inicio timestamptz,
  periodo_fin timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recommendations_restaurante_estado_idx
on public.recommendations (restaurante_id, estado, prioridad, created_at desc);

alter table public.kpi_history enable row level security;
alter table public.wine_performance enable row level security;
alter table public.wine_classifications enable row level security;
alter table public.alerts enable row level security;
alter table public.recommendations enable row level security;

-- Acceso lectura para el restaurante propietario. Las escrituras se realizan
-- desde API con service role tras validar usuario/admin.

drop policy if exists "kpi_history_select_owner" on public.kpi_history;
create policy "kpi_history_select_owner"
on public.kpi_history for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = kpi_history.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "wine_performance_select_owner" on public.wine_performance;
create policy "wine_performance_select_owner"
on public.wine_performance for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = wine_performance.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "wine_classifications_select_owner" on public.wine_classifications;
create policy "wine_classifications_select_owner"
on public.wine_classifications for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = wine_classifications.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "alerts_select_owner" on public.alerts;
create policy "alerts_select_owner"
on public.alerts for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = alerts.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "recommendations_select_owner" on public.recommendations;
create policy "recommendations_select_owner"
on public.recommendations for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = recommendations.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);
