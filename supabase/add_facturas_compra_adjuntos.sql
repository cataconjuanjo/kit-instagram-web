-- ── BLOQUE 2: tabla facturas_compra_adjuntos + bucket facturas-bodega ─────────
-- Expand-only. No DROP, no TRUNCATE.

-- Tabla -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facturas_compra_adjuntos (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id     uuid        NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  cabecera_compra_id uuid        NOT NULL REFERENCES cabecera_compras(id) ON DELETE CASCADE,
  nombre_archivo     text        NOT NULL,
  storage_path       text        NOT NULL,
  mime_type          text,
  tamano_bytes       bigint,
  subido_por         text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS facturas_compra_adjuntos_cabecera_idx
  ON facturas_compra_adjuntos (cabecera_compra_id);

CREATE INDEX IF NOT EXISTS facturas_compra_adjuntos_restaurante_idx
  ON facturas_compra_adjuntos (restaurante_id);

-- RLS -------------------------------------------------------------------------
ALTER TABLE facturas_compra_adjuntos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'facturas_compra_adjuntos'
      AND policyname = 'facturas_compra_adjuntos_owner'
  ) THEN
    CREATE POLICY facturas_compra_adjuntos_owner
      ON facturas_compra_adjuntos
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM restaurantes r
          WHERE r.id = facturas_compra_adjuntos.restaurante_id
            AND r.email = (auth.jwt() ->> 'email')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM restaurantes r
          WHERE r.id = facturas_compra_adjuntos.restaurante_id
            AND r.email = (auth.jwt() ->> 'email')
        )
      );
  END IF;
END $$;

-- Storage bucket --------------------------------------------------------------
-- El bucket es privado (public=false). file_size_limit=10MB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'facturas-bodega',
  'facturas-bodega',
  false,
  10485760,
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (la carpeta raíz del objeto es el restaurante_id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'facturas_bodega_select'
  ) THEN
    CREATE POLICY facturas_bodega_select
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'facturas-bodega' AND
        auth.uid() IS NOT NULL AND
        (storage.foldername(name))[1] IN (
          SELECT id::text FROM restaurantes WHERE email = (auth.jwt() ->> 'email')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'facturas_bodega_insert'
  ) THEN
    CREATE POLICY facturas_bodega_insert
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'facturas-bodega' AND
        auth.uid() IS NOT NULL AND
        (storage.foldername(name))[1] IN (
          SELECT id::text FROM restaurantes WHERE email = (auth.jwt() ->> 'email')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'facturas_bodega_delete'
  ) THEN
    CREATE POLICY facturas_bodega_delete
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'facturas-bodega' AND
        auth.uid() IS NOT NULL AND
        (storage.foldername(name))[1] IN (
          SELECT id::text FROM restaurantes WHERE email = (auth.jwt() ->> 'email')
        )
      );
  END IF;
END $$;
