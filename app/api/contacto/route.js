import { Resend } from 'resend'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const resend = new Resend(process.env.RESEND_API_KEY)
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60 * 60 * 1000

function getIP(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

async function checkRateLimit(ip) {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabaseAdmin
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('endpoint', 'contacto')
    .gte('created_at', since)

  if ((count || 0) >= RATE_LIMIT) return false

  await supabaseAdmin.from('rate_limits').insert({ ip, endpoint: 'contacto' })
  return true
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export async function POST(req) {
  const { nombre, email, restaurante, mensaje, source } = await req.json()

  try {
    const nombreLimpio = String(nombre || '').trim().slice(0, 120)
    const emailLimpio = String(email || '').trim().toLowerCase().slice(0, 160)
    const restauranteLimpio = String(restaurante || '').trim().slice(0, 160)
    const mensajeLimpio = String(mensaje || '').trim().slice(0, 2000)
    const sourceLimpio = String(source || '').trim().slice(0, 140)

    if (!nombreLimpio || !emailLimpio || !mensajeLimpio || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)) {
      return Response.json({ ok: false, error: 'Datos no validos.' }, { status: 400 })
    }

    const allowed = await checkRateLimit(getIP(req))
    if (!allowed) {
      return Response.json({ ok: false, error: 'Demasiados mensajes. Prueba de nuevo en un rato.' }, { status: 429 })
    }

    await resend.emails.send({
      from: 'Cata con Juanjo <onboarding@resend.dev>',
      to: 'cataconjuanjo@gmail.com',
      subject: `${sourceLimpio || 'Nuevo contacto'}: ${restauranteLimpio || 'Cata con Juanjo'}`,
      html: `
        <h2>Nuevo mensaje desde cataconjuanjo.com</h2>
        <p><strong>Nombre:</strong> ${escapeHtml(nombreLimpio)}</p>
        <p><strong>Email:</strong> ${escapeHtml(emailLimpio)}</p>
        <p><strong>Restaurante:</strong> ${escapeHtml(restauranteLimpio)}</p>
        <p><strong>Origen:</strong> ${escapeHtml(sourceLimpio || 'No indicado')}</p>
        <p><strong>Mensaje:</strong></p>
        <p>${escapeHtml(mensajeLimpio).replace(/\n/g, '<br>')}</p>
      `
    })
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ ok: false }, { status: 500 })
  }
}
