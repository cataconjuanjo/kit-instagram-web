-- Fase I — Checklist de entrega de restaurante.
--
-- Añade la columna aditiva `restaurantes.checklist_entrega jsonb NOT NULL
-- DEFAULT '{}'::jsonb` para guardar las CONFIRMACIONES MANUALES del
-- propietario sobre ítems del checklist de Ajustes que no tienen
-- señal automática (QR probado en móvil, mapa estrella/joya revisado).
--
-- Formato del JSONB (validado por el endpoint, no por la BD):
--   {
--     "qr_probado_en":   "2026-11-22T10:00:00Z",
--     "mapa_revisado_en":"2026-11-22T10:05:00Z"
--   }
--   Claves permitidas (ver app/lib/checklistEntrega.js:CLAVES_CONFIRMACION_MANUAL):
--     qr_probado_en, mapa_revisado_en
--
--   Valor: ISO date string cuando está marcado; clave ausente cuando
--   está desmarcado (el endpoint borra la clave con jsonb - clave).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + backup defensivo si la
-- columna existía. Mismo patrón que `fase_f_vinos_iva_pct`.

CREATE SCHEMA IF NOT EXISTS backup_privado;

DO $$
DECLARE
  _fecha text := to_char(now(), 'YYYYMMDD_HH24MISS');
  _existe boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'restaurantes' AND column_name = 'checklist_entrega'
  ) INTO _existe;
  IF _existe THEN
    EXECUTE format(
      'CREATE TABLE backup_privado.restaurantes_checklist_%s AS SELECT id, email, checklist_entrega FROM public.restaurantes',
      _fecha
    );
  END IF;
END $$;

ALTER TABLE public.restaurantes
  ADD COLUMN IF NOT EXISTS checklist_entrega jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.restaurantes.checklist_entrega IS
  'Confirmaciones manuales del checklist de entrega (Ajustes). Claves '
  'permitidas (validadas por app/api/checklist-entrega): qr_probado_en, '
  'mapa_revisado_en. Valor = ISO date string cuando está marcado; clave '
  'ausente cuando está desmarcado. Default {} = ningún ítem confirmado.';
