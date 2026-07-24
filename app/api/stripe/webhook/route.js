import Stripe from 'stripe'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const SITE_URL    = process.env.NEXT_PUBLIC_SITE_URL   || 'https://cataconjuanjo.com'
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'
const FROM        = process.env.CARTA_VIVA_FROM        || 'Carta Viva <onboarding@resend.dev>'

function randomPassword() {
  return `Kiosko-${randomUUID().slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}!`
}

function escapeHtml(v = '') {
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
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

async function emailBienvenidaKiosko({ nombre, email, slug, accessLink }) {
  const n = escapeHtml(nombre)
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e;line-height:1.6">
  <h1 style="font-size:22px;font-weight:600;margin:0 0 20px;color:#1a1a2e">¡Tu Kiosko Virtual ya está activo!</h1>
  <p>Hola,</p>
  <p>El pago se ha completado correctamente. Tu kiosko digital <strong>${n}</strong> está listo para usar.</p>

  <div style="background:#f4f3f0;border-radius:10px;padding:20px;margin:24px 0">
    <p style="margin:0 0 12px;font-weight:700;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#888">Crea tu contraseña de acceso</p>
    <p style="margin:0 0 16px;font-size:14px;color:#555">Pulsa el botón para establecer tu contraseña y entrar al panel.</p>
    <a href="${accessLink}" style="display:inline-block;background:#1a1a2e;color:#c9a96e;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px">
      Crear contraseña y entrar →
    </a>
  </div>

  <p style="font-size:14px;color:#666">
    Una vez creada la contraseña, entra desde:<br>
    <a href="${SITE_URL}/login" style="color:#1a1a2e">${SITE_URL}/login</a>
  </p>
  <p style="font-size:14px;color:#666">Tu kiosko estará disponible en: <a href="${SITE_URL}/kiosko/${slug}" style="color:#1a1a2e">${SITE_URL}/kiosko/${slug}</a></p>
  <p style="font-size:13px;color:#999;margin-top:32px">Juanjo · cataconjuanjo.com</p>
</div>`
}

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
        const session     = event.data.object
        const customerId  = session.customer
        const subscriptionId = session.subscription
        const tipo        = session.metadata?.tipo

        // ── Kiosko admin-created: activar tienda existente ──────
        if (tipo === 'kiosko') {
          const tiendaId = session.metadata?.tienda_id
          if (!tiendaId) break

          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          await adminSupabase.from('tiendas').update({
            activo:                 true,
            subscription_status:    estadoDesdeStripe(subscription.status),
            stripe_customer_id:     customerId,
            stripe_subscription_id: subscriptionId,
          }).eq('id', tiendaId)

          // Generar link de acceso y enviar email de bienvenida
          const { data: tienda } = await adminSupabase.from('tiendas').select('nombre, email, slug').eq('id', tiendaId).single()
          if (tienda?.email) {
            const { data: linkData } = await adminSupabase.auth.admin.generateLink({
              type:    'recovery',
              email:   tienda.email,
              options: { redirectTo: `${SITE_URL}/kiosko-admin/${tienda.slug}` },
            })
            const accessLink = linkData?.properties?.action_link
            if (accessLink) {
              const resend = new Resend(process.env.RESEND_API_KEY)
              await resend.emails.send({
                from:    FROM,
                to:      tienda.email,
                bcc:     ADMIN_EMAIL,
                subject: `¡Tu kiosko está activo! — ${tienda.nombre}`,
                html:    await emailBienvenidaKiosko({ nombre: tienda.nombre, email: tienda.email, slug: tienda.slug, accessLink }),
              })
            }
          }
          console.log(`✓ checkout.session.completed kiosko — tienda ${tiendaId} activada`)
          break
        }

        // ── Kiosko self-service: crear tienda + usuario ──────────
        if (tipo === 'kiosko_nuevo') {
          const { nombre, email, ciudad, slug } = session.metadata || {}
          if (!nombre || !email || !slug) break

          const subscription = await stripe.subscriptions.retrieve(subscriptionId)

          // Comprobar que el slug sigue libre (por si hubo una carrera)
          const { data: existente } = await adminSupabase.from('tiendas').select('id').eq('slug', slug).single()
          const tiendaSlug = existente ? `${slug}-${Date.now().toString(36)}` : slug

          const { data: tienda, error: tiendaErr } = await adminSupabase.from('tiendas').insert({
            nombre:              nombre.trim(),
            email:               email.trim().toLowerCase(),
            slug:                tiendaSlug,
            ciudad:              ciudad || null,
            color_primario:      '#1a1a2e',
            color_acento:        '#c9a96e',
            activo:              true,
            subscription_status: estadoDesdeStripe(subscription.status),
            stripe_customer_id:  customerId,
            stripe_subscription_id: subscriptionId,
          }).select().single()

          if (tiendaErr) {
            console.error('[webhook kiosko_nuevo] tienda:', tiendaErr)
            break
          }

          // Crear usuario
          await ensureUser(adminSupabase, email.trim(), nombre.trim())

          // Link para crear contraseña
          const { data: linkData } = await adminSupabase.auth.admin.generateLink({
            type:    'recovery',
            email:   email.trim(),
            options: { redirectTo: `${SITE_URL}/kiosko-admin/${tiendaSlug}` },
          })
          const accessLink = linkData?.properties?.action_link

          if (accessLink) {
            const resend = new Resend(process.env.RESEND_API_KEY)
            await resend.emails.send({
              from:    FROM,
              to:      email.trim(),
              bcc:     ADMIN_EMAIL,
              subject: `¡Tu kiosko está activo! — ${nombre.trim()}`,
              html:    await emailBienvenidaKiosko({ nombre, email, slug: tiendaSlug, accessLink }),
            })
          }

          console.log(`✓ checkout.session.completed kiosko_nuevo — tienda ${tienda.id} (${tiendaSlug}) creada`)
          break
        }

        // ── Restaurante (flujo existente) ────────────────────────
        const restaurante_id = session.metadata?.restaurante_id
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

        // También actualizar tiendas si corresponde
        await adminSupabase.from('tiendas')
          .update({ subscription_status, stripe_subscription_id: sub.id })
          .eq('stripe_customer_id', customerId)

        console.log(`✓ subscription.updated — customer ${customerId} → ${subscription_status} / plan ${plan}`)
        break
      }

      // ── Suscripción cancelada ─────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub        = event.data.object
        const customerId = sub.customer

        await adminSupabase
          .from('restaurantes')
          .update({ subscription_status: 'cancelled', stripe_subscription_id: null })
          .eq('stripe_customer_id', customerId)

        await adminSupabase.from('tiendas')
          .update({ activo: false, subscription_status: 'cancelled', stripe_subscription_id: null })
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

        await adminSupabase.from('tiendas')
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

          await adminSupabase.from('tiendas')
            .update({ activo: true, subscription_status: 'active' })
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
