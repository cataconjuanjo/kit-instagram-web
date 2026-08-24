-- Carta Viva Somm — Migración completa del tier SUMILLER.
-- Ejecutar en Supabase SQL Editor para activar todas las funcionalidades Somm.

-- ── 1. COLUMNAS NUEVAS EN VINOS ───────────────────────────────────────────────

alter table public.vinos
  add column if not exists zona_bodega text,        -- 'Almacen'|'Cava1'|'Cava2'|'Cava3'
  add column if not exists balda_codigo text,
  add column if not exists usa_coravin boolean default false;

-- ── 2. COLUMNAS NUEVAS EN MOVIMIENTOS_STOCK ───────────────────────────────────

alter table public.movimientos_stock
  add column if not exists coste_medio_ponderado numeric(10,4);

-- Ampliar el CHECK de tipo para incluir los nuevos tipos de salida Somm
alter table public.movimientos_stock drop constraint if exists movimientos_stock_tipo_check;
alter table public.movimientos_stock add constraint movimientos_stock_tipo_check
  check (tipo in (
    'entrada', 'venta', 'merma', 'ajuste', 'cata', 'invitacion',
    'cocina', 'grupo_evento', 'maridaje', 'rotura'
  ));

-- ── 3. CONFIGURACION_PRICING ─────────────────────────────────────────────────

create table if not exists public.configuracion_pricing (
  restaurante_id uuid primary key references public.restaurantes(id) on delete cascade,
  metodo_pvp text not null default 'multiplicador'
    check (metodo_pvp in ('multiplicador', 'descorche')),
  descorche_fijo numeric(8,2) not null default 9.00,
  pvp_minimo_copa numeric(8,2) not null default 4.50,
  updated_at timestamptz not null default now()
);

alter table public.configuracion_pricing enable row level security;

