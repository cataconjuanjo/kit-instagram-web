-- 0010_carta_enlace_rollback.sql
-- Deshace la migración 0010_carta_enlace.sql

ALTER TABLE vinos
  DROP COLUMN IF EXISTS vino_anada_id,
  DROP COLUMN IF EXISTS oferta_id;
