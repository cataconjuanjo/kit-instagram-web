import Stripe from 'stripe'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const SITE_URL   = process.env.NEXT_PUBLIC_SITE_URL || 'https://cataconjuanjo.com'
const ADMIN_EMAILS = new Set(['cataconjuanjo@gmail.com', process.env.NEXT_PUBLIC_ADMIN_EMAIL].filter(Boolean).map(e => e.toLowerCase()))
const FROM       = process.env.CARTA_VIVA_FROM || 'Carta Viva <onboarding@resend.dev>'

const PRICE_IDS = {
  basico:   process.env.STRIPE_PRICE_KIOSKO_BASICO  || 'price_1TwhPQJewpUM60dKMDpfQ4dP',
  premium:  process.env.STRIPE_PRICE_KIOSKO_PREMIUM || 'price_1TxLdbJewpUM60dKJ4zEkO4D',
}

function escapeHtml(v = '') {
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

async function validarAdmin(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Sin sesión', status: 401 }
  const sc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data, error } = await sc.auth.getUser(token)
  if (error || !data?.user) return { error: 'Sesión inválida', status: 401 }
  if (!ADMIN_EMAILS.has(data.user.email?.toLowerCase())) return { error: 'No autorizado', status: 403 }
  return { user: data.user }
}

async function findUserByEmail(sb, email) {
  let page = 1
  while (page < 20) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const found = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if (!data.users.length || data.users.length < 100) return null
    page++
  }
  return null
}

async function ensureUser(sb, email, nombre) {
  const existing = await findUserByEmail(sb, email)
  if (existing) return existing
  const { data, error } = await sb.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { kiosko: nombre },
  })
  if (error) throw error
  return data.user
}

async function linkContrasena(sb, email, slug) {
  const { data, error } = await sb.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${SITE_URL}/kiosko-admin/${slug}` },
  })
  if (error) throw error
  return data?.properties?.action_link
}

async function crearCheckout({ tienda, plan }) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe no configurado.')
  const priceId = PRICE_IDS[plan]
  if (!priceId) throw new Error(`Plan '${plan}' sin precio Stripe configurado.`)

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const email  = tienda.propietario_email
  const existing = await stripe.customers.list({ email, limit: 1 })
  const customer = existing.data[0] || await stripe.customers.create({
    email,
    name: tienda.nombre,
    metadata: { tienda_id: tienda.id, tienda_slug: tienda.slug },
  })
  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${SITE_URL}/kiosko-admin/${tienda.slug}?checkout=ok`,
    cancel_url:  `${SITE_URL}/kiosko-admin/${tienda.slug}?checkout=cancel`,
    metadata: { tienda_id: tienda.id, tienda_slug: tienda.slug, plan },
    subscription_data: { metadata: { tienda_id: tienda.id, tienda_slug: tienda.slug, plan } },
    locale: 'es',
    allow_promotion_codes: true,
  })
  return { url: session.url, customerId: customer.id }
}

function emailActivacion({ tienda, accessLink, checkoutUrl, plan }) {
  const nombre   = escapeHtml(tienda.nombre)
  const planLabel = plan === 'premium' ? 'Premium (99 €/mes)' : 'Básico (59 €/mes)'
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#222;line-height:1.6">
      <h1 style="font-size:22px;font-weight:600;margin:0 0 16px">Acceso a tu kiosko de vinos</h1>
      <p>Hola,</p>
      <p>Ya tienes preparado tu kiosko digital <strong>${nombre}</strong> en plan <strong>${planLabel}</strong>.</p>
      <p>Completa estos dos pasos para activarlo:</p>

      <p style="margin:24px 0">
        <strong>1. Elige tu contraseña</strong><br>
        <a href="${accessLink}" style="display:inline-block;margin-top:10px;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px">Crear contraseña →</a>
      </p>

      <p style="margin:24px 0">
        <strong>2. Activa tu suscripción</strong><br>
        <a href="${checkoutUrl}" style="display:inline-block;margin-top:10px;background:#74223d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px">Pagar con Stripe →</a>
      </p>

      <p>Una vez completado el pago, tu kiosko queda activo y tus clientes podrán navegar tu carta de vinos desde cualquier dispositivo.</p>
      <p>Accede a gestionar tu kiosko desde:<br>
        <a href="${SITE_URL}/kiosko-admin/${tienda.slug}">${SITE_URL}/kiosko-admin/${tienda.slug}</a>
      </p>
      <p>Un saludo,<br>Juanjo</p>
    </div>
  `
}

export async function POST(req) {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const { tienda_slug, plan = 'premium' } = await req.json()
    if (!tienda_slug) return Response.json({ error: 'tienda_slug obligatorio' }, { status: 400 })
    if (!PRICE_IDS[plan]) return Response.json({ error: `Plan '${plan}' no válido` }, { status: 400 })

    const { data: tienda, error: tErr } = await sb
      .from('tiendas')
      .select('id, nombre, slug, propietario_email, precio_especial')
      .eq('slug', tienda_slug)
      .single()
    if (tErr || !tienda) return Response.json({ error: 'Tienda no encontrada' }, { status: 404 })
    if (!tienda.propietario_email) return Response.json({ error: 'La tienda no tiene email de propietario. Asígnalo primero en Editar.' }, { status: 400 })

    await ensureUser(sb, tienda.propietario_email, tienda.nombre)
    const accessLink = await linkContrasena(sb, tienda.propietario_email, tienda.slug)
    const checkout   = await crearCheckout({ tienda, plan })

    // Marcar como pendiente de pago
    await sb.from('tiendas').update({
      plan,
      subscription_status: 'pending',
    }).eq('id', tienda.id)

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM,
      to: tienda.propietario_email,
      bcc: 'cataconjuanjo@gmail.com',
      subject: `Activa tu kiosko ${tienda.nombre} — Carta Viva`,
      html: emailActivacion({ tienda, accessLink, checkoutUrl: checkout.url, plan }),
    })

    return Response.json({
      ok: true,
      email: tienda.propietario_email,
      checkout_url: checkout.url,
      access_link: accessLink,
    })
  } catch (err) {
    console.error('[kiosko-activacion]', err)
    return Response.json({ error: err.message || 'Error al enviar activación' }, { status: 500 })
  }
}
