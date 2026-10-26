-- ============================================================
-- ROLLBACK — Auditoría de seguridad 2026-10
-- ============================================================
-- Ejecutar si algún bloque de security_audit_2026_10_rls_hardening.sql rompe algo.

-- Bloque B: eliminar políticas restrictivas añadidas
DROP POLICY IF EXISTS "consumos_ia_deny_public"       ON public.consumos_ia;
DROP POLICY IF EXISTS "demo_analytics_deny_public"    ON public.demo_analytics_events;
DROP POLICY IF EXISTS "sesiones_uso_deny_public"      ON public.sesiones_uso;
DROP POLICY IF EXISTS "rate_limits_deny_anon"         ON public.rate_limits;

-- Bloque A: restaurar función original sin la validación de ownership
-- (Recuperar el cuerpo original desde el historial de Supabase o desde b2_compras_pmp.sql)
-- No se puede autogenerar aquí sin el cuerpo completo.
-- Instrucción: ejecutar b2_compras_pmp.sql en producción para restaurar la versión previa.
