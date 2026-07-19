import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Mapa de price_id → plan interno
function planDesdePriceId(priceId) {
  if (priceId === process.env.STRIPE_PRICE_BASIC)   return 'basic'
  if (priceId === process.env.STRIPE_PRICE_PRO)     return 'pro'
  if (priceId === process.env.STRIPE_PRICE_BODEGA)  return 'bodega'
  if (priceId === process.env.STRIPE_PRICE_PREMIUM) return 'premium'
  return null
}

function estadoDesdeStripe(status) {
  const statusMap = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'cancelled',
    unpaid: 'past_due',
    incomplete: 'past_due',
    incomplete_expired: 'cancelled',
    paused: 'past_due',
  }
  return statusMap[status] || 'past_due'
}

function fechaStripe(timestamp) {
  return timestamp ? new Date(timestamp * 1000).toISOString() : null
}

async function actualizarRestauranteStripe(adminSupabase, filtro, update) {
  const { error } = await adminSupabase
    .from('restaurantes')
    .update(update)
    [filtro.campo](...filtro.args)

  if (!error) return
  if (!/schema cache|stripe_/i.test(error.message || '')) throw error

  const fallback = Object.fromEntries(
    Object.entries(update).filter(([key]) => !key.startsWith('stripe_'))
  )
  const { error: fallbackError } = await adminSupabase
    .from('restaurantes')
    .update(fallback)
    [filtro.campo](...filtro.args)
  if (fallbackError) throw fallbackError
}

// El webhook necesita el body en raw para verificar la firma de Stripe
export async function POST(req) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return new Response('Stripe no configurado.', { status: 503 })
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

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
        const { data: restauranteActual } = await adminSupabase
          .from('restaurantes')
          .select('id, subscription_status')
          .eq('id', restaurante_id)
          .single()
        if (restauranteActual?.subscription_status === 'cancelled') {
          console.log(`checkout.session.completed ignorado - restaurante ${restaurante_id} cancelado`)
          break
        }

        // Obtener el plan desde la suscripción
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const priceId = subscription.items.data[0]?.price?.id
        const plan = planDesdePriceId(priceId) || session.metadata?.plan || 'basic'
        const subscription_status = estadoDesdeStripe(subscription.status)

        await actualizarRestauranteStripe(adminSupabase, { campo: 'eq', args: ['id', restaurante_id] }, {
          plan,
          subscription_status,
          stripe_customer_id:     customerId,
          stripe_subscription_id: subscriptionId,
          stripe_price_id:        priceId,
          trial_expires_at:       fechaStripe(subscription.trial_end),
          trial_started_at:       fechaStripe(subscription.trial_start),
        })

        console.log(`✓ checkout.session.completed — restaurante ${restaurante_id} → plan ${plan}`)
        break
      }

      // ── Suscripción actualizada (cambio de plan, renovación) ─
      case 'customer.subscription.updated': {
        const sub        = event.data.object
        const customerId = sub.customer
        const priceId    = sub.items.data[0]?.price?.id
        const plan       = planDesdePriceId(priceId)
        const subscription_status = estadoDesdeStripe(sub.status)

        const update = {
          subscription_status,
          stripe_subscription_id: sub.id,
          stripe_price_id: priceId,
          trial_expires_at: fechaStripe(sub.trial_end),
          trial_started_at: fechaStripe(sub.trial_start),
          ...(plan ? { plan } : {}),
        }

        await actualizarRestauranteStripe(adminSupabase, { campo: 'eq', args: ['stripe_customer_id', customerId] }, update)

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
