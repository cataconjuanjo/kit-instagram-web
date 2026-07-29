-- Historial de informes semanales del kiosko
CREATE TABLE IF NOT EXISTS kiosko_informes (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tienda_id       uuid REFERENCES tiendas(id) ON DELETE CASCADE NOT NULL,
  slug            text NOT NULL,
  semana_label    text NOT NULL,          -- "28 de julio"
  semana_inicio   date NOT NULL,          -- lunes de esa semana
  datos           jsonb NOT NULL,         -- objeto completo de métricas
  html            text,                   -- HTML del email tal como se envió
  email_destino   text,
  enviado_ok      boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kiosko_informes_tienda_idx ON kiosko_informes(tienda_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kiosko_informes_slug_idx   ON kiosko_informes(slug, created_at DESC);

-- Solo accesible via service role (el cron y el API admin usan supabaseAdmin)
ALTER TABLE kiosko_informes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sin acceso publico" ON kiosko_informes USING (false);
