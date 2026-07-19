import Stripe from 'stripe'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://cataconjuanjo.com'
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'
const FROM = process.env.CARTA_VIVA_FROM || 'Carta Viva <onboarding@resend.dev>'

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function randomPassword() {
  return `CartaViva-${randomUUID().slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}!`
}

function trialEndSeconds(value) {
  const date = new Date(value || '2026-09-01T00:00:00+02:00')
  if (Number.isNaN(date.getTime())) return null
  return Math.floor(date.getTime() / 1000)
}

function fechaLarga(value) {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
}

async function validarAdmin(req, adminSupabase) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Sesion no recibida', status: 401 }

  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data?.user) return { error: 'Sesion no valida', status: 401 }
  if ((data.user.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return { error: 'No autorizado', status: 403 }
  }
  return { user: data.user }
}

async function findUserByEmail(adminSupabase, email) {
  let page = 1
  while (page < 20) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const found = data.users.find(user => user.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if (!data.users.length || data.users.length < 100) return null
    page += 1
  }
  return null
}

async function ensureUser(adminSupabase, restaurante) {
  const existing = await findUserByEmail(adminSupabase, restaurante.email)
  if (existing) return existing
  const { data, error } = await adminSupabase.auth.admin.createUser({
    email: restaurante.email,
    password: randomPassword(),
    email_confirm: true,
    user_metadata: { restaurante: restaurante.nombre },
  })
  if (error) throw error
  return data.user
}

async function linkContrasena(adminSupabase, email) {
  const { data, error } = await adminSupabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${SITE_URL}/bienvenida` },
  })
  if (error) throw error
  return data?.properties?.action_link
}

async function crearCheckout({ restaurante, plan, trialEnd }) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe no configurado.')
  const priceIds = {
    basic: process.env.STRIPE_PRICE_BASIC,
    pro: process.env.STRIPE_PRICE_PRO,
    bodega: process.env.STRIPE_PRICE_BODEGA,
    premium: process.env.STRIPE_PRICE_PREMIUM,
  }
  if (!priceIds[plan]) throw new Error('Plan sin precio Stripe configurado.')

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const existing = await stripe.customers.list({ email: restaurante.email, limit: 1 })
  const customer = existing.data[0] || await stripe.customers.create({
    email: restaurante.email,
    name: restaurante.nombre,
    metadata: { restaurante_id: restaurante.id },
  })
  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceIds[plan], quantity: 1 }],
    success_url: `${SITE_URL}/dashboard?checkout=ok&plan=${plan}`,
    cancel_url: `${SITE_URL}/dashboard?checkout=cancel`,
    metadata: { restaurante_id: restaurante.id, plan },
    subscription_data: {
      metadata: { restaurante_id: restaurante.id, plan },
      trial_end: trialEndSeconds(trialEnd),
    },
    locale: 'es',
    allow_promotion_codes: true,
  })
  return { url: session.url, customerId: customer.id }
}

function emailActivacion({ restaurante, accessLink, checkoutUrl, trialEnd }) {
  const nombre = escapeHtml(restaurante.nombre || 'tu restaurante')
  const fecha = escapeHtml(fechaLarga(trialEnd))
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#222;line-height:1.55">
      <h1 style="font-size:24px;font-weight:500;margin:0 0 16px">Activacion de Carta Viva</h1>
      <p>Hola,</p>
      <p>Te dejo preparada la prueba gratuita de <strong>Carta Viva</strong> para <strong>${nombre}</strong>.</p>
      <p>Para activarla, completa estos dos pasos:</p>
      <p style="margin:24px 0">
        <a href="${accessLink}" style="background:#111;color:#fff;text-decoration:none;padding:12px 18px;display:inline-block">Crear contrasena</a>
      </p>
      <p style="margin:24px 0">
        <a href="${checkoutUrl}" style="background:#74223d;color:#fff;text-decoration:none;padding:12px 18px;display:inline-block">Activar prueba gratuita en Stripe</a>
      </p>
      <p>No se cobrara nada hasta el <strong>${fecha}</strong>. Puedes cancelar antes en cualquier momento sin coste.</p>
      <p>Una vez creada la contrasena, podras entrar desde:<br><a href="${SITE_URL}/login">${SITE_URL}/login</a></p>
      <p>Tu carta publica esta preparada aqui:<br><a href="${SITE_URL}/carta/${escapeHtml(restaurante.slug)}">${SITE_URL}/carta/${escapeHtml(restaurante.slug)}</a></p>
      <p>Un saludo,<br>Juanjo</p>
    </div>
  `
}

export async function POST(req) {
  try {
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const admin = await validarAdmin(req, adminSupabase)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim()
    const plan = body.plan || 'premium'
    const trialEnd = body.trial_end || '2026-09-01T00:00:00+02:00'
    if (!restauranteId) return Response.json({ error: 'restaurante_id obligatorio.' }, { status: 400 })

    const { data: restaurante, error: restError } = await adminSupabase
      .from('restaurantes')
      .select('*')
      .eq('id', restauranteId)
      .single()
    if (restError || !restaurante) return Response.json({ error: 'Restaurante no encontrado.' }, { status: 404 })
    if (!restaurante.email) return Response.json({ error: 'El restaurante no tiene email.' }, { status: 400 })

    await ensureUser(adminSupabase, restaurante)
    const accessLink = await linkContrasena(adminSupabase, restaurante.email)
    const checkout = await crearCheckout({ restaurante, plan, trialEnd })

    await adminSupabase
      .from('restaurantes')
      .update({
        plan,
        subscription_status: 'past_due',
        trial_expires_at: new Date(trialEnd).toISOString(),
        trial_started_at: new Date().toISOString(),
        trial_active_seconds_limit: null,
      })
      .eq('id', restaurante.id)

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM,
      to: restaurante.email,
      bcc: ADMIN_EMAIL,
      subject: `Activacion de Carta Viva para ${restaurante.nombre}`,
      html: emailActivacion({ restaurante, accessLink, checkoutUrl: checkout.url, trialEnd }),
    })

    return Response.json({
      ok: true,
      email: restaurante.email,
      checkout_url: checkout.url,
      access_link: accessLink,
    })
  } catch (error) {
    console.error('[admin-activacion]', error)
    return Response.json({ error: error.message || 'No se pudo enviar la activacion.' }, { status: 500 })
  }
}
