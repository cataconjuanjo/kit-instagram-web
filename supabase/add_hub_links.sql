ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS hub_activo boolean DEFAULT false;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS hub_titulo text;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS hub_subtitulo text;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS hub_fondo_url text;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS hub_fondo_zoom integer DEFAULT 115;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS hub_fondo_x integer DEFAULT 50;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS hub_fondo_y integer DEFAULT 50;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS hub_overlay numeric(3,2) DEFAULT 0.48;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS hub_estilo text DEFAULT 'nubes';
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS hub_mostrar_logo boolean DEFAULT true;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS hub_mostrar_nombre boolean DEFAULT true;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS hub_mostrar_direccion boolean DEFAULT true;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS instagram_url text;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS facebook_url text;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS plan text DEFAULT 'basic';
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trialing';
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz;

CREATE TABLE IF NOT EXISTS restaurante_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  url text NOT NULL,
  tipo text DEFAULT 'link',
  orden integer DEFAULT 0,
  visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS restaurante_links_restaurante_idx
ON restaurante_links(restaurante_id, orden);

ALTER TABLE restaurante_links ENABLE ROW LEVEL SECURITY;
