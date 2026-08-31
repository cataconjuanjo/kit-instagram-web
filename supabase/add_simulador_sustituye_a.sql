-- Fase B · Pieza 1: emparejamiento visual de sustituciones en el simulador
--
-- El campo sustituye_a en una línea 'nuevo' apunta al id de la línea 'fuera'
-- que reemplaza. Permite ordenar y renderizar ambas filas juntas en la UI.
-- ON DELETE SET NULL: si el vino original se borra de la simulación, el
-- sustituto queda desvinculado pero permanece en el borrador.

ALTER TABLE carta_simulacion
  ADD COLUMN IF NOT EXISTS sustituye_a uuid
    REFERENCES carta_simulacion(id) ON DELETE SET NULL;

-- Índice para buscar sustitutos por la línea que apuntan (join en render)
CREATE INDEX IF NOT EXISTS idx_carta_simulacion_sustituye_a
  ON carta_simulacion(sustituye_a)
  WHERE sustituye_a IS NOT NULL;
