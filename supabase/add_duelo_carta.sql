-- Duelo de etiquetas — carta pública
-- Aplicar manualmente en Supabase SQL Editor
-- Tabla distinta de kiosko_duelo_rounds (aquella es para tiendas/kiosko)

ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS duelo_activo boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS restaurante_duelo_rounds (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  session_id     uuid NOT NULL,
  ronda          smallint NOT NULL CHECK (ronda BETWEEN 1 AND 50),
  vino_a_id      uuid NOT NULL REFERENCES vinos(id),
  vino_b_id      uuid NOT NULL REFERENCES vinos(id),
  elegido_id     uuid REFERENCES vinos(id),
  filtros        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS restaurante_duelo_rounds_restaurante_fecha_idx
  ON restaurante_duelo_rounds (restaurante_id, created_at DESC);

CREATE INDEX IF NOT EXISTS restaurante_duelo_rounds_session_idx
  ON restaurante_duelo_rounds (session_id);

CREATE INDEX IF NOT EXISTS restaurante_duelo_rounds_elegido_idx
  ON restaurante_duelo_rounds (elegido_id)
  WHERE elegido_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS restaurante_duelo_rounds_vino_a_idx
  ON restaurante_duelo_rounds (vino_a_id);

CREATE INDEX IF NOT EXISTS restaurante_duelo_rounds_vino_b_idx
  ON restaurante_duelo_rounds (vino_b_id);
