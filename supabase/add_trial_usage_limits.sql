-- Limites de prueba por horas efectivas de uso.
-- Ejecutar en Supabase Dashboard -> SQL Editor.

alter table public.restaurantes
  add column if not exists trial_active_seconds_limit integer,
  add column if not exists trial_expires_at timestamptz,
  add column if not exists trial_started_at timestamptz;

comment on column public.restaurantes.trial_active_seconds_limit is
  'Segundos efectivos incluidos en la prueba. NULL o 0 significa sin limite por uso.';

comment on column public.restaurantes.trial_expires_at is
  'Fecha maxima de validez de la prueba, aunque queden segundos efectivos.';

comment on column public.restaurantes.trial_started_at is
  'Fecha de inicio administrativa de la prueba por uso efectivo.';

create index if not exists restaurantes_trial_expires_idx
on public.restaurantes (trial_expires_at)
where trial_expires_at is not null;
