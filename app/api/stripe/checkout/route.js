import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://cataconjuanjo.com'

// Mapa de plan → precio de Stripe (configura los IDs en las env vars)
const PRICE_IDS = {
  basic:   process.env.STRIPE_PRICE_BASIC,
  pro:     process.env.STRIPE_PRICE_PRO,
  premium: process.env.STRIPE_PRICE_PREMIUM,
}

export async function POST(req) {
  try {
    const { plan, restaurante_id, email, nombre } = await req.json()

    if (!plan || !PRICE_IDS[plan]) {
      return Response.json({ error: 'Plan no válido.' }, { status: 400 })
    }
    if (!email) {
      return Response.json({ error: 'Email obligatorio.' }, { status: 400 })
    }

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Buscar o crear el customer en Stripe
    let stripeCustomerId = null

    if (restaurante_id) {
      const { data: rest } = await adminSupabase
        .from('restaurantes')
        .select('stripe_customer_id')
        .eq('id', restaurante_id)
        .single()

      stripeCustomerId = rest?.stripe_customer_id
    }

    if (!stripeCustomerId) {
      // Buscar si ya existe en Stripe por email
      const existing = await stripe.customers.list({ email, limit: 1 })
      if (existing.data.length > 0) {
        stripeCustomerId = existing.data[0].id
      } else {
        const customer = await stripe.customers.create({
          email,
          name: nombre || undefined,
          metadata: { restaurante_id: restaurante_id || '' }
        })
        stripeCustomerId = customer.id
      }

      // Guardar el customer_id en el restaurante si tenemos el id
      if (restaurante_id) {
        await adminSupabase
          .from('restaurantes')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('id', restaurante_id)
      }
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
        trial_period_days: 14, // 14 días de prueba gratis
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
