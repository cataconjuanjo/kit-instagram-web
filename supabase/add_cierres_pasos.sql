-- Añade desglose por paso al cierre de servicio: quién completó cada paso y cuándo.
-- Registros previos sin este campo leen pasos = {} (ningún paso con autoría) sin romper nada.
alter table public.cierres_servicio
  add column if not exists pasos jsonb not null default '{}'::jsonb;

comment on column public.cierres_servicio.pasos is
  'Autoría por paso del checklist de cierre. { [paso_id]: { completado_por_email, completado_por_nombre, completado_en } | null }';
