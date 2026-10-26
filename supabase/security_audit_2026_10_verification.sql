-- ============================================================
-- SCRIPT DE VERIFICACIÓN ÚNICO — Auditoría 2026-10
-- ============================================================
-- Pegar y ejecutar UNA SOLA VEZ en Supabase → SQL Editor.
-- No modifica nada. Solo reporta el estado de seguridad.
-- ============================================================

-- ── 1. Tablas con RLS desactivado ────────────────────────────
SELECT
  schemaname                      AS esquema,
  tablename                       AS tabla,
  'RLS DESACTIVADO'               AS problema
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT tablename FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    WHERE c.relrowsecurity = true
      AND t.schemaname = 'public'
  )
ORDER BY tablename;

-- ── 2. Tablas con RLS activado pero SIN ninguna política ─────
SELECT
  n.nspname                       AS esquema,
  c.relname                       AS tabla,
  'RLS ON pero SIN POLÍTICAS'     AS problema
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
  )
ORDER BY c.relname;

-- ── 3. Políticas permisivas con USING (true) ─────────────────
SELECT
  n.nspname                       AS esquema,
  c.relname                       AS tabla,
  p.polname                       AS politica,
  CASE p.polcmd
    WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
    ELSE 'ALL'
  END                             AS comando,
  pg_get_expr(p.polqual, p.polrelid)  AS using_expr
FROM pg_policy p
JOIN pg_class  c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND pg_get_expr(p.polqual, p.polrelid) = 'true'
ORDER BY c.relname, p.polname;

-- ── 4. Funciones SECURITY DEFINER con GRANT a authenticated/anon ──
SELECT
  p.proname                       AS funcion,
  r.rolname                       AS grantado_a,
  'SECURITY DEFINER + grant público' AS problema
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN aclitem(p.proacl) acl ON true
JOIN pg_roles r ON r.oid = acl.grantee
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND r.rolname IN ('authenticated', 'anon')
ORDER BY p.proname;

-- ── 5. Buckets de Storage públicos ──────────────────────────────
SELECT
  name                            AS bucket,
  public                          AS es_publico,
  CASE WHEN public THEN '⚠ PÚBLICO — verificar si es intencional'
       ELSE '✓ Privado'
  END                             AS estado
FROM storage.buckets
ORDER BY name;

-- ── 6. Variables de entorno NEXT_PUBLIC que contienen service_role ──
-- (No aplica en SQL. Ver comentario a continuación.)
-- Buscar manualmente en el código: grep -r "NEXT_PUBLIC_.*SERVICE\|NEXT_PUBLIC_.*service_role" app/

-- ── 8. SECURITY DEFINER sin REVOKE explícito (PUBLIC puede ejecutar) ─────────
-- proacl IS NULL → creadas sin GRANT/REVOKE → PUBLIC tiene EXECUTE por defecto.
SELECT
  n.nspname                       AS esquema,
  p.proname                       AS funcion,
  pg_get_function_arguments(p.oid) AS argumentos,
  'SECURITY DEFINER sin REVOKE → PUBLIC puede ejecutar' AS problema
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND p.proacl IS NULL
ORDER BY p.proname;

-- ── 9. SECURITY DEFINER con parámetro restaurante_id — verificar ownership ───
-- Revisar manualmente que incluyan validación de pertenencia (auth.uid check).
SELECT
  n.nspname                       AS esquema,
  p.proname                       AS funcion,
  pg_get_function_arguments(p.oid) AS argumentos,
  CASE WHEN p.proacl IS NULL THEN 'SIN REVOKE (PUBLIC execute)'
       ELSE array_to_string(
         ARRAY(SELECT acl::text FROM unnest(p.proacl) acl), ', '
       )
  END                             AS grants_actuales,
  'Revisar: tiene restaurante_id — ¿valida ownership?' AS nota
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND pg_get_function_arguments(p.oid) ILIKE '%restaurante_id%'
ORDER BY p.proname;

-- ── 7. Resumen ejecutivo ──────────────────────────────────────────
SELECT
  (SELECT count(*) FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename NOT IN (
       SELECT c.relname FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relrowsecurity = true
     )
  )                               AS tablas_sin_rls,
  (SELECT count(*) FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relrowsecurity = true
     AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
  )                               AS tablas_con_rls_sin_politicas,
  (SELECT count(*) FROM pg_policy p
   JOIN pg_class c ON c.oid = p.polrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND pg_get_expr(p.polqual, p.polrelid) = 'true'
  )                               AS politicas_using_true,
  (SELECT count(*) FROM storage.buckets WHERE public = true)
                                  AS buckets_publicos;
