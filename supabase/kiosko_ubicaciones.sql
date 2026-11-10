-- P1-3: catálogo de ubicaciones/estanterías por tienda
-- Aditivo. CREATE TABLE IF NOT EXISTS + RLS coherente con el resto.
-- El código del admin (/api/kiosko/[slug]/admin/ubicaciones/route.js) y la
-- UI degradan con grace si la tabla todavía NO existe: muestran el input
-- de texto libre como hasta ahora.
-- Aplica con: supabase db push  o  ejecutar en SQL editor.

CREATE TABLE IF NOT EXISTS kiosko_ubicaciones (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id   uuid         NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  nombre      text         NOT NULL,
  -- clave normalizada (lower, sin tildes, trim) para agrupar/buscar sin tocar el nombre
  nombre_key  text         NOT NULL,
  orden       int          NOT NULL DEFAULT 100,
  activa      boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (tienda_id, nombre_key)
);

CREATE INDEX IF NOT EXISTS idx_kiosko_ubicaciones_tienda_orden
  ON kiosko_ubicaciones(tienda_id, orden, nombre);

ALTER TABLE kiosko_ubicaciones ENABLE ROW LEVEL SECURITY;
-- Sin policies -> solo service_role escribe/lee (admin pasa por supabaseAdmin).
