-- 0010_carta_enlace.sql
-- Bloque 10: enlace de la tabla vinos (carta restaurante) al catálogo canónico.
-- Expand-only: ADD COLUMN. Sin DROP ni DELETE.
--
-- Una sola pasada — solo DDL.

ALTER TABLE vinos
  ADD COLUMN IF NOT EXISTS vino_anada_id uuid REFERENCES vino_anada(id),
  ADD COLUMN IF NOT EXISTS oferta_id     uuid REFERENCES oferta(id);

CREATE INDEX IF NOT EXISTS vinos_vino_anada_id_idx
  ON vinos (vino_anada_id)
  WHERE vino_anada_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS vinos_oferta_id_idx
  ON vinos (oferta_id)
  WHERE oferta_id IS NOT NULL;
