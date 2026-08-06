-- ═══════════════════════════════════════════════════════════════════════
-- RLS FINAL — Tablas kiosko (tiendas, vinos_tienda y auxiliares)
-- Complementa secure_kiosko_v2.sql que activó RLS pero no definió
-- políticas explícitas para tiendas/vinos_tienda.
--
-- Arquitectura de acceso:
--   • Todas las rutas API usan supabaseAdmin (service_role) → bypass RLS
--   • La autorización real está en requireKioskoAccess() / getPublicTienda()
--   • RLS actúa como barrera de defensa en profundidad si alguien usase
--     la anon key directamente contra Supabase
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. tiendas ────────────────────────────────────────────────────────

-- Asegurar que RLS está activo
ALTER TABLE public.tiendas ENABLE ROW LEVEL SECURITY;

-- Eliminar cualquier política pública residual
DROP POLICY IF EXISTS "tiendas_public_read" ON public.tiendas;
DROP POLICY IF EXISTS "anon_read_tiendas" ON public.tiendas;

-- Anon: sin acceso directo (la carta pública lee por API filtrada)
DROP POLICY IF EXISTS "tiendas_deny_anon" ON public.tiendas;
CREATE POLICY "tiendas_deny_anon"
  ON public.tiendas FOR ALL TO anon
  USING (false);

-- Propietario autenticado: solo su propia tienda
DROP POLICY IF EXISTS "tiendas_owner_select" ON public.tiendas;
CREATE POLICY "tiendas_owner_select"
  ON public.tiendas FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR lower(propietario_email) = lower(auth.jwt() ->> 'email')
    OR lower(email) = lower(auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "tiendas_owner_update" ON public.tiendas;
CREATE POLICY "tiendas_owner_update"
  ON public.tiendas FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR lower(propietario_email) = lower(auth.jwt() ->> 'email')
    OR lower(email) = lower(auth.jwt() ->> 'email')
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR lower(propietario_email) = lower(auth.jwt() ->> 'email')
    OR lower(email) = lower(auth.jwt() ->> 'email')
  );


-- ── 2. vinos_tienda ───────────────────────────────────────────────────

ALTER TABLE public.vinos_tienda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vinos_tienda_public_read" ON public.vinos_tienda;
DROP POLICY IF EXISTS "anon_read_vinos_tienda" ON public.vinos_tienda;

-- Anon: sin acceso directo (la carta pública solo expone campos filtrados por API)
DROP POLICY IF EXISTS "vinos_tienda_deny_anon" ON public.vinos_tienda;
CREATE POLICY "vinos_tienda_deny_anon"
  ON public.vinos_tienda FOR ALL TO anon
  USING (false);

-- Propietario autenticado: solo los vinos de su tienda
DROP POLICY IF EXISTS "vinos_tienda_owner_all" ON public.vinos_tienda;
CREATE POLICY "vinos_tienda_owner_all"
  ON public.vinos_tienda FOR ALL TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR tienda_id IN (
      SELECT id FROM public.tiendas
      WHERE lower(propietario_email) = lower(auth.jwt() ->> 'email')
         OR lower(email) = lower(auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR tienda_id IN (
      SELECT id FROM public.tiendas
      WHERE lower(propietario_email) = lower(auth.jwt() ->> 'email')
         OR lower(email) = lower(auth.jwt() ->> 'email')
    )
  );


-- ── 3. kiosko_searches ────────────────────────────────────────────────
-- Ya cubierto en secure_kiosko_v2.sql (deny all), reforzamos aquí

ALTER TABLE public.kiosko_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kiosko_searches_no_public_access" ON public.kiosko_searches;
CREATE POLICY "kiosko_searches_no_public_access"
  ON public.kiosko_searches FOR ALL
  USING (false)
  WITH CHECK (false);


-- ── 4. kiosko_mobile_intents ─────────────────────────────────────────

ALTER TABLE public.kiosko_mobile_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kiosko_mobile_intents_no_public_access" ON public.kiosko_mobile_intents;
CREATE POLICY "kiosko_mobile_intents_no_public_access"
  ON public.kiosko_mobile_intents FOR ALL
  USING (false)
  WITH CHECK (false);


-- ── 5. stock_movements (tabla kiosko) ────────────────────────────────

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_movements_no_public_access" ON public.stock_movements;
CREATE POLICY "stock_movements_no_public_access"
  ON public.stock_movements FOR ALL
  USING (false)
  WITH CHECK (false);


-- ── 6. kiosko_assisted_orders (si ya existe) ─────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kiosko_assisted_orders'
  ) THEN
    EXECUTE 'ALTER TABLE public.kiosko_assisted_orders ENABLE ROW LEVEL SECURITY';

    EXECUTE $p$
      DROP POLICY IF EXISTS "kiosko_orders_deny_public" ON public.kiosko_assisted_orders
    $p$;

    EXECUTE $p$
      CREATE POLICY "kiosko_orders_deny_public"
      ON public.kiosko_assisted_orders FOR ALL
      USING (false)
      WITH CHECK (false)
    $p$;
  END IF;
END $$;


-- ── 7. Verificación ──────────────────────────────────────────────────
-- Ejecuta esto para confirmar: debe devolver 0 filas sin RLS en tablas kiosko.
SELECT
  c.relname  AS tabla,
  c.relrowsecurity AS rls_activo
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'tiendas', 'vinos_tienda', 'kiosko_searches',
    'kiosko_mobile_intents', 'stock_movements', 'kiosko_assisted_orders'
  )
  AND c.relrowsecurity = false;
