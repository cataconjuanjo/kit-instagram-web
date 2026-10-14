-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B4 fix1 · RLS botellas_abiertas — bypass admin                          ║
-- ║                                                                          ║
-- ║  Problema: las 4 políticas de b4_copas_botella_abierta.sql solo          ║
-- ║  permiten acceso cuando r.email = auth.jwt().email. El admin             ║
-- ║  (cataconjuanjo@gmail.com) entra con su propio email, no con el del      ║
-- ║  restaurante, así que el SELECT devuelve [] → badge y botón no aparecen. ║
-- ║                                                                          ║
-- ║  Fix: mismo patrón que vinos, movimientos_stock y resto del dashboard:   ║
-- ║  admin bypass OR propietario.                                             ║
-- ║                                                                          ║
-- ║  Rollback: b4_fix1_rls_botellas_rollback.sql                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- SELECT
DROP POLICY IF EXISTS botellas_abiertas_select ON public.botellas_abiertas;
CREATE POLICY botellas_abiertas_select ON public.botellas_abiertas
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR EXISTS (
      SELECT 1 FROM public.restaurantes r
      WHERE r.id = botellas_abiertas.restaurante_id
        AND r.email = (auth.jwt() ->> 'email')
    )
  );

-- INSERT
DROP POLICY IF EXISTS botellas_abiertas_insert ON public.botellas_abiertas;
CREATE POLICY botellas_abiertas_insert ON public.botellas_abiertas
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR EXISTS (
      SELECT 1 FROM public.restaurantes r
      WHERE r.id = botellas_abiertas.restaurante_id
        AND r.email = (auth.jwt() ->> 'email')
    )
  );

-- UPDATE
DROP POLICY IF EXISTS botellas_abiertas_update ON public.botellas_abiertas;
CREATE POLICY botellas_abiertas_update ON public.botellas_abiertas
  FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR EXISTS (
      SELECT 1 FROM public.restaurantes r
      WHERE r.id = botellas_abiertas.restaurante_id
        AND r.email = (auth.jwt() ->> 'email')
    )
  );

-- DELETE
DROP POLICY IF EXISTS botellas_abiertas_delete ON public.botellas_abiertas;
CREATE POLICY botellas_abiertas_delete ON public.botellas_abiertas
  FOR DELETE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR EXISTS (
      SELECT 1 FROM public.restaurantes r
      WHERE r.id = botellas_abiertas.restaurante_id
        AND r.email = (auth.jwt() ->> 'email')
    )
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
