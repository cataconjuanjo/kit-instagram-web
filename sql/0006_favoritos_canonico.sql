-- 0006_favoritos_canonico.sql
-- Bloque 6: favoritos cuelgan del vino canónico.
-- Expand-only: ADD COLUMN + UPDATE acotado + CREATE INDEX.
-- Generado: 2026-09-12. Rama: refactor/catalogo-canonico.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Nuevas columnas en proveedor_catalogo_vinos
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE proveedor_catalogo_vinos
  ADD COLUMN IF NOT EXISTS vino_id       uuid  REFERENCES vino(id),
  ADD COLUMN IF NOT EXISTS ambito        text  CHECK (ambito IN ('global','restaurante')),
  ADD COLUMN IF NOT EXISTS restaurante_id uuid,   -- FK lógica a restaurantes; sin REFERENCES para evitar bloqueo de migración
  ADD COLUMN IF NOT EXISTS motivo        text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill ambito: los 386 favoritos actuales quedan como 'global'
--    UPDATE acotado: WHERE favorito = true
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE proveedor_catalogo_vinos
  SET ambito = 'global'
  WHERE favorito = true
    AND ambito IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Índices
-- ─────────────────────────────────────────────────────────────────────────────
-- Consultas rápidas por vino_id (catálogo canónico, dedup cross-proveedor)
CREATE INDEX IF NOT EXISTS pcv_vino_id_idx
  ON proveedor_catalogo_vinos (vino_id)
  WHERE vino_id IS NOT NULL;

-- Consultas favoritos + vino_id (catálogo del restaurante y simulador)
CREATE INDEX IF NOT EXISTS pcv_favorito_vino_id_idx
  ON proveedor_catalogo_vinos (vino_id, favorito)
  WHERE favorito = true;
