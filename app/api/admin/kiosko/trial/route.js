import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const SITE_URL    = process.env.NEXT_PUBLIC_SITE_URL || 'https://cataconjuanjo.com'
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'
const ADMIN_EMAILS = new Set(['cataconjuanjo@gmail.com', ADMIN_EMAIL].filter(Boolean).map(e => e.toLowerCase()))
const FROM        = process.env.CARTA_VIVA_FROM || 'Carta Viva <onboarding@resend.dev>'

function escapeHtml(v = '') {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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

async function linkAcceso(sb, email, slug) {
  const { data, error } = await sb.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${SITE_URL}/kiosko-activar/${slug}` },
  })
  if (error) throw error
  return data?.properties?.action_link
}

function emailTrial({ tienda, accessLink }) {
  const nombre = escapeHtml(tienda.nombre || 'tu tienda')
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#222;line-height:1.6">
      <h1 style="font-size:22px;font-weight:600;margin:0 0 16px">Prueba gratuita de Carta Viva — 2 horas de uso real</h1>
      <p>Hola,</p>
      <p>Te dejo listo el acceso de prueba a <strong>Carta Viva</strong> para <strong>${nombre}</strong>.</p>
      <p>Tienes <strong>2 horas de uso real</strong> para explorar todas las funciones con acceso completo. El tiempo solo cuenta cuando tienes la pantalla abierta — puedes cerrar y volver cuando quieras y el tiempo restante se conserva.</p>

      <p style="margin:28px 0">
        <a href="${accessLink}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 22px;border-radius:6px;font-size:15px">Crear contraseña y entrar →</a>
      </p>

      <p>Una vez dentro, el temporizador aparece en la parte superior para que veas cuánto tiempo te queda.</p>
      <p>Si quieres activar el kiosko de forma permanente, me lo dices y te preparo el alta sin compromiso.</p>

      <p>Un saludo,<br>Juanjo</p>
    </div>
  `
}

export async function POST(req) {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const { tienda_slug, preview = false } = await req.json()
    if (!tienda_slug) return Response.json({ error: 'tienda_slug obligatorio' }, { status: 400 })

    const { data: tienda, error: tErr } = await sb
      .from('tiendas')
      .select('id, nombre, slug, propietario_email')
      .eq('slug', tienda_slug)
      .single()
    if (tErr || !tienda) return Response.json({ error: 'Tienda no encontrada' }, { status: 404 })
    if (!tienda.propietario_email) return Response.json({ error: 'La tienda no tiene email de propietario. Asígnalo primero en Editar.' }, { status: 400 })

    await ensureUser(sb, tienda.propietario_email, tienda.nombre)
    const accessLink = await linkAcceso(sb, tienda.propietario_email, tienda.slug)
    const html       = emailTrial({ tienda, accessLink })

    if (preview) {
      return Response.json({
        ok: true,
        preview: true,
        email: tienda.propietario_email,
        access_link: accessLink,
        email_html: html,
      })
    }

    // Activar trial: plan='trial', trial_used_seconds=0 (nuevo sistema de tiempo real)
    await sb.from('tiendas').update({
      plan: 'trial',
      trial_used_seconds: 0,
      trial_expires_at: null,
      subscription_status: 'inactive',
    }).eq('id', tienda.id)

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM,
      to: tienda.propietario_email,
      bcc: ADMIN_EMAIL,
      subject: `Prueba gratuita de Carta Viva — ${tienda.nombre}`,
      html,
    })

    return Response.json({
      ok: true,
      email: tienda.propietario_email,
      access_link: accessLink,
    })
  } catch (err) {
    console.error('[kiosko-trial]', err)
    return Response.json({ error: err.message || 'Error al enviar trial' }, { status: 500 })
  }
}
