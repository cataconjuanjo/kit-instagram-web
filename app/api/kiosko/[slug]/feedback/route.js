import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = process.env.CARTA_VIVA_FROM || 'Carta Viva <onboarding@resend.dev>'
const ADMIN  = 'jjgarciapozo@gmail.com'

const LABELS = { 1: '😢 Muy malo', 2: '😟 Malo', 3: '😐 Regular', 4: '🙂 Bueno', 5: '😄 Excelente' }

export async function POST(request, { params }) {
  const { slug } = await params

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const rating    = Number(body?.rating)
  const sugerencia = String(body?.sugerencia || '').trim().slice(0, 1000)

  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating inválido' }, { status: 400 })
  }

  const { data: tienda } = await supabaseAdmin
    .from('tiendas').select('nombre, ciudad').eq('slug', slug).single()

  const nombreTienda = tienda?.nombre || slug
  const ciudadTienda = tienda?.ciudad ? ` (${tienda.ciudad})` : ''

  try {
    await resend.emails.send({
      from:    FROM,
      to:      ADMIN,
      subject: `Kiosko feedback — ${LABELS[rating]} — ${nombreTienda}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:2rem">
          <h2 style="color:#1a1a2e;margin-bottom:.5rem">Feedback del Kiosko Virtual</h2>
          <p style="color:#666;font-size:.9rem;margin-bottom:1.5rem">
            Tienda: <strong>${nombreTienda}${ciudadTienda}</strong> · Slug: <code>${slug}</code>
          </p>
          <div style="background:#f7f6f3;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.25rem">
            <p style="font-size:1.5rem;margin:0 0 .25rem">${LABELS[rating]}</p>
            <p style="color:#888;font-size:.8rem;margin:0">Valoración ${rating}/5</p>
          </div>
          ${sugerencia ? `
          <div style="background:#fff3cd;border-left:3px solid #c9a96e;padding:1rem 1.25rem;border-radius:0 8px 8px 0">
            <p style="font-size:.75rem;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.06em;margin:0 0 .5rem">Sugerencia del usuario</p>
            <p style="margin:0;color:#1a1a2e;line-height:1.6">${sugerencia.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</p>
          </div>
          ` : '<p style="color:#aaa;font-size:.85rem">Sin sugerencia escrita.</p>'}
        </div>
      `,
    })
  } catch (err) {
    console.error('[feedback email]', err)
  }

  return NextResponse.json({ ok: true })
}
