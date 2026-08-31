-- Migration: add origen column to carta_simulacion
-- Tracks whether a line was added manually or via automatic suggestion.
-- null = pre-existing / añadido a mano (implícito)
-- 'sugerido_gap'         = añadido por sugerencia automática para cubrir un hueco (señal Fase A)
-- 'sugerido_sustitucion' = añadido por sugerencia automática como sustitución (señal Fase B)
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE public.carta_simulacion ADD COLUMN IF NOT EXISTS origen text;
