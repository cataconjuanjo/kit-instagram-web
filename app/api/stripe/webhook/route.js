import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Mapa de price_id → plan interno
function planDesdePriceId(priceId) {
  if (priceId === process.env.STRIPE_PRICE_BASIC)   return 'basic'
  if (priceId === process.env.STRIPE_PRICE_PRO)     return 'pro'
  if (priceId === process.env.STRIPE_PRICE_PREMIUM) return 'premium'
  return null
}

// El webhook necesita el body en raw para verificar la firma de Stripe
export async function POST(req) {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature')

  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature inválida:', err.message)
    return new Response(`Webhook error: ${err.message}`, { status: 400 })
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  try {
    switch (event.type) {

      // ── Pago completado: activar suscripción ─────────────────
      case 'checkout.session.completed': {
        const session = event.data.object
        const restaurante_id = session.metadata?.restaurante_id
        const customerId     = session.customer
        const subscriptionId = session.subscription

        if (!restaurante_id) break

        // Obtener el plan desde la suscripción
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const priceId = subscription.items.data[0]?.price?.id
        const plan = planDesdePriceId(priceId) || session.metadata?.plan || 'basic'

        await adminSupabase
          .from('restaurantes')
          .update({
            plan,
            subscription_status:    'active',
            stripe_customer_id:     customerId,
            stripe_subscription_id: subscriptionId,
            stripe_price_id:        priceId,
          })
          .eq('id', restaurante_id)

        console.log(`✓ checkout.session.completed — restaurante ${restaurante_id} → plan ${plan}`)
        break
      }

      // ── Suscripción actualizada (cambio de plan, renovación) ─
      case 'customer.subscription.updated': {
        const sub        = event.data.object
        const customerId = sub.customer
        const priceId    = sub.items.data[0]?.price?.id
        const plan       = planDesdePriceId(priceId)

        // Mapear estado de Stripe → estado interno
        const statusMap = {
          active:            'active',
          trialing:          'trialing',
          past_due:          'past_due',
          canceled:          'cancelled',
          unpaid:            'past_due',
          incomplete:        'past_due',
          incomplete_expired:'cancelled',
          paused:            'past_due',
        }
        const subscription_status = statusMap[sub.status] || 'past_due'

        const update = {
          subscription_status,
          stripe_subscription_id: sub.id,
          stripe_price_id: priceId,
          ...(plan ? { plan } : {}),
        }

        await adminSupabase
          .from('restaurantes')
          .update(update)
          .eq('stripe_customer_id', customerId)

        console.log(`✓ subscription.updated — customer ${customerId} → ${subscription_status} / plan ${plan}`)
        break
      }

      // ── Suscripción cancelada ─────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub        = event.data.object
        const customerId = sub.customer

        await adminSupabase
          .from('restaurantes')
          .update({
            subscription_status:    'cancelled',
            stripe_subscription_id: null,
          })
          .eq('stripe_customer_id', customerId)

        console.log(`✓ subscription.deleted — customer ${customerId} → cancelled`)
        break
      }

      // ── Pago fallido ──────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice    = event.data.object
        const customerId = invoice.customer

        await adminSupabase
          .from('restaurantes')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_customer_id', customerId)

        console.log(`✓ invoice.payment_failed — customer ${customerId} → past_due`)
        break
      }

      // ── Pago de factura OK (restaurar si estaba past_due) ─────
      case 'invoice.payment_succeeded': {
        const invoice    = event.data.object
        const customerId = invoice.customer
        if (invoice.billing_reason === 'subscription_cycle') {
          await adminSupabase
            .from('restaurantes')
            .update({ subscription_status: 'active' })
            .eq('stripe_customer_id', customerId)
          console.log(`✓ invoice.payment_succeeded — customer ${customerId} → active`)
        }
        break
      }

      default:
        // Ignorar eventos no gestionados
        break
    }
  } catch (err) {
    console.error(`Error procesando evento ${event.type}:`, err)
    return new Response('Error interno', { status: 500 })
  }

  return Response.json({ received: true })
}
