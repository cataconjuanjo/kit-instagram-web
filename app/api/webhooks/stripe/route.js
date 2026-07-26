import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Stripe requires the raw body for signature verification — disable body parsing
export const runtime = 'nodejs'

const STATUS_MAP = {
  active:             'active',
  trialing:           'trialing',
  past_due:           'past_due',
  canceled:           'cancelled',
  incomplete:         'pending',
  incomplete_expired: 'cancelled',
  unpaid:             'past_due',
}

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!process.env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'Stripe no configurado' }, { status: 500 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  let event
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
    } else {
      // dev / testing without signature
      event = JSON.parse(body)
    }
  } catch (err) {
    console.error('[stripe-webhook] firma inválida:', err.message)
    return Response.json({ error: `Webhook signature: ${err.message}` }, { status: 400 })
  }

  const sb = supabaseAdmin()

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object
        const meta    = session.metadata || {}

        if (meta.tienda_id) {
          await sb.from('tiendas').update({
            activo:              true,
            subscription_status: 'active',
            ...(meta.plan ? { plan: meta.plan } : {}),
          }).eq('id', meta.tienda_id)
          console.log('[stripe-webhook] kiosko activado:', meta.tienda_id)
        } else if (meta.restaurante_id) {
          // Subscription created with trial — mark as trialing
          await sb.from('restaurantes').update({
            subscription_status: 'trialing',
          }).eq('id', meta.restaurante_id)
          console.log('[stripe-webhook] restaurante en trial:', meta.restaurante_id)
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        if (!invoice.subscription) break
        const sub  = await stripe.subscriptions.retrieve(invoice.subscription)
        const meta = sub.metadata || {}

        if (meta.restaurante_id) {
          // Trial period ended and first real payment succeeded
          await sb.from('restaurantes').update({
            subscription_status: 'active',
          }).eq('id', meta.restaurante_id)
          console.log('[stripe-webhook] restaurante activado tras pago:', meta.restaurante_id)
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub       = event.data.object
        const meta      = sub.metadata || {}
        const newStatus = STATUS_MAP[sub.status]
        if (!newStatus) break

        if (meta.tienda_id) {
          await sb.from('tiendas').update({
            subscription_status: newStatus,
            activo: sub.status === 'active',
          }).eq('id', meta.tienda_id)
        } else if (meta.restaurante_id) {
          await sb.from('restaurantes').update({
            subscription_status: newStatus,
          }).eq('id', meta.restaurante_id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub  = event.data.object
        const meta = sub.metadata || {}

        if (meta.tienda_id) {
          await sb.from('tiendas').update({
            activo:              false,
            subscription_status: 'cancelled',
          }).eq('id', meta.tienda_id)
          console.log('[stripe-webhook] kiosko cancelado:', meta.tienda_id)
        } else if (meta.restaurante_id) {
          await sb.from('restaurantes').update({
            subscription_status: 'cancelled',
          }).eq('id', meta.restaurante_id)
          console.log('[stripe-webhook] restaurante cancelado:', meta.restaurante_id)
        }
        break
      }

      default:
        // Ignored event
    }

    return Response.json({ received: true })
  } catch (err) {
    console.error('[stripe-webhook] error procesando evento:', event.type, err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
