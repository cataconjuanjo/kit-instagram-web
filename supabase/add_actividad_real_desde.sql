-- Fecha de arranque real de la actividad del restaurante.
-- Ejecutar en Supabase Dashboard -> SQL Editor.
--
-- Mientras actividad_real_desde sea null, las pantallas operativas pueden mostrar
-- datos vacios o solo pruebas, pero no deberian tomar decisiones comerciales
-- con historico anterior al arranque.

alter table public.restaurantes
  add column if not exists actividad_real_desde timestamptz;
