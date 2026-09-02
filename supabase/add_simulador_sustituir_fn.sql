-- Función atómica para el gesto "Sustituir vino en el simulador"
-- Ejecuta UPDATE + INSERT en la misma transacción; si cualquiera falla
-- se revierte todo y el borrador queda intacto.
--
-- Parámetros:
--   p_restaurante_id   uuid del restaurante
--   p_linea_fuera_id   id de la carta_simulacion que pasa a 'fuera'
--   p_catalogo_vino_id id del vino en proveedor_catalogo_vinos a añadir
--   p_nombre           snapshot del nombre del catálogo
--   p_bodega           snapshot bodega
--   p_tipo             snapshot tipo
--   p_region           snapshot región
--   p_anada            snapshot añada
--   p_formato          snapshot formato
--   p_precio_botella   pvp botella calculado
--   p_precio_copa      pvp copa calculado
--   p_coste_compra     coste estimado del catálogo
--
-- Devuelve la fila insertada (la línea 'nuevo') para que el cliente
-- actualice su estado local sin necesidad de un GET de recarga.

CREATE OR REPLACE FUNCTION sustituir_vino_simulacion(
  p_restaurante_id              uuid,
  p_linea_fuera_id              uuid,
  p_catalogo_vino_id            uuid,
  p_nombre                      text,
  p_bodega                      text    DEFAULT NULL,
  p_tipo                        text    DEFAULT NULL,
  p_region                      text    DEFAULT NULL,
  p_anada                       text    DEFAULT NULL,
  p_formato                     text    DEFAULT NULL,
  p_precio_botella              numeric DEFAULT NULL,
  p_precio_copa                 numeric DEFAULT NULL,
  p_coste_compra                numeric DEFAULT NULL,
  p_pvp_recomendado_catalogo    numeric DEFAULT NULL,
  p_pvp_copa_catalogo           numeric DEFAULT NULL
)
RETURNS carta_simulacion
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_nueva carta_simulacion;
BEGIN
  -- 1. Marcar el vino existente como 'fuera'
  UPDATE carta_simulacion
     SET estado = 'fuera',
         updated_at = now()
   WHERE id             = p_linea_fuera_id
     AND restaurante_id = p_restaurante_id
     AND estado         = 'actual';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Línea no encontrada o ya no está en estado actual (id: %)', p_linea_fuera_id;
  END IF;

  -- 2. Insertar el vino sustituto con estado 'nuevo' y sustituye_a vinculado.
  --    precio_copa queda NULL (ofrecido_por_copa = NULL = pendiente de decidir).
  INSERT INTO carta_simulacion (
    restaurante_id, catalogo_vino_id, sustituye_a,
    nombre, bodega, tipo, region, anada, formato,
    precio_botella, precio_copa, coste_compra,
    pvp_recomendado_catalogo, pvp_copa_catalogo,
    estado
  ) VALUES (
    p_restaurante_id, p_catalogo_vino_id, p_linea_fuera_id,
    p_nombre, p_bodega, p_tipo, p_region, p_anada, p_formato,
    p_precio_botella, p_precio_copa, p_coste_compra,
    p_pvp_recomendado_catalogo, p_pvp_copa_catalogo,
    'nuevo'
  )
  RETURNING * INTO v_nueva;

  RETURN v_nueva;
END;
$$;
