import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://cataconjuanjo.com'

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export async function POST(req) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe no configurado')
    if (!process.env.STRIPE_PRICE_KIOSKO) throw new Error('Falta STRIPE_PRICE_KIOSKO en .env.local')

    const { nombre, email, ciudad } = await req.json()
    if (!nombre?.trim() || !email?.trim()) {
      return Response.json({ error: 'nombre y email son obligatorios' }, { status: 400 })
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Generar slug único
    let base = slugify(nombre.trim())
    let slug = base
    let intento = 0
    while (intento < 10) {
      const { data: existing } = await sb.from('tiendas').select('id').eq('slug', slug).single()
      if (!existing) break
      intento++
      slug = `${base}-${intento}`
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const existing = await stripe.customers.list({ email: email.trim(), limit: 1 })
    const customer = existing.data[0] || await stripe.customers.create({
      email:    email.trim(),
      name:     nombre.trim(),
      metadata: { slug },
    })

    const session = await stripe.checkout.sessions.create({
      customer:             customer.id,
      mode:                 'subscription',
      payment_method_types: ['card'],
      line_items:           [{ price: process.env.STRIPE_PRICE_KIOSKO, quantity: 1 }],
      success_url:          `${SITE_URL}/kiosko/bienvenida?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:           `${SITE_URL}/kiosko/contratar?cancelado=1`,
      metadata: {
        tipo:    'kiosko_nuevo',
        nombre:  nombre.trim(),
        email:   email.trim().toLowerCase(),
        ciudad:  ciudad?.trim() || '',
        slug,
      },
      subscription_data: {
        metadata: { tipo: 'kiosko_nuevo', slug },
      },
      locale:                 'es',
      allow_promotion_codes:  true,
    })

    return Response.json({ url: session.url })
  } catch (err) {
    console.error('[kiosko/contratar]', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
