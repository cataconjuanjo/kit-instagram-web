import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import {
  checkRateLimit,
  getClientIp,
  is,
  rateLimitResponse,
  sanitizeEmail,
  sanitizeText,
  validationErrorResponse,
} from '../../../lib/security'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://cataconjuanjo.com'
const RATE_LIMIT = 8
const RATE_WINDOW_MS = 60 * 60 * 1000

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export async function POST(req) {
  try {
    const allowed = await checkRateLimit(getClientIp(req), 'kiosko-contratar', {
      max: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS,
    })
    if (!allowed) return rateLimitResponse('Demasiados intentos. Prueba de nuevo mas tarde.')

    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_KIOSKO) {
      console.error('[kiosko/contratar] missing Stripe configuration', {
        stripe: Boolean(process.env.STRIPE_SECRET_KEY),
        price: Boolean(process.env.STRIPE_PRICE_KIOSKO),
      })
      return Response.json({ error: 'Contratacion no disponible en este momento.' }, { status: 503 })
    }

    const body = await req.json().catch(() => null)
    if (!body) return validationErrorResponse('Peticion invalida.')

    const nombre = sanitizeText(body.nombre, 120)
    const email = sanitizeEmail(body.email)
    const ciudad = sanitizeText(body.ciudad, 120)
    if (nombre.length < 2 || !is.email(email)) {
      return validationErrorResponse('Nombre y email validos son obligatorios.')
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    let base = slugify(nombre)
    if (!base) return validationErrorResponse('Nombre no valido.')
    let slug = base
    let intento = 0
    while (intento < 10) {
      const { data: existing } = await sb.from('tiendas').select('id').eq('slug', slug).single()
      if (!existing) break
      intento++
      slug = `${base}-${intento}`
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const existing = await stripe.customers.list({ email, limit: 1 })
    const customer = existing.data[0] || await stripe.customers.create({
      email,
      name: nombre,
      metadata: { slug },
    })

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_KIOSKO, quantity: 1 }],
      success_url: `${SITE_URL}/kiosko/bienvenida?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/kiosko/contratar?cancelado=1`,
      metadata: {
        tipo: 'kiosko_nuevo',
        nombre,
        email,
        ciudad,
        slug,
      },
      subscription_data: {
        metadata: { tipo: 'kiosko_nuevo', slug },
      },
      locale: 'es',
      allow_promotion_codes: true,
    })

    return Response.json({ url: session.url })
  } catch (err) {
    console.error('[kiosko/contratar]', err)
    return Response.json({ error: 'No se pudo iniciar la contratacion.' }, { status: 500 })
  }
}
