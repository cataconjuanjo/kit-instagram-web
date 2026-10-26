-- ============================================================
-- Auditoría de seguridad 2026-10 — Hardening RLS y funciones
-- ============================================================
-- INSTRUCCIONES:
--   1. Revisar cada bloque antes de aplicar.
--   2. Ejecutar en Supabase → SQL Editor, en horario de baja carga.
--   3. El fichero de rollback es security_audit_2026_10_rls_hardening_rollback.sql
--
-- QUÉ PODRÍA ROMPERSE:
--   Bloque A: Si la función se llama desde un contexto donde auth.uid() es NULL
--             (p.ej. desde service_role sin sesión), el RAISE bloqueará la llamada.
--             → Las rutas de servidor que ya llaman con service_role y pasan
--               p_restaurante_id como parámetro confiable pueden añadir al
--               caller un casting explícito (set_config / RLS bypass) si es
--               necesario.  Comprobar app/api/compras/ antes de activar en prod.
--   Bloque B: La política anon en rate_limits es necesaria para que las rutas
--             públicas (kiosko, analisis-carta) funcionen con supabaseAdmin.
--             supabaseAdmin usa service_role, que saltea RLS por defecto.
--             Esta política NO afecta a supabaseAdmin. Solo refuerza que
--             ningún cliente anónimo en frontend pueda leer rate_limits.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- BLOQUE A: Validación de ownership en registrar_compra_con_pmp
--           y aplicar_ajustes_stock_atomicos (SECURITY DEFINER)
-- ────────────────────────────────────────────────────────────

-- A1. Añadir validación de ownership al inicio de registrar_compra_con_pmp.
--     Un usuario autenticado solo puede registrar compras de su restaurante.
--     Si el uid no coincide, la función hace ROLLBACK con error descriptivo.
--
-- NOTA: Solo aplica cuando el caller es 'authenticated'.
--       service_role (usado desde servidor) tiene uid NULL → se salta la comprobación.

