import Stripe from 'stripe'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const SITE_URL   = process.env.NEXT_PUBLIC_SITE_URL  || 'https://cataconjuanjo.com'
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'
const FROM       = process.env.CARTA_VIVA_FROM || 'Carta Viva <onboarding@resend.dev>'

function randomPassword() {
  return `Kiosko-${randomUUID().slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}!`
}

function escapeHtml(v = '') {
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

async function validarAdmin(req, sb) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Sin sesión', status: 401 }
  const sc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data, error } = await sc.auth.getUser(token)
  if (error || !data?.user) return { error: 'Sesión inválida', status: 401 }
  if (data.user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) return { error: 'No autorizado', status: 403 }
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
    password: randomPassword(),
    email_confirm: true,
    user_metadata: { kiosko: nombre },
  })
  if (error) throw error
  return data.user
}

async function linkContraseña(sb, email) {
  const { data, error } = await sb.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${SITE_URL}/kiosko-admin` },
  })
  if (error) throw error
  return data?.properties?.action_link
}

async function crearCheckoutKiosko({ tiendaId, email, nombre }) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe no configurado')
  if (!process.env.STRIPE_PRICE_KIOSKO) throw new Error('Falta STRIPE_PRICE_KIOSKO en .env.local')

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const existing = await stripe.customers.list({ email, limit: 1 })
  const customer = existing.data[0] || await stripe.customers.create({
    email,
    name: nombre,
    metadata: { tienda_id: tiendaId },
  })
  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: process.env.STRIPE_PRICE_KIOSKO, quantity: 1 }],
    success_url: `${SITE_URL}/kiosko-admin?pago=ok`,
    cancel_url:  `${SITE_URL}/kiosko-admin?pago=cancel`,
    metadata: { tipo: 'kiosko', tienda_id: tiendaId },
    subscription_data: { metadata: { tipo: 'kiosko', tienda_id: tiendaId } },
    locale: 'es',
    allow_promotion_codes: true,
  })
  return { url: session.url, customerId: customer.id }
}

function emailKiosko({ nombre, email, accessLink, checkoutUrl }) {
  const n = escapeHtml(nombre)
  const e = escapeHtml(email)
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e;line-height:1.6">
  <h1 style="font-size:22px;font-weight:600;margin:0 0 20px;color:#1a1a2e">Tu Kiosko Virtual está listo</h1>
  <p>Hola,</p>
  <p>He preparado el acceso al kiosko digital para <strong>${n}</strong>.</p>
  <p>Completa estos dos pasos para activarlo:</p>

  <div style="background:#f4f3f0;border-radius:10px;padding:20px;margin:24px 0">
    <p style="margin:0 0 12px;font-weight:700;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#888">Paso 1 — Crea tu contraseña</p>
    <p style="margin:0 0 16px;font-size:14px;color:#555">Pulsa el botón para establecer tu contraseña de acceso.</p>
    <a href="${accessLink}" style="display:inline-block;background:#1a1a2e;color:#c9a96e;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px">
      Crear contraseña →
    </a>
  </div>

  <div style="background:#f4f3f0;border-radius:10px;padding:20px;margin:24px 0">
    <p style="margin:0 0 12px;font-weight:700;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#888">Paso 2 — Activa la suscripción</p>
    <p style="margin:0 0 16px;font-size:14px;color:#555">El kiosko se activa automáticamente al completar el pago.</p>
    <a href="${checkoutUrl}" style="display:inline-block;background:#c9a96e;color:#1a1a2e;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px">
      Pagar suscripción →
    </a>
  </div>

  <p style="font-size:14px;color:#666">
    Una vez completados los dos pasos, entra desde:<br>
    <a href="${SITE_URL}/login" style="color:#1a1a2e">${SITE_URL}/login</a>
  </p>
  <p style="font-size:13px;color:#999;margin-top:32px">Juanjo · cataconjuanjo.com</p>
</div>`
}

export async function POST(req) {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const check = await validarAdmin(req, sb)
    if (check.error) return Response.json({ error: check.error }, { status: check.status })

    const body = await req.json()
    const { nombre, email, slug, ciudad, color_primario, color_acento } = body

    if (!nombre?.trim() || !email?.trim() || !slug?.trim()) {
      return Response.json({ error: 'nombre, email y slug son obligatorios' }, { status: 400 })
    }

    // Comprobar que el slug no existe ya
    const { data: existing } = await sb.from('tiendas').select('id').eq('slug', slug.trim()).single()
    if (existing) return Response.json({ error: `El slug "${slug}" ya está en uso` }, { status: 409 })

    // Crear tienda (inactiva hasta que pague)
    const { data: tienda, error: tiendaErr } = await sb.from('tiendas').insert({
      nombre:          nombre.trim(),
      email:           email.trim().toLowerCase(),
      slug:            slug.trim(),
      ciudad:          ciudad?.trim() || null,
      color_primario:  color_primario || '#1a1a2e',
      color_acento:    color_acento   || '#c9a96e',
      activo:          false,
      subscription_status: 'pending',
    }).select().single()

    if (tiendaErr) {
      console.error('[kiosko/crear] tienda:', tiendaErr)
      return Response.json({ error: tiendaErr.message }, { status: 500 })
    }

    // Crear usuario Supabase
    await ensureUser(sb, email.trim(), nombre.trim())

    // Link para crear contraseña
    const accessLink = await linkContraseña(sb, email.trim())

    // Checkout Stripe
    const checkout = await crearCheckoutKiosko({
      tiendaId: tienda.id,
      email:    email.trim(),
      nombre:   nombre.trim(),
    })

    // Actualizar stripe_customer_id
    await sb.from('tiendas').update({ stripe_customer_id: checkout.customerId }).eq('id', tienda.id)

    // Enviar email
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from:    FROM,
      to:      email.trim(),
      bcc:     ADMIN_EMAIL,
      subject: `Tu kiosko virtual — ${nombre.trim()}`,
      html:    emailKiosko({ nombre: nombre.trim(), email: email.trim(), accessLink, checkoutUrl: checkout.url }),
    })

    return Response.json({
      ok: true,
      tienda_id:    tienda.id,
      slug:         tienda.slug,
      checkout_url: checkout.url,
      access_link:  accessLink,
    })
  } catch (err) {
    console.error('[admin/kiosko/crear]', err)
    return Response.json({ error: err.message || 'Error al crear el kiosko' }, { status: 500 })
  }
}
