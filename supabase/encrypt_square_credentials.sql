-- Add encrypted storage for Square/TPV credentials.
-- Existing square_access_token values keep working as legacy fallback.

ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS square_access_token_encrypted text;

COMMENT ON COLUMN public.tiendas.square_access_token_encrypted IS
  'AES-GCM encrypted Square/TPV access token. The app reads this before legacy square_access_token.';
