-- Habilita sync de cambios del catálogo del consultor → carta_simulacion + vinos.
-- Seguro de ejecutar más de una vez (IF NOT EXISTS / CREATE OR REPLACE).
-- Ejecutar en Supabase SQL Editor.

-- ── 1. Nueva columna en vinos: traza al catálogo de origen ──────────────────
ALTER TABLE public.vinos
  ADD COLUMN IF NOT EXISTS catalogo_vino_id uuid
    REFERENCES public.proveedor_catalogo_vinos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vinos_catalogo_vino_id_idx
  ON public.vinos (catalogo_vino_id)
  WHERE catalogo_vino_id IS NOT NULL;

-- ── 2. Tracking de campos sobreescritos localmente ──────────────────────────
-- Contiene los nombres de los campos maestros que el restaurante ha editado
-- manualmente. La propagación del catálogo respeta estos overrides.
ALTER TABLE public.vinos
  ADD COLUMN IF NOT EXISTS campos_sobreescritos text[] NOT NULL DEFAULT '{}';

-- ── 3. Trigger: detecta ediciones locales sobre campos maestros ─────────────
-- Se activa antes de cualquier UPDATE a vinos. Si el vino tiene catalogo_vino_id
-- y el campo maestro cambia sin venir de la propagación interna, lo registra.
-- El flag de sesión app.propagating_catalog (set_config LOCAL) lo cortocircuita.
CREATE OR REPLACE FUNCTION public.track_vinos_catalogo_overrides()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sobreescritos text[];
BEGIN
  -- Propagación interna: no marcar como override
  IF current_setting('app.propagating_catalog', true) = 'true' THEN
    RETURN NEW;
  END IF;
  -- Vinos sin vínculo al catálogo: nada que trackear
  IF NEW.catalogo_vino_id IS NULL THEN
    RETURN NEW;
  END IF;

  sobreescritos := COALESCE(NEW.campos_sobreescritos, '{}');

  IF OLD.nombre IS DISTINCT FROM NEW.nombre
     AND NOT ('nombre' = ANY(sobreescritos)) THEN
    sobreescritos := sobreescritos || 'nombre';
  END IF;
  IF OLD.bodega IS DISTINCT FROM NEW.bodega
     AND NOT ('bodega' = ANY(sobreescritos)) THEN
    sobreescritos := sobreescritos || 'bodega';
  END IF;
  IF OLD.tipo IS DISTINCT FROM NEW.tipo
     AND NOT ('tipo' = ANY(sobreescritos)) THEN
    sobreescritos := sobreescritos || 'tipo';
  END IF;
  IF OLD.region IS DISTINCT FROM NEW.region
     AND NOT ('region' = ANY(sobreescritos)) THEN
    sobreescritos := sobreescritos || 'region';
  END IF;
  IF OLD.anada IS DISTINCT FROM NEW.anada
     AND NOT ('anada' = ANY(sobreescritos)) THEN
    sobreescritos := sobreescritos || 'anada';
  END IF;
  IF OLD.formato_compra IS DISTINCT FROM NEW.formato_compra
     AND NOT ('formato_compra' = ANY(sobreescritos)) THEN
    sobreescritos := sobreescritos || 'formato_compra';
  END IF;
  IF OLD.uva IS DISTINCT FROM NEW.uva
     AND NOT ('uva' = ANY(sobreescritos)) THEN
    sobreescritos := sobreescritos || 'uva';
  END IF;

  NEW.campos_sobreescritos := sobreescritos;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_vinos_catalogo_overrides ON public.vinos;
CREATE TRIGGER track_vinos_catalogo_overrides
  BEFORE UPDATE ON public.vinos
  FOR EACH ROW
  EXECUTE FUNCTION public.track_vinos_catalogo_overrides();

