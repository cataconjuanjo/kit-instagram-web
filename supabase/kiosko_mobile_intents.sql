-- Intents de "llevar al móvil" del kiosko (QR escaneado por el cliente)
-- Cada fila = un vino incluido en una lectura de QR, por tienda.
-- Escritura: supabaseAdmin (service_role) desde app/api/kiosko/[slug]/movil/route.js
-- Lectura:   supabaseAdmin desde app/api/kiosko/[slug]/admin/analitica/route.js
-- Aditivo. CREATE TABLE IF NOT EXISTS. No destruye nada si ya existe.
-- Aplica con: supabase db push  o  ejecutar en SQL editor
CREATE TABLE IF NOT EXISTS kiosko_mobile_intents (
  id           BIGSERIAL    PRIMARY KEY,
  tienda_id    UUID         NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  vino_id      UUID,
  vino_nombre  TEXT,
  vino_bodega  TEXT,
  source       TEXT,         -- 'qr_selection' | 'qr_wizard' | 'qr_pairing' | 'qr_cesta' | ...
  lang         TEXT,         -- 'es' | 'en' | 'fr' | 'de'
  user_agent   TEXT,
  ip           TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kiosko_mobile_intents_tienda_created
  ON kiosko_mobile_intents(tienda_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kiosko_mobile_intents_vino
  ON kiosko_mobile_intents(vino_id)
  WHERE vino_id IS NOT NULL;

-- RLS: coherente con kiosko_funnel_events (service_role bypassa RLS).
-- Se habilita para que, si alguna otra ruta accediera con anon/auth, no lea
-- estos eventos. Los endpoints oficiales usan supabaseAdmin (service_role).
ALTER TABLE kiosko_mobile_intents ENABLE ROW LEVEL SECURITY;

-- No policies por defecto -> solo service_role puede leer/escribir.
-- Si en el futuro se expone un dashboard con auth, añadir policy SELECT
-- condicionada a que la tienda_id pertenezca al usuario autenticado.
