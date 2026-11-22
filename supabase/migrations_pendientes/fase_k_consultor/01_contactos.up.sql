-- Fase K — Bloque 1: tabla aditiva `consultor_contactos`.
--
-- Guarda el registro de contactos (llamada, visita, whatsapp, email…)
-- que el consultor mantiene con cada restaurante. Alimenta:
--   - la fila "Último contacto: hace N días" del Radar y la ficha
--     (actualmente un proxy a propuestasAbiertas+incidenciasStock),
--   - las tareas de "Mi día" (contacto vencido, >14 días sin contacto),
--   - el informe de cliente (próximo contacto).
--
-- Aditiva + idempotente (IF NOT EXISTS). RLS activada SIN políticas:
-- solo el service_role (vía API /api/admin/contactos protegida por
-- validarAdmin) puede leer o escribir. anon/authenticated reciben 0
-- filas, lo que permite que el código degrade con elegancia si la
-- tabla aún no se ha aplicado.

CREATE TABLE IF NOT EXISTS public.consultor_contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  ocurrido_en timestamptz NOT NULL DEFAULT now(),
  canal text NOT NULL CHECK (canal IN ('llamada', 'visita', 'whatsapp', 'email', 'otro')),
  resumen text NOT NULL CHECK (length(resumen) <= 1000),
  proximo_contacto date NULL,
  creado_por uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultor_contactos_restaurante_fecha
  ON public.consultor_contactos (restaurante_id, ocurrido_en DESC);

CREATE INDEX IF NOT EXISTS idx_consultor_contactos_proximo
  ON public.consultor_contactos (proximo_contacto)
  WHERE proximo_contacto IS NOT NULL;

ALTER TABLE public.consultor_contactos ENABLE ROW LEVEL SECURITY;

-- NO se crean políticas para anon/authenticated a propósito: todo el
-- acceso pasa por /api/admin/contactos con service_role tras
-- validarAdmin(). Si alguien intenta leer/escribir con la clave anon,
-- Supabase devolverá 0 filas (lectura) o rechazo (escritura).

COMMENT ON TABLE public.consultor_contactos IS
  'Registro de contactos del consultor con cada restaurante (fase K). '
  'Alimenta Mi día y la fila Último contacto. Acceso sólo via '
  '/api/admin/contactos (service_role).';
COMMENT ON COLUMN public.consultor_contactos.canal IS
  'llamada | visita | whatsapp | email | otro';
COMMENT ON COLUMN public.consultor_contactos.proximo_contacto IS
  'Fecha objetivo del siguiente contacto (opcional). NULL si no se agendó.';