-- ── 4. RPC: propaga campos maestros del catálogo a vinos ────────────────────
-- p_cambios: jsonb con los campos a propagar. Solo se actualiza cada campo si:
--   a) su clave aparece en p_cambios (aunque el valor sea null), Y
--   b) el campo no figura en campos_sobreescritos del vino receptor.
-- Campos soportados: nombre, bodega, tipo, region, anada, formato_compra, uva.
-- Debe invocarse solo desde la service_role (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.propagar_cambios_catalogo_a_vinos(
  p_catalogo_vino_id uuid,
  p_cambios          jsonb
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campo  text;
  v_campos text[] := ARRAY['nombre','bodega','tipo','region','anada','formato_compra','uva'];
  v_n      int    := 0;
  v_total  int    := 0;
BEGIN
  -- Señal para que el trigger de tracking no marque estos cambios como overrides
  PERFORM set_config('app.propagating_catalog', 'true', true);

  FOREACH v_campo IN ARRAY v_campos LOOP
    -- Propagar solo si la clave existe en el JSONB (incluye null explícito)
    IF p_cambios ? v_campo THEN
      EXECUTE format(
        $sql$
          UPDATE public.vinos
             SET %I        = ($1 ->> %L)::text,
                 updated_at = now()
           WHERE catalogo_vino_id = $2
             AND NOT (%L = ANY(COALESCE(campos_sobreescritos, '{}'::text[])))
        $sql$,
        v_campo, v_campo, v_campo
      ) USING p_cambios, p_catalogo_vino_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_total := v_total + v_n;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.propagar_cambios_catalogo_a_vinos(uuid, jsonb) FROM PUBLIC;

-- ── 5. publicar_simulacion: preserva la FK al catálogo en vinos ─────────────
-- Única diferencia respecto a la versión anterior: catalogo_vino_id se incluye
-- en el INSERT para que los vinos publicados mantengan el vínculo y reciban
-- actualizaciones futuras del catálogo del consultor.
CREATE OR REPLACE FUNCTION public.publicar_simulacion(p_restaurante_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desactivados int := 0;
  v_creados      int := 0;
  v_borrados     int := 0;
BEGIN
  -- 1. Desactivar vinos marcados 'fuera'
  UPDATE public.vinos v
  SET    activo     = false,
         updated_at = now()
  FROM   public.carta_simulacion cs
  WHERE  cs.restaurante_id = p_restaurante_id
    AND  cs.estado         = 'fuera'
    AND  v.id              = cs.vino_id;
  GET DIAGNOSTICS v_desactivados = ROW_COUNT;

  -- 2. Crear nuevos vinos con datos del catálogo del consultor.
  --    catalogo_vino_id se preserva para habilitar sync futuro de cambios.
  --    uva no se incluye: no está en carta_simulacion.
  INSERT INTO public.vinos (
    restaurante_id,
    nombre, bodega, tipo, region,
    anada, formato_compra,
    coste_compra, precio_botella, precio_copa,
    proveedor,
    catalogo_vino_id,
    stock, stock_minimo,
    activo
  )
  SELECT
    p_restaurante_id,
    cs.nombre,
    cs.bodega,
    cs.tipo,
    cs.region,
    cs.anada,
    cs.formato,
    cs.coste_compra,
    cs.precio_botella,
    cs.precio_copa,
    pv.nombre,
    cs.catalogo_vino_id,
    0, 0,
    true
  FROM   public.carta_simulacion         cs
  JOIN   public.proveedor_catalogo_vinos pcv ON pcv.id = cs.catalogo_vino_id
  JOIN   public.proveedores_vino         pv  ON pv.id  = pcv.proveedor_id
  WHERE  cs.restaurante_id = p_restaurante_id
    AND  cs.estado         = 'nuevo';
  GET DIAGNOSTICS v_creados = ROW_COUNT;

  -- 3. Limpiar líneas publicadas del borrador.
  DELETE FROM public.carta_simulacion
  WHERE  restaurante_id = p_restaurante_id
    AND  estado IN ('fuera', 'nuevo');
  GET DIAGNOSTICS v_borrados = ROW_COUNT;

  RETURN jsonb_build_object(
    'desactivados', v_desactivados,
    'creados',      v_creados,
    'borrados',     v_borrados
  );
END;
$$;
