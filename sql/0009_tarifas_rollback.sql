-- 0009_tarifas_rollback.sql
-- Deshace la migración 0009_tarifas.sql

DROP TABLE IF EXISTS linea_cruda;

ALTER TABLE oferta
  DROP COLUMN IF EXISTS tarifa_id;

DROP TABLE IF EXISTS tarifa;
