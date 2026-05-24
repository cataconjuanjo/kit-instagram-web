-- ═══════════════════════════════════════════════════════════════
-- POLÍTICAS DE SEGURIDAD (RLS) — Carta Viva
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Tabla rate_limits (nueva) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id         uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  ip         text         NOT NULL,
  endpoint   text         NOT NULL DEFAULT 'maridaje',
  created_at timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limits_lookup
  ON rate_limits (ip, endpoint, created_at);

-- Solo el service_role puede acceder (anon bloqueado)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon" ON rate_limits FOR ALL TO anon USING (false);

-- Limpieza automática: borrar registros de más de 2 horas
-- (ejecutar periódicamente o añadir a un cron de Supabase)
-- DELETE FROM rate_limits WHERE created_at < now() - interval '2 hours';


-- ── 2. restaurantes ─────────────────────────────────────────────
ALTER TABLE restaurantes ENABLE ROW LEVEL SECURITY;

-- Anon puede leer cualquier restaurante (necesario para carta pública por slug)
CREATE POLICY "anon_read_restaurantes"
  ON restaurantes FOR SELECT TO anon
  USING (true);

-- Anon no puede escribir, actualizar ni borrar
-- (INSERT/UPDATE/DELETE no tienen políticas → bloqueado por defecto)


-- ── 3. vinos ────────────────────────────────────────────────────
ALTER TABLE vinos ENABLE ROW LEVEL SECURITY;

-- Anon solo lee vinos activos (carta pública y maridaje)
CREATE POLICY "anon_read_vinos_activos"
  ON vinos FOR SELECT TO anon
  USING (activo = true);


-- ── 4. platos ───────────────────────────────────────────────────
ALTER TABLE platos ENABLE ROW LEVEL SECURITY;

-- Anon solo lee platos activos (sommelier)
CREATE POLICY "anon_read_platos_activos"
  ON platos FOR SELECT TO anon
  USING (activo = true);


-- ── 5. estadisticas ─────────────────────────────────────────────
ALTER TABLE estadisticas ENABLE ROW LEVEL SECURITY;

-- Anon no puede leer ni escribir estadísticas (solo service_role vía API)
CREATE POLICY "deny_anon_estadisticas"
  ON estadisticas FOR ALL TO anon
  USING (false);


-- ── 6. Otras tablas sensibles ────────────────────────────────────
-- Ajusta según las tablas que tengas. Patrón: bloquear anon por defecto.

-- proveedores
ALTER TABLE IF EXISTS proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_proveedores"
  ON proveedores FOR ALL TO anon USING (false);

-- hub_links
ALTER TABLE IF EXISTS hub_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_hub_links"
  ON hub_links FOR ALL TO anon USING (false);

-- propuestas
ALTER TABLE IF EXISTS propuestas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_propuestas"
  ON propuestas FOR ALL TO anon USING (false);


-- ═══════════════════════════════════════════════════════════════
-- NOTAS
-- • Las rutas de API usan supabaseAdmin (service_role) → bypass RLS
-- • El cliente público (anon key) solo puede leer carta/vinos/platos
-- • Para ver las políticas activas: SELECT * FROM pg_policies;
-- ═══════════════════════════════════════════════════════════════
