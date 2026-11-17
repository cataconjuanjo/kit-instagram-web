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
--   Se iguala la expresión del WITH CHECK con la del USING para que el
--   administrador pueda guardar en Explotación para cualquier
--   restaurante. El USING no se tocó: ya cubría ambos casos.
--
-- Qué NO cambia
--   - El USING de ambas políticas (se mantiene intacto).
--   - El resto de políticas (SELECT, INSERT por el bridge, etc.).
--   - El modelo de permisos del dueño del restaurante (sigue
--     funcionando por r.email = auth.jwt() ->> 'email').
--
-- Comprobación tras aplicar (ver abajo) — ya ejecutada el
-- 2026-11-16, resultado OK.
--
-- ─────────────────────────────────────────────────────────────────────────
-- UP (para registro — NO reaplicar; ya está aplicado en BD)
--
-- Son exactamente los dos comandos ALTER POLICY que se ejecutaron el
-- 2026-11-16. Sólo tocan el WITH CHECK, dejando el USING tal cual.
-- ─────────────────────────────────────────────────────────────────────────

ALTER POLICY parametros_explotacion_all ON public.parametros_explotacion
  WITH CHECK (
    ((auth.jwt() ->> 'email'::text) = 'cataconjuanjo@gmail.com'::text)
    OR EXISTS (SELECT 1 FROM restaurantes r
               WHERE r.id = parametros_explotacion.restaurante_id
                 AND r.email = (auth.jwt() ->> 'email'::text))
  );

ALTER POLICY historico_mensual_all ON public.historico_mensual
  WITH CHECK (
    ((auth.jwt() ->> 'email'::text) = 'cataconjuanjo@gmail.com'::text)
    OR EXISTS (SELECT 1 FROM restaurantes r
               WHERE r.id = historico_mensual.restaurante_id
                 AND r.email = (auth.jwt() ->> 'email'::text))
  );

-- ─────────────────────────────────────────────────────────────────────────
-- COMPROBACIÓN (debe devolver 2 filas; una por tabla; las dos expresiones
-- with_check_expr deben contener 'cataconjuanjo@gmail.com'):
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
-- DOWN (sólo si se quiere revertir: deja el WITH CHECK con el permiso
--      restringido original, es decir, SÓLO propietario del restaurante.
--      El USING no se toca.)
-- ─────────────────────────────────────────────────────────────────────────

-- ALTER POLICY parametros_explotacion_all ON public.parametros_explotacion
--   WITH CHECK (
--     EXISTS (SELECT 1 FROM restaurantes r
--             WHERE r.id = parametros_explotacion.restaurante_id
--               AND r.email = (auth.jwt() ->> 'email'::text))
--   );

-- ALTER POLICY historico_mensual_all ON public.historico_mensual
--   WITH CHECK (
--     EXISTS (SELECT 1 FROM restaurantes r
--             WHERE r.id = historico_mensual.restaurante_id
--               AND r.email = (auth.jwt() ->> 'email'::text))
--   );

-- El DOWN está comentado por seguridad (no se quiere revertir sin
-- quererlo explícitamente). Si se necesita, descomentar los dos
-- ALTER POLICY y ejecutar.
