-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  B1 · PASO PREVIO — Copias de seguridad antes de la migración            ║
-- ║                                                                          ║
-- ║  Ejecutar ANTES de b1_movimientos_expand.sql.                            ║
-- ║                                                                          ║
-- ║  Las tablas backup se crean con RLS habilitado y SIN políticas:          ║
-- ║  · anon y authenticated no pueden leerlas (sin política = deny-all).     ║
-- ║  · Solo service_role accede (usa SET ROLE en el SQL Editor).             ║
-- ║  · REVOKE explícito sobre anon y authenticated como capa adicional.      ║
-- ║                                                                          ║
-- ║  DROP PROGRAMADO:                                                        ║
-- ║  Borrar 30 días después de verificar la migración con b1_sqltest_prod.   ║
-- ║  Comandos (ajustar fecha en el comentario y ejecutar):                   ║
-- ║    DROP TABLE IF EXISTS public.movimientos_stock_backup_b1;              ║
-- ║    DROP TABLE IF EXISTS public.vinos_backup_b1;                          ║
-- ║    DROP TABLE IF EXISTS public.restaurant_economic_settings_backup_b1;   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ── 1. movimientos_stock ──────────────────────────────────────────────────────
CREATE TABLE public.movimientos_stock_backup_b1
  AS SELECT * FROM public.movimientos_stock;

ALTER TABLE public.movimientos_stock_backup_b1
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.movimientos_stock_backup_b1
  FROM anon, authenticated;

DO $$
DECLARE v_filas integer;
BEGIN
  SELECT COUNT(*) INTO v_filas FROM public.movimientos_stock_backup_b1;
  RAISE NOTICE 'movimientos_stock_backup_b1: % filas copiadas', v_filas;
END $$;

-- ── 2. vinos (columnas económicas relevantes para B1) ─────────────────────────
CREATE TABLE public.vinos_backup_b1 AS
  SELECT * FROM public.vinos;

ALTER TABLE public.vinos_backup_b1
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.vinos_backup_b1
  FROM anon, authenticated;

DO $$
DECLARE v_filas integer;
BEGIN
  SELECT COUNT(*) INTO v_filas FROM public.vinos_backup_b1;
  RAISE NOTICE 'vinos_backup_b1: % filas copiadas', v_filas;
END $$;

-- ── 3. restaurant_economic_settings ───────────────────────────────────────────
CREATE TABLE public.restaurant_economic_settings_backup_b1
  AS SELECT * FROM public.restaurant_economic_settings;

ALTER TABLE public.restaurant_economic_settings_backup_b1
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.restaurant_economic_settings_backup_b1
  FROM anon, authenticated;

DO $$
DECLARE v_filas integer;
BEGIN
  SELECT COUNT(*) INTO v_filas FROM public.restaurant_economic_settings_backup_b1;
  RAISE NOTICE 'restaurant_economic_settings_backup_b1: % filas copiadas', v_filas;
END $$;

-- ── Verificación de integridad ─────────────────────────────────────────────────
DO $$
DECLARE
  v_orig integer;
  v_bak  integer;
BEGIN
  SELECT COUNT(*) INTO v_orig FROM public.movimientos_stock;
  SELECT COUNT(*) INTO v_bak  FROM public.movimientos_stock_backup_b1;
  IF v_orig <> v_bak THEN
    RAISE EXCEPTION 'BACKUP INCOMPLETO: movimientos_stock tiene % filas pero el backup tiene %', v_orig, v_bak;
  END IF;
  RAISE NOTICE 'BACKUP VERIFICADO: % filas en movimientos_stock coinciden con el backup', v_orig;
END $$;

-- ── Verificación de acceso: anon no puede leer las tablas backup ───────────────
-- Confirma que RLS está activo y no hay políticas (deny-all implícito).
DO $$
DECLARE
  v_rls_mov  boolean;
  v_rls_vin  boolean;
  v_rls_res  boolean;
  v_pol_count integer;
BEGIN
  SELECT relrowsecurity INTO v_rls_mov
  FROM pg_class WHERE relname = 'movimientos_stock_backup_b1' AND relnamespace = 'public'::regnamespace;

  SELECT relrowsecurity INTO v_rls_vin
  FROM pg_class WHERE relname = 'vinos_backup_b1' AND relnamespace = 'public'::regnamespace;

  SELECT relrowsecurity INTO v_rls_res
  FROM pg_class WHERE relname = 'restaurant_economic_settings_backup_b1' AND relnamespace = 'public'::regnamespace;

  IF NOT (v_rls_mov AND v_rls_vin AND v_rls_res) THEN
    RAISE EXCEPTION 'RLS no activo en una o más tablas backup. Abortando.';
  END IF;

  -- Verificar que no hay políticas (sin política + RLS = deny all para anon/authenticated)
  SELECT COUNT(*) INTO v_pol_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'movimientos_stock_backup_b1',
      'vinos_backup_b1',
      'restaurant_economic_settings_backup_b1'
    );

  IF v_pol_count > 0 THEN
    RAISE EXCEPTION 'Las tablas backup tienen % política(s) inesperada(s). Revisar.', v_pol_count;
  END IF;

  RAISE NOTICE 'ACCESO VERIFICADO: RLS activo y 0 políticas en las 3 tablas backup.';
  RAISE NOTICE '  → anon y authenticated no pueden leer los backups (deny-all implícito).';
  RAISE NOTICE '  → Solo service_role tiene acceso.';
END $$;

COMMIT;

-- ── Query de comparación post-migración ───────────────────────────────────────
-- Ejecutar DESPUÉS del backfill para confirmar que el stock no cambió.
-- Resultado esperado: 0 filas.
--
-- SELECT
--   v.id, v.nombre,
--   bak.stock AS stock_antes,
--   v.stock   AS stock_despues,
--   v.stock - bak.stock AS diferencia
-- FROM public.vinos v
-- JOIN public.vinos_backup_b1 bak ON bak.id = v.id
-- WHERE v.stock <> bak.stock
-- ORDER BY ABS(v.stock - bak.stock) DESC;
