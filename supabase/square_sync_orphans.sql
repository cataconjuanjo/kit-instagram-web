-- Tabla de auditoría para el sincronizador de Square.
-- Registra dos eventos:
--   'inserted'   → ítem de Square insertado como fila nueva (sin match por variation_id)
--   'deactivated'→ fila de BD desactivada porque su variation_id ya no existe en Square
-- Permite al admin revisar y fusionar manualmente si hay duplicados.

CREATE TABLE IF NOT EXISTS square_sync_orphans (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tienda_id           uuid        NOT NULL,
  square_catalog_id   text,
  square_variation_id text,
  nombre              text,
  precio              numeric(10,2),
  accion              text        NOT NULL,  -- 'inserted' | 'deactivated'
  revisado            boolean     NOT NULL DEFAULT false,
  synced_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_square_sync_orphans_tienda
  ON square_sync_orphans (tienda_id, synced_at DESC);