drop policy if exists "configuracion_pricing_select" on public.configuracion_pricing;
create policy "configuracion_pricing_select" on public.configuracion_pricing
  for select using (
    exists (select 1 from public.restaurantes r
      where r.id = configuracion_pricing.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  );

drop policy if exists "configuracion_pricing_upsert" on public.configuracion_pricing;
create policy "configuracion_pricing_upsert" on public.configuracion_pricing
  for all using (
    exists (select 1 from public.restaurantes r
      where r.id = configuracion_pricing.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  ) with check (
    exists (select 1 from public.restaurantes r
      where r.id = configuracion_pricing.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  );

-- ── 4. TRAMOS_MULTIPLICADOR ──────────────────────────────────────────────────

create table if not exists public.tramos_multiplicador (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  coste_min numeric(10,2) not null,
  coste_max numeric(10,2),           -- null = sin límite superior
  factor numeric(5,3) not null,
  pvp_minimo_carta numeric(8,2),
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists tramos_multiplicador_restaurante_idx
  on public.tramos_multiplicador (restaurante_id, orden);

alter table public.tramos_multiplicador enable row level security;

drop policy if exists "tramos_multiplicador_select" on public.tramos_multiplicador;
create policy "tramos_multiplicador_select" on public.tramos_multiplicador
  for select using (
    exists (select 1 from public.restaurantes r
      where r.id = tramos_multiplicador.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  );

drop policy if exists "tramos_multiplicador_all" on public.tramos_multiplicador;
create policy "tramos_multiplicador_all" on public.tramos_multiplicador
  for all using (
    exists (select 1 from public.restaurantes r
      where r.id = tramos_multiplicador.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  ) with check (
    exists (select 1 from public.restaurantes r
      where r.id = tramos_multiplicador.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  );

-- ── 5. PARAMETROS_EXPLOTACION ────────────────────────────────────────────────

create table if not exists public.parametros_explotacion (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  periodo text not null,                     -- 'YYYY-MM'
  -- Facturación del periodo (introducida manualmente o desde cierre)
  facturacion_total numeric(12,2) default 0,
  consumo_mp numeric(12,2) default 0,        -- materia prima consumida
  -- Personal (desglose completo — Gap 20)
  nominas_brutas numeric(12,2) default 0,
  ss_empresa numeric(12,2) default 0,
  retenciones_irpf numeric(12,2) default 0,
  extras_personal numeric(12,2) default 0,
  -- Gastos operacionales (JSONB: [{id, categoria, importe, amortizar_meses}]) — Gap 22
  partidas_gastos jsonb not null default '[]',
  -- Alquileres (JSONB: [{id, concepto, importe}]) — Gap 22
  partidas_alquiler jsonb not null default '[]',
  -- Gastos bancarios — Gap 22
  comisiones_datafono numeric(12,2) default 0,
  mantenimiento_datafono numeric(12,2) default 0,
  resto_comisiones numeric(12,2) default 0,
  -- Parámetros del simulador de multiplicador — Gap 8
  beneficio_objetivo numeric(12,2) default 0,
  ventas_previstas numeric(12,2) default 0,
  updated_at timestamptz not null default now(),
  unique (restaurante_id, periodo)
);

create index if not exists parametros_explotacion_restaurante_periodo_idx
  on public.parametros_explotacion (restaurante_id, periodo desc);

alter table public.parametros_explotacion enable row level security;

drop policy if exists "parametros_explotacion_select" on public.parametros_explotacion;
create policy "parametros_explotacion_select" on public.parametros_explotacion
  for select using (
    exists (select 1 from public.restaurantes r
      where r.id = parametros_explotacion.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  );

drop policy if exists "parametros_explotacion_all" on public.parametros_explotacion;
create policy "parametros_explotacion_all" on public.parametros_explotacion
  for all using (
    exists (select 1 from public.restaurantes r
      where r.id = parametros_explotacion.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  ) with check (
    exists (select 1 from public.restaurantes r
      where r.id = parametros_explotacion.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  );

-- ── 6. LIBRO_COMPRAS ─────────────────────────────────────────────────────────

create table if not exists public.libro_compras (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  periodo text not null,                     -- 'YYYY-MM'
  proveedor text not null,
  -- Facturas del mes como array JSONB: [{fecha, importe, albaran, concepto}]
  facturas jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurante_id, periodo, proveedor)
);

create index if not exists libro_compras_restaurante_periodo_idx
  on public.libro_compras (restaurante_id, periodo desc);

alter table public.libro_compras enable row level security;

drop policy if exists "libro_compras_select" on public.libro_compras;
create policy "libro_compras_select" on public.libro_compras
  for select using (
    exists (select 1 from public.restaurantes r
      where r.id = libro_compras.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  );

drop policy if exists "libro_compras_all" on public.libro_compras;
create policy "libro_compras_all" on public.libro_compras
  for all using (
    exists (select 1 from public.restaurantes r
      where r.id = libro_compras.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  ) with check (
    exists (select 1 from public.restaurantes r
      where r.id = libro_compras.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  );

-- ── 7. PRESUPUESTO_MENSUAL ───────────────────────────────────────────────────

create table if not exists public.presupuesto_mensual (
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  objetivo_facturacion numeric(12,2),
  objetivo_mp_pct numeric(5,2),
  objetivo_margen_pct numeric(5,2),
  -- Modo YoY automático
  anio_base integer,
  factor_crecimiento_pct numeric(5,2),
  primary key (restaurante_id, anio, mes)
);

alter table public.presupuesto_mensual enable row level security;

drop policy if exists "presupuesto_mensual_select" on public.presupuesto_mensual;
create policy "presupuesto_mensual_select" on public.presupuesto_mensual
  for select using (
    exists (select 1 from public.restaurantes r
      where r.id = presupuesto_mensual.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  );

drop policy if exists "presupuesto_mensual_all" on public.presupuesto_mensual;
create policy "presupuesto_mensual_all" on public.presupuesto_mensual
  for all using (
    exists (select 1 from public.restaurantes r
      where r.id = presupuesto_mensual.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  ) with check (
    exists (select 1 from public.restaurantes r
      where r.id = presupuesto_mensual.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  );

-- ── 8. CONFIGURACION_BONUS ───────────────────────────────────────────────────

create table if not exists public.configuracion_bonus (
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  anio integer not null,
  umbral_crecimiento_pct numeric(5,2) not null default 10,
  bonus_pct numeric(5,2) not null default 5,
  activo boolean not null default true,
  primary key (restaurante_id, anio)
);

alter table public.configuracion_bonus enable row level security;

drop policy if exists "configuracion_bonus_select" on public.configuracion_bonus;
create policy "configuracion_bonus_select" on public.configuracion_bonus
  for select using (
    exists (select 1 from public.restaurantes r
      where r.id = configuracion_bonus.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  );

drop policy if exists "configuracion_bonus_all" on public.configuracion_bonus;
create policy "configuracion_bonus_all" on public.configuracion_bonus
  for all using (
    exists (select 1 from public.restaurantes r
      where r.id = configuracion_bonus.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  ) with check (
    exists (select 1 from public.restaurantes r
      where r.id = configuracion_bonus.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  );

-- ── 9. HISTORICO_MENSUAL ─────────────────────────────────────────────────────

create table if not exists public.historico_mensual (
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  anio integer not null,
  mes integer not null check (mes between 1 and 12),
  ingresos numeric(12,2) not null default 0,
  consumo_mp numeric(12,2) not null default 0,
  gastos_fijos numeric(12,2) not null default 0,
  margen_explotacion numeric(12,2) generated always as (
    ingresos - consumo_mp - gastos_fijos
  ) stored,
  primary key (restaurante_id, anio, mes)
);

create index if not exists historico_mensual_restaurante_idx
  on public.historico_mensual (restaurante_id, anio, mes);

alter table public.historico_mensual enable row level security;

drop policy if exists "historico_mensual_select" on public.historico_mensual;
create policy "historico_mensual_select" on public.historico_mensual
  for select using (
    exists (select 1 from public.restaurantes r
      where r.id = historico_mensual.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  );

drop policy if exists "historico_mensual_all" on public.historico_mensual;
create policy "historico_mensual_all" on public.historico_mensual
  for all using (
    exists (select 1 from public.restaurantes r
      where r.id = historico_mensual.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  ) with check (
    exists (select 1 from public.restaurantes r
      where r.id = historico_mensual.restaurante_id
        and r.email = (auth.jwt() ->> 'email'))
  );

-- ── 10. SUMILLER_RESTAURANTES (Multi-restaurante, Gap 7) ─────────────────────
-- Permite a una cuenta sumiller gestionar hasta 3 establecimientos.
-- El campo 'email_sumiller' es el email de la cuenta principal (auth.email).

create table if not exists public.sumiller_restaurantes (
  id uuid primary key default gen_random_uuid(),
  email_sumiller text not null,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  nombre_alias text,   -- nombre abreviado para el selector (ej: "El Bodeguero")
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  unique (email_sumiller, restaurante_id)
);

create index if not exists sumiller_restaurantes_email_idx
  on public.sumiller_restaurantes (email_sumiller, orden);

alter table public.sumiller_restaurantes enable row level security;

drop policy if exists "sumiller_restaurantes_select" on public.sumiller_restaurantes;
create policy "sumiller_restaurantes_select" on public.sumiller_restaurantes
  for select using (email_sumiller = (auth.jwt() ->> 'email'));

drop policy if exists "sumiller_restaurantes_all" on public.sumiller_restaurantes;
create policy "sumiller_restaurantes_all" on public.sumiller_restaurantes
  for all using (email_sumiller = (auth.jwt() ->> 'email'))
  with check (email_sumiller = (auth.jwt() ->> 'email'));
