-- Añade los campos de Stripe al tabla restaurantes
-- Ejecutar en Supabase → SQL Editor

ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id        text;

-- Índice para buscar rápido por customer_id desde el webhook
CREATE INDEX IF NOT EXISTS idx_restaurantes_stripe_customer
  ON restaurantes (stripe_customer_id);
