-- 0005_modelo_canonico_rollback.sql
-- Rollback del bloque 5. Ejecutar SOLO si la migración falla a mitad.
-- Elimina las tablas en orden inverso de dependencia.

DROP TABLE IF EXISTS dedup_decision  CASCADE;
DROP TABLE IF EXISTS dedup_candidato CASCADE;
DROP TABLE IF EXISTS oferta          CASCADE;
DROP TABLE IF EXISTS vino_anada      CASCADE;
DROP TABLE IF EXISTS vino            CASCADE;
