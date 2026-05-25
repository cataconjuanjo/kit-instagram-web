-- ═══════════════════════════════════════════════════════════════
-- POLÍTICAS DASHBOARD — Acceso autenticado + bypass admin
--
-- Ejecutar en: Supabase Dashboard → SQL Editor
--
-- Añade políticas para:
--  • Los propietarios de restaurante lean/escriban sus datos
--  • El admin (cataconjuanjo@gmail.com) acceda a cualquier restaurante
--    cuando impersona uno desde el panel de consultoría
-- ═══════════════════════════════════════════════════════════════

-- ── Helper interno ──────────────────────────────────────────
-- Devuelve true si el usuario autenticado es el admin
-- o si el restaurante pertenece al usuario
-- Uso: USING ( es_propietario_o_admin(restaurante_id) )

-- ── 1. ESTADÍSTICAS ─────────────────────────────────────────
-- Sin esta política los dashboards de Rentabilidad, Cierre,
-- Inventario y Estadísticas muestran vacío para el admin.

DROP POLICY IF EXISTS "auth_estadisticas_select" ON estadisticas;
CREATE POLICY "auth_estadisticas_select"
  ON estadisticas FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM restaurantes
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_estadisticas_insert" ON estadisticas;
CREATE POLICY "auth_estadisticas_insert"
  ON estadisticas FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM restaurantes
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- ── 2. VINOS ────────────────────────────────────────────────
-- Necesario para que el dashboard pueda leer y editar vinos

DROP POLICY IF EXISTS "auth_vinos_select" ON vinos;
CREATE POLICY "auth_vinos_select"
  ON vinos FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM restaurantes
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_vinos_insert" ON vinos;
CREATE POLICY "auth_vinos_insert"
  ON vinos FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM restaurantes
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_vinos_update" ON vinos;
CREATE POLICY "auth_vinos_update"
  ON vinos FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM restaurantes
      WHERE email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM restaurantes
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_vinos_delete" ON vinos;
CREATE POLICY "auth_vinos_delete"
  ON vinos FOR DELETE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM restaurantes
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- ── 3. PLATOS ───────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_platos_select" ON platos;
CREATE POLICY "auth_platos_select"
  ON platos FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM restaurantes
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_platos_insert" ON platos;
CREATE POLICY "auth_platos_insert"
  ON platos FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM restaurantes
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_platos_update" ON platos;
CREATE POLICY "auth_platos_update"
  ON platos FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM restaurantes
      WHERE email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM restaurantes
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "auth_platos_delete" ON platos;
CREATE POLICY "auth_platos_delete"
  ON platos FOR DELETE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (
      SELECT id FROM restaurantes
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- ── 4. RESTAURANTES ─────────────────────────────────────────
-- UPDATE para ajustes/personalización desde el dashboard

DROP POLICY IF EXISTS "auth_restaurantes_update" ON restaurantes;
CREATE POLICY "auth_restaurantes_update"
  ON restaurantes FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR email = (auth.jwt() ->> 'email')
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR email = (auth.jwt() ->> 'email')
  );

DROP POLICY IF EXISTS "auth_restaurantes_select" ON restaurantes;
CREATE POLICY "auth_restaurantes_select"
  ON restaurantes FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR email = (auth.jwt() ->> 'email')
  );

-- ── 5. MOVIMIENTOS_STOCK ─────────────────────────────────────
-- Las políticas de propietario ya existen (add_bodega_control.sql).
-- Añadimos solo el bypass de admin para que pueda leer todos.

DROP POLICY IF EXISTS "admin_movimientos_select" ON movimientos_stock;
CREATE POLICY "admin_movimientos_select"
  ON movimientos_stock FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR EXISTS (
      SELECT 1 FROM restaurantes r
      WHERE r.id = movimientos_stock.restaurante_id
        AND r.email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "admin_movimientos_insert" ON movimientos_stock;
CREATE POLICY "admin_movimientos_insert"
  ON movimientos_stock FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR EXISTS (
      SELECT 1 FROM restaurantes r
      WHERE r.id = movimientos_stock.restaurante_id
        AND r.email = (auth.jwt() ->> 'email')
    )
  );

-- ── 6. CONSULTOR_PROPUESTAS ──────────────────────────────────
DO $outer$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'consultor_propuestas') THEN
    DROP POLICY IF EXISTS "auth_propuestas_all" ON consultor_propuestas;
    EXECUTE $sql$
      CREATE POLICY "auth_propuestas_all"
        ON consultor_propuestas FOR ALL TO authenticated
        USING (
          (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
          OR restaurante_id IN (
            SELECT id FROM restaurantes
            WHERE email = (auth.jwt() ->> 'email')
          )
        )
        WITH CHECK (
          (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
          OR restaurante_id IN (
            SELECT id FROM restaurantes
            WHERE email = (auth.jwt() ->> 'email')
          )
        )
    $sql$;
  END IF;
END $outer$;

-- ── 7. RESTAURANTE_LINKS ─────────────────────────────────────
DO $outer$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'restaurante_links') THEN
    DROP POLICY IF EXISTS "auth_links_all" ON restaurante_links;
    EXECUTE $sql$
      CREATE POLICY "auth_links_all"
        ON restaurante_links FOR ALL TO authenticated
        USING (
          (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
          OR restaurante_id IN (
            SELECT id FROM restaurantes
            WHERE email = (auth.jwt() ->> 'email')
          )
        )
        WITH CHECK (
          (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
          OR restaurante_id IN (
            SELECT id FROM restaurantes
            WHERE email = (auth.jwt() ->> 'email')
          )
        )
    $sql$;
  END IF;
END $outer$;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE tablename IN ('estadisticas','vinos','platos','restaurantes','movimientos_stock')
-- ORDER BY tablename, cmd;
-- ═══════════════════════════════════════════════════════════════
