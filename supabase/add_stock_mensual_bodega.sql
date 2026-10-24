-- ── BLOQUE 4: stock_mensual_bodega + columnas aditivas en historico_mensual ────
-- Expand-only. No DROP, no TRUNCATE.

-- Nueva tabla -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_mensual_bodega (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid        NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  mes            char(7)     NOT NULL,   -- 'YYYY-MM'
  vino_id        uuid        NOT NULL REFERENCES vinos(id) ON DELETE CASCADE,
  stock_uds      integer     NOT NULL DEFAULT 0,
  coste_medio    numeric(12,4) NOT NULL DEFAULT 0,
  valor_total    numeric(12,2) GENERATED ALWAYS AS (stock_uds * coste_medio) STORED,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, mes, vino_id)
);

CREATE INDEX IF NOT EXISTS stock_mensual_bodega_restaurante_mes_idx
  ON stock_mensual_bodega (restaurante_id, mes);

-- RLS
ALTER TABLE stock_mensual_bodega ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stock_mensual_bodega' AND policyname = 'stock_mensual_bodega_owner'
  ) THEN
    CREATE POLICY stock_mensual_bodega_owner
      ON stock_mensual_bodega
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM restaurantes r
          WHERE r.id = stock_mensual_bodega.restaurante_id
            AND r.email = (auth.jwt() ->> 'email')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM restaurantes r
          WHERE r.id = stock_mensual_bodega.restaurante_id
            AND r.email = (auth.jwt() ->> 'email')
        )
      );
  END IF;
END $$;

-- Columnas aditivas en historico_mensual ---------------------------------------
ALTER TABLE historico_mensual
  ADD COLUMN IF NOT EXISTS origen              text    NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS valor_stock_bodega  numeric(12,2) NOT NULL DEFAULT 0;
