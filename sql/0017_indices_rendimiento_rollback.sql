-- Rollback de 0017_indices_rendimiento.sql
-- Elimina solo los índices que crea la migración. No ejecuta ANALYZE.

DROP INDEX IF EXISTS public.estadisticas_rest_created_idx;
DROP INDEX IF EXISTS public.estadisticas_rest_tipo_created_idx;
