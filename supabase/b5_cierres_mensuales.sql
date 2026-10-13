-- B5: Cierre mensual de bodega — tabla de snapshots
-- gastos_mensuales ya existe en restaurant_economic_settings (b1_movimientos_expand.sql:55)

CREATE TABLE IF NOT EXISTS cierres_mensuales_bodega (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID         NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  mes            CHAR(7)      NOT NULL,   -- 'YYYY-MM'
  snapshot       JSONB        NOT NULL,
  cerrado_en     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT cierres_mensuales_bodega_restaurante_mes_key UNIQUE (restaurante_id, mes)
);

ALTER TABLE cierres_mensuales_bodega ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurante_owner_access"
  ON cierres_mensuales_bodega FOR ALL
  USING (
    restaurante_id IN (
      SELECT restaurante_id FROM restaurante_usuarios WHERE user_id = auth.uid()
    )
  );
