-- Rollback de b4_fix1_rls_botellas.sql
-- Restaura las políticas sin bypass admin (estado original de b4_copas_botella_abierta.sql)

BEGIN;

DROP POLICY IF EXISTS botellas_abiertas_select ON public.botellas_abiertas;
CREATE POLICY botellas_abiertas_select ON public.botellas_abiertas FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.restaurantes r
    WHERE r.id = botellas_abiertas.restaurante_id
      AND r.email = (auth.jwt() ->> 'email')
  ));

DROP POLICY IF EXISTS botellas_abiertas_insert ON public.botellas_abiertas;
CREATE POLICY botellas_abiertas_insert ON public.botellas_abiertas FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurantes r
    WHERE r.id = botellas_abiertas.restaurante_id
      AND r.email = (auth.jwt() ->> 'email')
  ));

DROP POLICY IF EXISTS botellas_abiertas_update ON public.botellas_abiertas;
CREATE POLICY botellas_abiertas_update ON public.botellas_abiertas FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.restaurantes r
    WHERE r.id = botellas_abiertas.restaurante_id
      AND r.email = (auth.jwt() ->> 'email')
  ));

DROP POLICY IF EXISTS botellas_abiertas_delete ON public.botellas_abiertas;
CREATE POLICY botellas_abiertas_delete ON public.botellas_abiertas FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.restaurantes r
    WHERE r.id = botellas_abiertas.restaurante_id
      AND r.email = (auth.jwt() ->> 'email')
  ));

NOTIFY pgrst, 'reload schema';
COMMIT;
