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

DO $$ BEGIN

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cierres_mensuales_bodega' AND policyname = 'cmb_select') THEN
    CREATE POLICY cmb_select ON cierres_mensuales_bodega FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = cierres_mensuales_bodega.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cierres_mensuales_bodega' AND policyname = 'cmb_insert') THEN
    CREATE POLICY cmb_insert ON cierres_mensuales_bodega FOR INSERT
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = cierres_mensuales_bodega.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cierres_mensuales_bodega' AND policyname = 'cmb_delete') THEN
    CREATE POLICY cmb_delete ON cierres_mensuales_bodega FOR DELETE
      USING (EXISTS (
        SELECT 1 FROM public.restaurantes r
        WHERE r.id = cierres_mensuales_bodega.restaurante_id
          AND r.email = (auth.jwt() ->> 'email')
      ));
  END IF;

END $$;
