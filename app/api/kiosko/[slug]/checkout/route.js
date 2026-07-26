import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://cataconjuanjo.com'

const PRICE_IDS = {
  basico:  process.env.STRIPE_PRICE_KIOSKO_BASICO  || 'price_1TwhPQJewpUM60dKMDpfQ4dP',
  premium: process.env.STRIPE_PRICE_KIOSKO_PREMIUM || 'price_1TxLdbJewpUM60dKJ4zEkO4D',
}

export async function POST(req, { params }) {
  const { slug } = await params

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return Response.json({ error: 'Sin sesión' }, { status: 401 })

  const sc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: { user }, error: authErr } = await sc.auth.getUser(token)
  if (authErr || !user) return Response.json({ error: 'Sesión inválida' }, { status: 401 })

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id, nombre, slug, plan, propietario_email, email')
    .eq('slug', slug)
    .single()

  if (!tienda) return Response.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const email = user.email?.toLowerCase()
  const emailTienda = tienda.propietario_email?.toLowerCase() || tienda.email?.toLowerCase()
  if (email !== emailTienda) return Response.json({ error: 'No autorizado' }, { status: 403 })

  const plan = tienda.plan && tienda.plan !== 'trial' ? tienda.plan : 'premium'
  const priceId = PRICE_IDS[plan]
  if (!priceId) return Response.json({ error: 'Plan sin precio configurado' }, { status: 400 })

  if (!process.env.STRIPE_SECRET_KEY) return Response.json({ error: 'Stripe no configurado' }, { status: 500 })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const existing = await stripe.customers.list({ email: emailTienda, limit: 1 })
  const customer = existing.data[0] || await stripe.customers.create({
    email: emailTienda,
    name: tienda.nombre,
    metadata: { tienda_id: tienda.id, tienda_slug: tienda.slug },
  })

  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${SITE_URL}/kiosko-admin/${slug}?checkout=ok`,
    cancel_url:  `${SITE_URL}/kiosko-admin/${slug}`,
    metadata: { tipo: 'kiosko', tienda_id: tienda.id, tienda_slug: tienda.slug, plan },
    subscription_data: { metadata: { tipo: 'kiosko', tienda_id: tienda.id, tienda_slug: tienda.slug, plan } },
    automatic_tax: { enabled: true },
    customer_update: { address: 'auto', name: 'auto' },
    locale: 'es',
  })

  return Response.json({ url: session.url })
}
