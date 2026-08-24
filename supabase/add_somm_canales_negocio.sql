-- Gap 11: 4 líneas de negocio en parametros_explotacion
-- Ejecutar en Supabase SQL Editor

alter table public.parametros_explotacion
  add column if not exists canales_negocio jsonb not null default '{}';
