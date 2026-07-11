-- Motor de venta por copa: candidatos, simulacion economica y oportunidad por referencia.
-- BTG se expresa en la app como "venta por copa".

create table if not exists public.btg_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  periodo_inicio timestamptz not null,
  periodo_fin timestamptz not null,
  referencias_activas integer not null default 0,
  referencias_por_copa integer not null default 0,
  cobertura_copa_pct numeric(7,2) not null default 0,
  candidatos_copa integer not null default 0,
  candidatos_copa_premium integer not null default 0,
  candidatos_coravin integer not null default 0,
  beneficio_potencial_estimado numeric(14,2) not null default 0,
  motivo_principal text,
  created_at timestamptz not null default now()
);

create index if not exists btg_snapshots_restaurante_periodo_idx
on public.btg_snapshots (restaurante_id, periodo_fin desc);

create table if not exists public.btg_candidates (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.btg_snapshots(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  vino_id uuid not null references public.vinos(id) on delete cascade,
  nombre text,
  bodega text,
  tipo text,
  region text,
  categoria_copa text not null check (categoria_copa in ('copa', 'copa_premium', 'coravin')),
  score_copa numeric(7,2) not null default 0,
  coste_botella numeric(10,2) not null default 0,
  pvp_botella numeric(10,2) not null default 0,
  precio_copa_actual numeric(10,2) not null default 0,
  precio_copa_sugerido numeric(10,2) not null default 0,
  copas_por_botella integer not null default 5,
  merma_pct numeric(7,2) not null default 10,
  ingresos_por_botella_copa numeric(14,2) not null default 0,
  beneficio_por_botella_copa numeric(14,2) not null default 0,
  margen_copa_pct numeric(7,2) not null default 0,
  riesgo_apertura text not null default 'medio' check (riesgo_apertura in ('bajo', 'medio', 'alto')),
  motivo text,
  accion text,
  created_at timestamptz not null default now()
);

create index if not exists btg_candidates_snapshot_idx
on public.btg_candidates (snapshot_id, categoria_copa, score_copa desc);

create index if not exists btg_candidates_restaurante_vino_idx
on public.btg_candidates (restaurante_id, vino_id, created_at desc);

alter table public.btg_snapshots enable row level security;
alter table public.btg_candidates enable row level security;

drop policy if exists "btg_snapshots_select_owner" on public.btg_snapshots;
create policy "btg_snapshots_select_owner"
on public.btg_snapshots for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = btg_snapshots.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);

drop policy if exists "btg_candidates_select_owner" on public.btg_candidates;
create policy "btg_candidates_select_owner"
on public.btg_candidates for select
using (
  exists (
    select 1 from public.restaurantes r
    where r.id = btg_candidates.restaurante_id
      and r.email = (auth.jwt() ->> 'email')
  )
);
