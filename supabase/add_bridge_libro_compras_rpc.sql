-- ── F1.1 BLOQUE 4: upsert_libro_compras_factura — bridge atómico ──────────────
-- Reemplaza el read-modify-write en JS por una operación atómica en SQL.
-- Requiere que libro_compras tenga UNIQUE (restaurante_id, periodo, proveedor).
-- Idempotente: no añade si cabecera_compra_id ya existe en facturas[].

CREATE OR REPLACE FUNCTION public.upsert_libro_compras_factura(
  p_restaurante_id uuid,
  p_periodo        text,   -- 'YYYY-MM'
  p_proveedor      text,
  p_entrada        jsonb   -- {fecha, importe, albaran?, cabecera_compra_id}
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cid text := p_entrada ->> 'cabecera_compra_id';
BEGIN
  INSERT INTO public.libro_compras (restaurante_id, periodo, proveedor, facturas)
  VALUES (p_restaurante_id, p_periodo, p_proveedor, jsonb_build_array(p_entrada))
  ON CONFLICT (restaurante_id, periodo, proveedor) DO UPDATE
    SET facturas    = libro_compras.facturas || p_entrada,
        updated_at  = now()
    WHERE NOT (libro_compras.facturas @> jsonb_build_array(
      jsonb_build_object('cabecera_compra_id', v_cid)
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_libro_compras_factura(uuid, text, text, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_libro_compras_factura(uuid, text, text, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
