-- Fase C — Simulador de margen mínimo de bodega.
-- Persiste los supuestos manuales (materiales, suministros, otros,
-- beneficio_objetivo y, opcionalmente, ventas_previstas si el usuario
-- las fija). El resto de campos del simulador (personal, alquiler,
-- roturas+invitaciones, ventas_previstas calculadas) se recalculan
-- desde datos reales en cada carga y NO se guardan.
--
-- IDEMPOTENTE: usa CREATE IF NOT EXISTS + DROP POLICY IF EXISTS.
-- Si la tabla ya existe, hace backup previo en el schema
-- `backup_privado` (schema que ya usa el proyecto para snapshots).

-- Schema de backup (no se crea si ya existe).
CREATE SCHEMA IF NOT EXISTS backup_privado;

-- Backup previo si la tabla ya existía.
DO $$
DECLARE
  _fecha text := to_char(now(), 'YYYYMMDD_HH24MISS');
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'simulador_margen_bodega'
  ) THEN
    EXECUTE format(
      'CREATE TABLE backup_privado.simulador_margen_bodega_%s AS SELECT * FROM public.simulador_margen_bodega',
      _fecha
    );
  END IF;
END $$;

-- Tabla mínima: una fila por restaurante.
CREATE TABLE IF NOT EXISTS public.simulador_margen_bodega (
  restaurante_id uuid        PRIMARY KEY
                             REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  supuestos      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.simulador_margen_bodega IS
  'Supuestos manuales del simulador de margen mínimo de bodega. '
  'Los campos calculados (personal, alquiler, roturas+invitaciones, '
  'ventas_previstas) NO se persisten: se recalculan al vuelo.';

COMMENT ON COLUMN public.simulador_margen_bodega.supuestos IS
  'JSON con claves opcionales: materiales, suministros, otros, '
  'beneficio_objetivo, ventas_previstas_fijo. Valores numéricos o null.';

-- RLS: patrón canónico del proyecto (admin + restaurantes.email).

ALTER TABLE public.simulador_margen_bodega ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_simulador_margen_bodega_select" ON public.simulador_margen_bodega;
CREATE POLICY "auth_simulador_margen_bodega_select"
  ON public.simulador_margen_bodega FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_simulador_margen_bodega_insert" ON public.simulador_margen_bodega;
CREATE POLICY "auth_simulador_margen_bodega_insert"
  ON public.simulador_margen_bodega FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_simulador_margen_bodega_update" ON public.simulador_margen_bodega;
CREATE POLICY "auth_simulador_margen_bodega_update"
  ON public.simulador_margen_bodega FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_simulador_margen_bodega_delete" ON public.simulador_margen_bodega;
CREATE POLICY "auth_simulador_margen_bodega_delete"
  ON public.simulador_margen_bodega FOR DELETE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')
    )
  );
