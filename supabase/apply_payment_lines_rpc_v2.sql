-- apply_payment_lines_rpc_v2.sql
-- Añade p_ocultar_agotados (default true).
-- Con false: la RPC nunca pone activo=false al llegar a 0,
-- permitiendo que el vino permanezca visible en el kiosko.
--
-- Ejecutar tras apply_payment_lines_rpc.sql y ocultar_agotados.sql.

CREATE OR REPLACE FUNCTION apply_payment_lines(
  p_tienda_id         uuid,
  p_payment_id        text,
  p_lines             jsonb,   -- [{catalog_object_id: text, quantity: int}]
  p_ocultar_agotados  boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line        jsonb;
  v_catalog_id  text;
  v_qty         int;
  v_vino        record;
  v_stock_nuevo int;
  v_anomalia    boolean;
  v_already     boolean;
  v_results     jsonb := '[]'::jsonb;
BEGIN
  -- ── Fase 1: bloquear filas afectadas en orden de id ─────────────────────────
  PERFORM vt.id
  FROM vinos_tienda vt
  WHERE vt.tienda_id = p_tienda_id
    AND (
      vt.square_variation_id IN (
        SELECT el->>'catalog_object_id' FROM jsonb_array_elements(p_lines) AS el
      )
      OR vt.square_catalog_id IN (
        SELECT el->>'catalog_object_id' FROM jsonb_array_elements(p_lines) AS el
      )
    )
  ORDER BY vt.id
  FOR UPDATE;

  -- ── Fase 2: procesar cada línea ──────────────────────────────────────────────
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_catalog_id := v_line->>'catalog_object_id';
    v_qty        := (v_line->>'quantity')::int;

    -- Idempotencia: skip si esta línea ya fue aplicada para este pago
    SELECT EXISTS (
      SELECT 1 FROM payment_lines_applied
      WHERE payment_id = p_payment_id
        AND tienda_id  = p_tienda_id
        AND catalog_id = v_catalog_id
    ) INTO v_already;

    IF v_already THEN
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'catalog_object_id', v_catalog_id,
        'status', 'already_applied'
      ));
      CONTINUE;
    END IF;

    -- Resolver vino: prioridad a square_variation_id sobre square_catalog_id
    SELECT id, stock, activo, nombre, categoria
    INTO v_vino
    FROM vinos_tienda
    WHERE tienda_id = p_tienda_id
      AND (square_variation_id = v_catalog_id OR square_catalog_id = v_catalog_id)
    ORDER BY CASE WHEN square_variation_id = v_catalog_id THEN 1 ELSE 2 END
    LIMIT 1;

    IF NOT FOUND THEN
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'catalog_object_id', v_catalog_id,
        'status', 'not_found'
      ));
      CONTINUE;
    END IF;

    -- Detectar anomalía antes de aplicar GREATEST (no enmascarar silenciosamente)
    v_anomalia    := COALESCE(v_vino.stock, 0) < v_qty;
    v_stock_nuevo := GREATEST(0, COALESCE(v_vino.stock, 0) - v_qty);

    -- Actualizar stock y activo.
    -- Con p_ocultar_agotados=false el vino nunca se desactiva por stock=0.
    UPDATE vinos_tienda
    SET
      stock      = v_stock_nuevo,
      activo     = CASE
                     WHEN v_stock_nuevo > 0
                       THEN true
                     WHEN v_stock_nuevo = 0
                          AND p_ocultar_agotados
                          AND COALESCE(v_vino.stock, 0) > 0
                       THEN false
                     ELSE activo
                   END,
      updated_at = now()
    WHERE id = v_vino.id;

    -- Registrar en bloque propio: una excepción aquí no debe deshacer el UPDATE
    BEGIN
      INSERT INTO payment_lines_applied
        (payment_id, tienda_id, catalog_id, qty, stock_antes, stock_despues)
      VALUES
        (p_payment_id, p_tienda_id, v_catalog_id, v_qty,
         COALESCE(v_vino.stock, 0), v_stock_nuevo);
    EXCEPTION WHEN unique_violation THEN
      NULL; -- carrera resuelta por el FOR UPDATE; el UPDATE ya se aplicó correctamente
    END;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'catalog_object_id', v_catalog_id,
      'vino_id',           v_vino.id,
      'vino_nombre',       v_vino.nombre,
      'categoria',         COALESCE(v_vino.categoria, 'otro'),
      'stock_antes',       COALESCE(v_vino.stock, 0),
      'stock_despues',     v_stock_nuevo,
      'anomalia',          v_anomalia,
      'status',            'ok'
    ));
  END LOOP;

  RETURN v_results;
END;
$$;

-- Permisos: solo el rol de service_role (supabaseAdmin) puede llamarla
REVOKE ALL ON FUNCTION apply_payment_lines(uuid, text, jsonb, boolean) FROM PUBLIC;
