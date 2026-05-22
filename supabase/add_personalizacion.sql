ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS color_acento text;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS color_primario text;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS color_fondo text;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS tipografia text DEFAULT 'serif';
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS banner_zoom integer DEFAULT 100;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS banner_x integer DEFAULT 50;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS banner_y integer DEFAULT 50;