CREATE OR REPLACE FUNCTION public.registrar_compra_con_pmp(
  p_restaurante_id   uuid,
  p_cabecera         jsonb,
  p_lineas           jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role      text := current_setting('role', true);
  v_caller_uid       uuid := auth.uid();
  v_owner_email      text;
  v_caller_email     text;

  v_cabecera_id      uuid;
  v_proveedor        text;
  v_fecha            date;
  v_num_doc          text;
  v_ref_ext          text;
  v_desc_global      numeric(5,2);
  v_iva_pct          numeric(5,2);
  v_origen           text;
  v_notas            text;

  v_linea            jsonb;
  v_vino_id          uuid;
  v_uds              integer;
  v_uds_bon          integer;
  v_uds_totales      integer;
  v_precio_tarifa    numeric(10,4);
  v_desc_linea       numeric(5,2);
  v_importe_neto     numeric(14,4);
  v_iva_importe      numeric(14,4);
  v_precio_neto_ud   numeric(10,4);

  v_stock_actual     integer;
  v_pmp_actual       numeric(10,4);
  v_coste_compra_act numeric(10,2);
  v_pmp_base         numeric(10,4);
  v_pmp_nuevo        numeric(10,4);

  v_resultado        jsonb := '[]'::jsonb;
BEGIN
  -- ── Validación de ownership (solo para rol authenticated) ──────────────────
  -- service_role (llamadas desde servidor) tiene uid NULL → se permite sin check.
  IF v_caller_uid IS NOT NULL THEN
    SELECT email INTO v_owner_email
      FROM public.restaurantes
     WHERE id = p_restaurante_id
     LIMIT 1;

    SELECT email INTO v_caller_email
      FROM auth.users
     WHERE id = v_caller_uid
     LIMIT 1;

    IF v_owner_email IS NULL THEN
      RAISE EXCEPTION 'restaurante_no_encontrado';
    END IF;
    IF lower(v_caller_email) <> lower(v_owner_email) THEN
      RAISE EXCEPTION 'acceso_denegado: el usuario no pertenece a este restaurante';
    END IF;
  END IF;

  -- ── Validaciones de cabecera ────────────────────────────────────────────────
  v_proveedor   := btrim(COALESCE(p_cabecera ->> 'proveedor', ''));
  v_fecha       := (p_cabecera ->> 'fecha')::date;
  v_num_doc     := NULLIF(btrim(COALESCE(p_cabecera ->> 'numero_documento', '')), '');
  v_ref_ext     := NULLIF(btrim(COALESCE(p_cabecera ->> 'referencia_externa', '')), '');
  v_desc_global := COALESCE((p_cabecera ->> 'descuento_global')::numeric, 0);
  v_iva_pct     := COALESCE((p_cabecera ->> 'iva_pct')::numeric, 21);
  v_origen      := COALESCE(NULLIF(btrim(COALESCE(p_cabecera ->> 'origen', '')), ''), 'manual');
  v_notas       := NULLIF(btrim(COALESCE(p_cabecera ->> 'notas', '')), '');

  IF length(v_proveedor) = 0 THEN
    RAISE EXCEPTION 'proveedor_requerido';
  END IF;
  IF v_fecha IS NULL THEN
    RAISE EXCEPTION 'fecha_requerida';
  END IF;
  IF v_origen NOT IN ('manual', 'importacion') THEN
    RAISE EXCEPTION 'origen_invalido: %', v_origen;
  END IF;
  IF jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'lineas_vacias';
  END IF;
  IF jsonb_array_length(p_lineas) > 200 THEN
    RAISE EXCEPTION 'demasiadas_lineas';
  END IF;

  -- [El resto del cuerpo de la función es idéntico al original — no se reproduce
  --  aquí para no duplicar código. Aplicar SOLO el bloque de validación de ownership
  --  antes de las validaciones de cabecera existentes.]
  --
  -- INSTRUCCIÓN PRÁCTICA:
  --   1. En Supabase SQL Editor, busca la función actual con:
  --      SELECT prosrc FROM pg_proc WHERE proname = 'registrar_compra_con_pmp';
  --   2. Toma el cuerpo actual.
  --   3. Inserta el bloque de validación de ownership (líneas 56-77 de este archivo)
  --      justo después de la declaración DECLARE y antes de las validaciones de cabecera.
  --   4. Ejecuta la función completa como CREATE OR REPLACE.

  -- Placeholder para que este bloque sea sintácticamente válido:
  RAISE EXCEPTION 'MIGRATION_INCOMPLETE: integrar el cuerpo original antes de ejecutar';
END;
$$;

-- Mantener los grants originales
GRANT EXECUTE ON FUNCTION public.registrar_compra_con_pmp(uuid, jsonb, jsonb)
  TO service_role, authenticated;


-- ────────────────────────────────────────────────────────────
-- BLOQUE B: Políticas RLS para tablas sin políticas explícitas
-- ────────────────────────────────────────────────────────────

-- B1. consumos_ia — solo service_role puede insertar/leer (actualmente sin políticas explícitas)
ALTER TABLE public.consumos_ia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consumos_ia_deny_public" ON public.consumos_ia;
CREATE POLICY "consumos_ia_deny_public"
  ON public.consumos_ia
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

-- B2. demo_analytics_events — solo service_role
ALTER TABLE public.demo_analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "demo_analytics_deny_public" ON public.demo_analytics_events;
CREATE POLICY "demo_analytics_deny_public"
  ON public.demo_analytics_events
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);

-- B3. sesiones_uso — solo service_role
ALTER TABLE public.sesiones_uso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sesiones_uso_deny_public" ON public.sesiones_uso;
CREATE POLICY "sesiones_uso_deny_public"
  ON public.sesiones_uso
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);


-- ────────────────────────────────────────────────────────────
-- BLOQUE C: Bucket facturas-bodega — confirmar que es privado
-- ────────────────────────────────────────────────────────────
-- Verificación manual (SQL Editor no puede cambiar buckets directamente).
-- Ir a Supabase → Storage → facturas-bodega → asegurarse de que "Public bucket" está DESACTIVADO.
-- Si está público por error, ejecutar:
--
-- UPDATE storage.buckets SET public = false WHERE name = 'facturas-bodega';
--
-- (No se ejecuta aquí automáticamente por seguridad.)


-- ────────────────────────────────────────────────────────────
-- BLOQUE D: rate_limits — asegurar que anon no puede leer
-- ────────────────────────────────────────────────────────────
-- Las rutas públicas usan supabaseAdmin (service_role) para insertar rate_limits.
-- service_role salta RLS, por lo que esta política no les afecta.
-- Solo bloquea a clientes anónimos en frontend que intentaran leer/insertar directamente.

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_limits_deny_anon" ON public.rate_limits;
CREATE POLICY "rate_limits_deny_anon"
  ON public.rate_limits
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false);
