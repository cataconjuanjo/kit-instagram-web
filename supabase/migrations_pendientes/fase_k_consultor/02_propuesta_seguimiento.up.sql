-- Fase K — Bloque 2: tabla aditiva `consultor_propuesta_seguimiento`.
--
-- La tabla existente `consultor_propuestas` guarda la propuesta (título,
-- vino, motivo, precio, estado). Aquí añadimos un seguimiento comercial
-- aparte: cuándo se envió, se aceptó, se implantó y cuánto se capturó.
-- No modificamos la tabla existente para evitar colisiones y para que la
-- UI actual siga funcionando aunque esta tabla aún no exista.
--
-- `consultor_propuestas.id` es uuid (ver app/api/admin/propuestas/route.js
-- y el select SELECT_PROPUESTA_ADMIN). Por eso aquí `propuesta_id` también
-- es uuid con FK ON DELETE CASCADE.
--
-- RLS activada SIN políticas para anon/authenticated. Acceso solo a
-- través de /api/admin/propuestas-seguimiento con service_role.

CREATE TABLE IF NOT EXISTS public.consultor_propuesta_seguimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  propuesta_id uuid NOT NULL REFERENCES public.consultor_propuestas(id) ON DELETE CASCADE,
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  estado text NOT NULL DEFAULT 'propuesta'
    CHECK (estado IN ('propuesta', 'enviada', 'aceptada', 'rechazada', 'implantada')),
  enviada_en timestamptz NULL,
  aceptada_en timestamptz NULL,
  implantada_en timestamptz NULL,
  importe_estimado_eur numeric(12, 2) NULL,
  importe_capturado_eur numeric(12, 2) NULL,
  nota text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consultor_propuesta_seguimiento_propuesta_unique UNIQUE (propuesta_id)
);

CREATE INDEX IF NOT EXISTS idx_consultor_prop_seg_restaurante
  ON public.consultor_propuesta_seguimiento (restaurante_id);

CREATE INDEX IF NOT EXISTS idx_consultor_prop_seg_estado
  ON public.consultor_propuesta_seguimiento (restaurante_id, estado);

-- Mantener updated_at al día en cada UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at_consultor_prop_seg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consultor_prop_seg_updated_at
  ON public.consultor_propuesta_seguimiento;
CREATE TRIGGER trg_consultor_prop_seg_updated_at
  BEFORE UPDATE ON public.consultor_propuesta_seguimiento
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_consultor_prop_seg();

ALTER TABLE public.consultor_propuesta_seguimiento ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.consultor_propuesta_seguimiento IS
  'Seguimiento comercial de las propuestas (estado, importes, fechas). '
  'Fase K. Acceso sólo via /api/admin/propuestas-seguimiento (service_role).';
COMMENT ON COLUMN public.consultor_propuesta_seguimiento.estado IS
  'propuesta | enviada | aceptada | rechazada | implantada';
COMMENT ON COLUMN public.consultor_propuesta_seguimiento.importe_estimado_eur IS
  'Oportunidad económica anual estimada en euros al enviar la propuesta.';
COMMENT ON COLUMN public.consultor_propuesta_seguimiento.importe_capturado_eur IS
  'Euros efectivamente capturados tras implantar la propuesta.';
