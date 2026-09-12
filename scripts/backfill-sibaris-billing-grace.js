// Abre la cortesía de 48 horas para el fallo de renovación ya ocurrido en Síbaris.
// Por seguridad, el script solo escribe con --apply y nunca llama a Stripe.
// Uso: node scripts/backfill-sibaris-billing-grace.js --apply

const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const [key, ...value] = line.split('=')
  if (key && value.length) process.env[key.trim()] = value.join('=').trim()
}

const TARGET = {
  slug: 'sibaris-gourmet',
  customerId: 'cus_V0m7aPhngIG0Di',
  subscriptionId: 'sub_1U3LqDJewpUM60dKZ7SMiIes',
  invoiceId: 'in_1UEacIJewpUM60dKAGpAavrZ',
  failedAt: '2026-09-11T21:00:55.000Z',
  graceUntil: '2026-09-13T21:00:55.000Z',
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const { data: tienda, error: readError } = await supabase
    .from('tiendas')
    .select('id, slug, activo, subscription_status, stripe_customer_id, stripe_subscription_id, billing_failed_at, billing_grace_until, billing_grace_invoice_id')
    .eq('slug', TARGET.slug)
    .single()

  if (readError || !tienda) throw readError || new Error('Tienda no encontrada')

  if (tienda.stripe_customer_id !== TARGET.customerId || tienda.stripe_subscription_id !== TARGET.subscriptionId) {
    throw new Error('Los identificadores Stripe de la tienda no coinciden con el incidente auditado')
  }

  console.table(tienda)

  if (!process.argv.includes('--apply')) {
    console.log('Dry-run: no se ha escrito nada. Repite con --apply para abrir la cortesía.')
    return
  }

  const { error: updateError } = await supabase
    .from('tiendas')
    .update({
      billing_failed_at: TARGET.failedAt,
      billing_grace_until: TARGET.graceUntil,
      billing_grace_invoice_id: TARGET.invoiceId,
    })
    .eq('id', tienda.id)
    .eq('stripe_customer_id', TARGET.customerId)
    .eq('stripe_subscription_id', TARGET.subscriptionId)
    .eq('subscription_status', 'past_due')

  if (updateError) throw updateError

  const { data: verificada, error: verifyError } = await supabase
    .from('tiendas')
    .select('id, slug, activo, subscription_status, billing_failed_at, billing_grace_until, billing_grace_invoice_id')
    .eq('id', tienda.id)
    .single()

  if (verifyError) throw verifyError
  if (
    verificada.billing_failed_at !== TARGET.failedAt ||
    verificada.billing_grace_until !== TARGET.graceUntil ||
    verificada.billing_grace_invoice_id !== TARGET.invoiceId
  ) {
    throw new Error('La verificación del backfill no coincide con el valor esperado')
  }

  console.log('Cortesía aplicada localmente; activo y Stripe no se han modificado.')
  console.table(verificada)
}

main().catch(error => {
  console.error('Backfill no aplicado:', error.message)
  process.exitCode = 1
})
