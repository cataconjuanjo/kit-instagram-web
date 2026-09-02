-- Función para fusión atómica de pasos en cierres_servicio.
-- Usa el operador || de JSONB para que el merge sea una sola sentencia SQL,
-- sin necesidad de leer-antes-de-escribir en la aplicación.
create or replace function public.merge_cierre_pasos(
  p_restaurante_id uuid,
  p_fecha_servicio date,
  p_pasos jsonb
) returns jsonb
language sql
security definer
set search_path = public
as $$
  update cierres_servicio
  set pasos = pasos || p_pasos,
      updated_at = now()
  where restaurante_id = p_restaurante_id
    and fecha_servicio = p_fecha_servicio
  returning pasos;
$$;
