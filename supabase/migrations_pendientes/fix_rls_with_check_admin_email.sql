-- ─────────────────────────────────────────────────────────────────────────
-- Fix RLS · WITH CHECK admite también al email de administración
-- ─────────────────────────────────────────────────────────────────────────
--
-- YA APLICADO MANUALMENTE el 2026-11-16.
-- Este archivo es sólo el registro versionado del cambio para que el repo
-- refleje el estado real de la BD; NO reaplicar.
--
-- Qué se cambió
--   En las políticas *_all (ALL) de parametros_explotacion e
--   historico_mensual, el USING ya permitía al email de administración
--   (cataconjuanjo@gmail.com) además del propietario del restaurante,
--   pero el WITH CHECK sólo permitía al propietario. Resultado: la
--   consulta inicial pasaba el USING, pero el upsert fallaba con
--   42501/403 porque el WITH CHECK no autorizaba la fila propuesta.
--
--   Se iguala el WITH CHECK con el USING (mismo OR de permisos), de
--   modo que el administrador puede guardar en la vista de Explotación
--   para cualquier restaurante.
--
-- Qué NO cambia
--   - El resto de políticas (SELECT, INSERT por el bridge, etc.).
--   - El modelo de permisos del dueño del restaurante (sigue
--     funcionando por r.email = auth.jwt() ->> 'email').
--
-- Comprobación tras aplicar (ver abajo en UP) — ya ejecutada el
-- 2026-11-16, resultado OK.
--
-- ─────────────────────────────────────────────────────────────────────────
-- UP (para registro — NO reaplicar; ya está aplicado en BD)
-- ─────────────────────────────────────────────────────────────────────────

-- parametros_explotacion
DROP POLICY IF EXISTS "parametros_explotacion_all" ON public.parametros_explotacion;
CREATE POLICY "parametros_explotacion_all" ON public.parametros_explotacion
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurantes r
      WHERE r.id = parametros_explotacion.restaurante_id
        AND (
          r.email = (auth.jwt() ->> 'email')
          OR (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurantes r
      WHERE r.id = parametros_explotacion.restaurante_id
        AND (
          r.email = (auth.jwt() ->> 'email')
          OR (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
        )
    )
  );

-- historico_mensual
DROP POLICY IF EXISTS "historico_mensual_all" ON public.historico_mensual;
CREATE POLICY "historico_mensual_all" ON public.historico_mensual
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurantes r
      WHERE r.id = historico_mensual.restaurante_id
        AND (
          r.email = (auth.jwt() ->> 'email')
          OR (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurantes r
      WHERE r.id = historico_mensual.restaurante_id
        AND (
          r.email = (auth.jwt() ->> 'email')
          OR (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- COMPROBACIÓN (debe devolver 2 filas; una por tabla; USING y WITH CHECK
-- deben contener la expresión 'cataconjuanjo@gmail.com'):
-- ─────────────────────────────────────────────────────────────────────────
--
--   SELECT tablename, policyname, cmd,
--          qual     AS using_expr,
--          with_check AS with_check_expr
--     FROM pg_policies
--    WHERE schemaname = 'public'
--      AND policyname IN ('parametros_explotacion_all', 'historico_mensual_all')
--    ORDER BY tablename, policyname;
--
-- ─────────────────────────────────────────────────────────────────────────
-- DOWN (sólo si se quiere revertir: deja el WITH CHECK con el
--      permiso restringido original, es decir, SÓLO propietario)
-- ─────────────────────────────────────────────────────────────────────────

-- parametros_explotacion — WITH CHECK anterior (solo propietario)
-- DROP POLICY IF EXISTS "parametros_explotacion_all" ON public.parametros_explotacion;
-- CREATE POLICY "parametros_explotacion_all" ON public.parametros_explotacion
--   FOR ALL
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.restaurantes r
--       WHERE r.id = parametros_explotacion.restaurante_id
--         AND (
--           r.email = (auth.jwt() ->> 'email')
--           OR (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
--         )
--     )
--   )
--   WITH CHECK (
--     EXISTS (
--       SELECT 1 FROM public.restaurantes r
--       WHERE r.id = parametros_explotacion.restaurante_id
--         AND r.email = (auth.jwt() ->> 'email')
--     )
--   );

-- historico_mensual — WITH CHECK anterior (solo propietario)
-- DROP POLICY IF EXISTS "historico_mensual_all" ON public.historico_mensual;
-- CREATE POLICY "historico_mensual_all" ON public.historico_mensual
--   FOR ALL
--   USING (
--     EXISTS (
--       SELECT 1 FROM public.restaurantes r
--       WHERE r.id = historico_mensual.restaurante_id
--         AND (
--           r.email = (auth.jwt() ->> 'email')
--           OR (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
--         )
--     )
--   )
--   WITH CHECK (
--     EXISTS (
--       SELECT 1 FROM public.restaurantes r
--       WHERE r.id = historico_mensual.restaurante_id
--         AND r.email = (auth.jwt() ->> 'email')
--     )
--   );

-- El DOWN está comentado por seguridad (no se quiere revertir sin
-- quererlo explícitamente). Si se necesita, descomentar las dos
-- políticas y ejecutar.
