-- P1-7: columna 'estado' para seguir el ciclo de contacto de cada lead
-- Valores propuestos: 'nuevo' (default) | 'contactado' | 'descartado'
-- Aditivo: ADD COLUMN IF NOT EXISTS, con default para no romper filas existentes.
-- La UI del admin NO lo usa aún (pendiente en P1-7 fase 3); una vez aplicada
-- la migración, la UI puede renderizar un selector por fila.
-- Aplica con: supabase db push  o  ejecutar en SQL editor

ALTER TABLE kiosko_leads
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'nuevo';

-- Índice sólo por eficiencia de filtro en el admin ("mostrar nuevos")
CREATE INDEX IF NOT EXISTS idx_kiosko_leads_tienda_estado
  ON kiosko_leads(tienda_id, estado);

-- CHECK suave: si un valor futuro se desvía, el UI puede caer con grace
-- Aditivo y no rompe filas; dejar comentado si se prefiere añadir aparte.
-- ALTER TABLE kiosko_leads
--   ADD CONSTRAINT kiosko_leads_estado_check
--   CHECK (estado IN ('nuevo', 'contactado', 'descartado'));
