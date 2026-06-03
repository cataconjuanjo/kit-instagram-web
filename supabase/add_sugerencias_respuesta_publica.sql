-- Respuesta visible para restaurantes en el buzon de sugerencias.
-- Ejecutar en Supabase Dashboard -> SQL Editor antes de usar el historial publico.

alter table public.sugerencias_restaurante
  add column if not exists respuesta_publica text;

