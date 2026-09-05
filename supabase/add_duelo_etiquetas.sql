-- Feature flag por tienda (activa/desactiva el modo "Duelo a ciegas" sin redeploy)
ALTER TABLE tiendas
  ADD COLUMN IF NOT EXISTS duelo_activo boolean DEFAULT false;

-- Registro de rondas del duelo a ciegas
-- Cada fila = una comparación A/B individual, incluso si el usuario abandona antes de elegir.
-- elegido_id NULL → ronda abandonada sin elegir (p.ej. "Ya tengo mi vino" a mitad de duelo).
CREATE TABLE IF NOT EXISTS kiosko_duelo_rounds (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tienda_id   uuid        NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  session_id  uuid        NOT NULL,   -- UUID generado en cliente al arrancar la sesión
  ronda       smallint    NOT NULL,   -- 1-based; máximo ~50 por guardia contra abuso
  vino_a_id   uuid        NOT NULL,
  vino_b_id   uuid        NOT NULL,
  elegido_id  uuid,                   -- NULL si abandono sin elegir
  filtros     jsonb,                  -- snapshot: { tipo } — null si no hay filtro activo
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índices orientados a los análisis futuros:
-- · ranking de preferencia por vino/D.O./tipo: usar elegido_id + filtros
-- · reconstruir bracket completo de una sesión: usar session_id + ronda
-- · actividad por tienda: tienda_id + created_at
CREATE INDEX IF NOT EXISTS idx_duelo_tienda  ON kiosko_duelo_rounds (tienda_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_duelo_session ON kiosko_duelo_rounds (session_id);
CREATE INDEX IF NOT EXISTS idx_duelo_elegido ON kiosko_duelo_rounds (elegido_id) WHERE elegido_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_duelo_vino_a  ON kiosko_duelo_rounds (vino_a_id);
CREATE INDEX IF NOT EXISTS idx_duelo_vino_b  ON kiosko_duelo_rounds (vino_b_id);
