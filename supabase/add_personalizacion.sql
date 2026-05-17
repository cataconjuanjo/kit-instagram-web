ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS color_acento text;
ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS tipografia text DEFAULT 'serif';
