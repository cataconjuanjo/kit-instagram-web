-- Tabla para que el restaurante envíe su borrador de simulador al consultor
-- y el consultor pueda responder antes de publicar.
--
-- Flujo:
--   restaurante inserta fila (estado='pendiente') → email a consultor
--   consultor responde via PATCH → estado='revisado'
--   restaurante ve respuesta y desbloquea el borrador para seguir editando

CREATE TABLE IF NOT EXISTS simulador_revisiones (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  uuid        NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  estado          text        NOT NULL DEFAULT 'pendiente'
                              CHECK (estado IN ('pendiente', 'revisado')),
  mensaje_restaurante  text,
  respuesta_consultor  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Solo puede haber una revisión pendiente por restaurante a la vez
CREATE UNIQUE INDEX IF NOT EXISTS idx_simulador_revisiones_activa
  ON simulador_revisiones(restaurante_id)
  WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_simulador_revisiones_restaurante
  ON simulador_revisiones(restaurante_id);

ALTER TABLE simulador_revisiones ENABLE ROW LEVEL SECURITY;
