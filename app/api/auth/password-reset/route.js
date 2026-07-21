import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://cataconjuanjo.com'
const FROM = process.env.CARTA_VIVA_FROM || 'Carta Viva <onboarding@resend.dev>'
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60 * 60 * 1000

function getIP(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
}

async function checkRateLimit(ip) {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabaseAdmin
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('endpoint', 'password-reset')
    .gte('created_at', since)
  if ((count || 0) >= RATE_LIMIT) return false
  await supabaseAdmin.from('rate_limits').insert({ ip, endpoint: 'password-reset' })
  return true
}

async function userExists(adminSupabase, email) {
  let page = 1
  while (page < 20) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    if (data.users.some(user => user.email?.toLowerCase() === email)) return true
    if (!data.users.length || data.users.length < 100) return false
    page += 1
  }
  return false
}

function resetEmail(link) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;line-height:1.55">
      <h1 style="font-size:24px;font-weight:500;margin:0 0 16px">Restablecer contraseña</h1>
      <p>Hemos recibido una solicitud para cambiar la contraseña de tu cuenta de Carta Viva.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#111;color:#fff;text-decoration:none;padding:12px 18px;display:inline-block">Crear nueva contraseña</a>
      </p>
      <p>Si no has solicitado este cambio, puedes ignorar este mensaje.</p>
    </div>
  `
}

export async function POST(req) {
  try {
    const { email } = await req.json()
    const emailLimpio = String(email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)) {
      return Response.json({ ok: true })
    }
    if (!await checkRateLimit(getIP(req))) {
      return Response.json({ ok: true })
    }

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: restaurante } = await adminSupabase
      .from('restaurantes')
      .select('id,email')
      .eq('email', emailLimpio)
      .maybeSingle()

    const esAdmin = emailLimpio === ADMIN_EMAIL.toLowerCase()
    if ((restaurante || esAdmin) && await userExists(adminSupabase, emailLimpio)) {
      const { data, error } = await adminSupabase.auth.admin.generateLink({
        type: 'recovery',
        email: emailLimpio,
        options: { redirectTo: `${SITE_URL}/bienvenida` },
      })
      if (error) throw error
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: FROM,
        to: emailLimpio,
        subject: 'Restablecer contraseña de Carta Viva',
        html: resetEmail(data?.properties?.action_link),
      })
    }

    return Response.json({ ok: true })
  } catch (error) {
    console.error('[password-reset]', error)
    return Response.json({ ok: true })
  }
}
