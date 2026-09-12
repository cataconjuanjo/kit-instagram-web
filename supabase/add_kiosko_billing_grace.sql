-- Cortesia de facturacion para kioskos tras el primer fallo de renovacion.
-- Migracion aditiva: no modifica suscripciones ni realiza cobros en Stripe.

ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS billing_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_grace_until timestamptz,
  ADD COLUMN IF NOT EXISTS billing_grace_invoice_id text;

CREATE INDEX IF NOT EXISTS idx_tiendas_billing_grace_until
  ON public.tiendas (billing_grace_until)
  WHERE billing_grace_until IS NOT NULL;
