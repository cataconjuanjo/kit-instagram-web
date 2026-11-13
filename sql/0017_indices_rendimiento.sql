-- 0017_indices_rendimiento.sql
--
-- Dos índices btree sobre public.estadisticas para acelerar las consultas
-- más frecuentes del panel:
--   - aplicarVentana por (restaurante_id, created_at) — usada por Inicio,
--     Sala > Parte, Cierre, Radar diario, Resumen semanal, Sala > Actividad.
--   - filtros por tipo + rango created_at — usados por el fetch de ventas
--     30 d en Inicio, por el cálculo de prioridades y por el backlog de
--     recomendaciones.
--
-- Idempotente (IF NOT EXISTS). Añadir índices con DEFAULT no requiere
-- reescribir la tabla en PG 11+, pero sí bloquea DML brevemente. Si en
-- producción quieres cero bloqueo, cambia a CREATE INDEX CONCURRENTLY
-- (fuera de transacción) desde el SQL Editor de Supabase.
--
-- Aplicar:   psql "$DATABASE_URL" -f sql/0017_indices_rendimiento.sql
-- Rollback:  psql "$DATABASE_URL" -f sql/0017_indices_rendimiento_rollback.sql

CREATE INDEX IF NOT EXISTS estadisticas_rest_created_idx
  ON public.estadisticas (restaurante_id, created_at DESC);

CREATE INDEX IF NOT EXISTS estadisticas_rest_tipo_created_idx
  ON public.estadisticas (restaurante_id, tipo, created_at DESC);

-- Refresca las estadísticas del planner para que aproveche los nuevos
-- índices desde la primera consulta.
ANALYZE public.estadisticas;
