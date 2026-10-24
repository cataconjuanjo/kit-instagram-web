-- ── BLOQUE 4 + F1.1: stock_mensual_bodega (esquema completo) + columnas historico_mensual ──
-- Expand-only. No DROP, no TRUNCATE.

-- Nueva tabla (esquema completo) ----------------------------------------------
CREATE TABLE IF NOT EXISTS stock_mensual_bodega (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      uuid          NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  mes                 char(7)       NOT NULL,   -- 'YYYY-MM'
  vino_id             uuid          NOT NULL REFERENCES vinos(id) ON DELETE CASCADE,
  -- Movimientos del mes
  stock_inicial       integer       NOT NULL DEFAULT 0,
  entradas            integer       NOT NULL DEFAULT 0,
  salidas             integer       NOT NULL DEFAULT 0,
  -- Stock teórico calculado (puede ser negativo si hay discrepancias)
  stock_final_teorico integer       GENERATED ALWAYS AS (stock_inicial + entradas - salidas) STORED,
  -- Stock real contado al cierre (NULL si no hay conteo físico)
  stock_final_real    integer,
  coste_medio         numeric(12,4) NOT NULL DEFAULT 0,
  -- Valor a coste: usa stock_final_real si existe, si no stock_final_teorico (min 0)
  valor_stock_final   numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(stock_final_real, GREATEST(0, stock_inicial + entradas - salidas)) * coste_medio
  ) STORED,
  created_at          timestamptz   NOT NULL DEFAULT now(),
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
-- origen + valor_stock_bodega (B4) + stock_inicial_valor + stock_final_valor + compras_total (F1.1)
ALTER TABLE historico_mensual
  ADD COLUMN IF NOT EXISTS origen               text         NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS valor_stock_bodega   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_inicial_valor  numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_final_valor    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compras_total        numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pct_mp               numeric(6,2)  NOT NULL DEFAULT 0;
