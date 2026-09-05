-- Embudo de conversión por flujo (wizard, cesta, pairing)
-- Cada fila = un evento de paso dentro de un intento (attempt_id = UUID por sesión de flujo)
-- Aplica con: supabase db push   o   ejecutar en SQL editor
CREATE TABLE IF NOT EXISTS kiosko_funnel_events (
  id             BIGSERIAL    PRIMARY KEY,
  tienda_id      UUID         NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  attempt_id     UUID         NOT NULL,
  flow           TEXT         NOT NULL,   -- 'wizard' | 'cesta' | 'pairing'
  step           TEXT         NOT NULL,   -- 'start' | 'ocasion' | 'estilo' | 'presupuesto' |
                                          -- 'prefs' | 'resultado' | 'consulta' | 'carrito' | 'abandon'
  abandon_reason TEXT,                    -- 'idle_timeout' | 'user_exit' | NULL
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kiosko_funnel_tienda_flow
  ON kiosko_funnel_events(tienda_id, flow, created_at);
