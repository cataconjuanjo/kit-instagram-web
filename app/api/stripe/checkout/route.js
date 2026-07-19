import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { requireRestaurantAccess } from '../../_lib/auth'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://cataconjuanjo.com'
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

function stripeTrialEnd(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const seconds = Math.floor(date.getTime() / 1000)
  const minTrialEnd = Math.floor(Date.now() / 1000) + 48 * 60 * 60
  return seconds >= minTrialEnd ? seconds : null
}

export async function POST(req) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return Response.json({ error: 'Stripe no configurado.' }, { status: 503 })
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const PRICE_IDS = {
      basic:   process.env.STRIPE_PRICE_BASIC,
      pro:     process.env.STRIPE_PRICE_PRO,
      bodega:  process.env.STRIPE_PRICE_BODEGA,
      premium: process.env.STRIPE_PRICE_PREMIUM,
    }
    const { plan, restaurante_id, email, nombre, trial_end } = await req.json()

    if (!plan || !PRICE_IDS[plan]) {
      return Response.json({ error: 'Plan no válido.' }, { status: 400 })
    }
    if (!restaurante_id) {
      return Response.json({ error: 'restaurante_id obligatorio.' }, { status: 400 })
    }

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const auth = await requireRestaurantAccess(req, adminSupabase, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })
    const isAdmin = (auth.user?.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase()
    const customTrialEnd = isAdmin ? stripeTrialEnd(trial_end) : null

    // Buscar o crear el customer en Stripe
    let stripeCustomerId = null

    const { data: rest } = await adminSupabase
      .from('restaurantes')
      .select('*')
      .eq('id', restaurante_id)
      .single()

    stripeCustomerId = rest?.stripe_customer_id
    const customerEmail = rest?.email || email
    const customerName = rest?.nombre || nombre
    if (!customerEmail) return Response.json({ error: 'Email obligatorio.' }, { status: 400 })

    if (!stripeCustomerId) {
      // Buscar si ya existe en Stripe por email
      const existing = await stripe.customers.list({ email: customerEmail, limit: 1 })
      if (existing.data.length > 0) {
        stripeCustomerId = existing.data[0].id
      } else {
        const customer = await stripe.customers.create({
          email: customerEmail,
          name: customerName || undefined,
          metadata: { restaurante_id: restaurante_id || '' }
        })
        stripeCustomerId = customer.id
      }

      // Guardar el customer_id en el restaurante si tenemos el id
      await adminSupabase
        .from('restaurantes')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', restaurante_id)
    }

    // Crear la sesión de checkout
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      success_url: `${SITE_URL}/dashboard?checkout=ok&plan=${plan}`,
      cancel_url:  `${SITE_URL}/dashboard?checkout=cancel`,
      metadata: {
        restaurante_id: restaurante_id || '',
        plan,
      },
      subscription_data: {
        metadata: {
          restaurante_id: restaurante_id || '',
          plan,
        },
        ...(customTrialEnd ? { trial_end: customTrialEnd } : { trial_period_days: 14 }),
      },
      locale: 'es',
      allow_promotion_codes: true,
    })

    return Response.json({ url: session.url })
  } catch (error) {
    console.error('Error creando sesión de checkout:', error)
    return Response.json({ error: 'No se pudo crear la sesión de pago.' }, { status: 500 })
  }
}
