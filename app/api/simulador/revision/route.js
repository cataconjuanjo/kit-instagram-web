import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../lib/plans'
import { Resend } from 'resend'

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'
const FROM = process.env.CARTA_VIVA_FROM || 'Carta Viva <onboarding@resend.dev>'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://cataconjuanjo.com'

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// GET /api/simulador/revision?restaurante_id=X
// Returns the most recent revision for this restaurant (null if none)
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = String(searchParams.get('restaurante_id') || '').trim()
    if (!restauranteId) return Response.json({ revision: null })

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data } = await supabaseAdmin
      .from('simulador_revisiones')
      .select('id, estado, mensaje_restaurante, respuesta_consultor, created_at, updated_at')
      .eq('restaurante_id', restauranteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return Response.json({ revision: data || null })
  } catch (err) {
    console.error('[simulador/revision GET]', err)
    return Response.json({ error: 'No se pudo cargar la revisión.' }, { status: 500 })
  }
}

// POST /api/simulador/revision
// Body: { restaurante_id, mensaje? }
// Restaurante sends borrador → creates revision row → notifies consultor by email
export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim().slice(0, 80)
    const mensaje = String(body.mensaje || '').trim().slice(0, 2000)

    if (!restauranteId) return Response.json({ error: 'restaurante_id obligatorio' }, { status: 400 })

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: restaurante } = await supabaseAdmin
      .from('restaurantes')
      .select('id, nombre, plan, subscription_status')
      .eq('id', restauranteId)
      .single()
    if (!restaurante) return Response.json({ error: 'Restaurante no encontrado' }, { status: 404 })
    if (!puedeUsar(restaurante, 'catalogo_consultor')) {
      return Response.json({ error: 'Plan no incluye el simulador de carta' }, { status: 403 })
    }

    // Guard: no duplicate pending revision
    const { data: pendiente } = await supabaseAdmin
      .from('simulador_revisiones')
      .select('id')
      .eq('restaurante_id', restauranteId)
      .eq('estado', 'pendiente')
      .maybeSingle()
    if (pendiente) {
      return Response.json(
        { error: 'Ya hay una revisión pendiente. Espera la respuesta del consultor.' },
        { status: 409 }
      )
    }

    // Borrador summary for email
    const { data: lineas } = await supabaseAdmin
      .from('carta_simulacion')
      .select('id, nombre, estado')
      .eq('restaurante_id', restauranteId)
    const activas = (lineas || []).filter(l => l.estado === 'actual' || l.estado === 'nuevo').length
    const nuevas = (lineas || []).filter(l => l.estado === 'nuevo').length
    const retiradas = (lineas || []).filter(l => l.estado === 'fuera').length

    const { data: revision, error: insertError } = await supabaseAdmin
      .from('simulador_revisiones')
      .insert({ restaurante_id: restauranteId, estado: 'pendiente', mensaje_restaurante: mensaje || null })
      .select()
      .single()
    if (insertError) throw insertError

    // Email notification — don't fail the request if this errors
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: FROM,
        to: ADMIN_EMAIL,
        subject: `Borrador para revisar — ${restaurante.nombre}`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#171416;padding:24px 16px">
            <h2 style="margin:0 0 12px;font-size:20px;font-weight:700">Borrador de carta para revisar</h2>
            <p style="margin:0 0 6px">
              <strong>${escapeHtml(restaurante.nombre)}</strong> ha enviado su borrador del simulador.
            </p>
            <p style="margin:0 0 18px;color:#766e64;font-size:13px">
              ${activas} referencias activas en el borrador
              ${nuevas > 0 ? ` · ${nuevas} nuevas` : ''}
              ${retiradas > 0 ? ` · ${retiradas} para retirar` : ''}
            </p>
            ${mensaje ? `
            <div style="border-left:3px solid #cbb98c;padding:10px 14px;margin:0 0 20px;background:#fffaf3;border-radius:0 6px 6px 0">
              <p style="margin:0;color:#5a4a38;font-style:italic;font-size:14px">${escapeHtml(mensaje)}</p>
            </div>
            ` : ''}
            <p style="margin:0 0 6px;font-size:12px;color:#8b8278">Responde desde el panel de admin:</p>
            <a href="${escapeHtml(SITE_URL)}/admin/simulador-revisiones"
               style="font-size:13px;color:#74223d;font-weight:700">
              ${escapeHtml(SITE_URL)}/admin/simulador-revisiones
            </a>
          </div>
        `,
      })
    } catch (emailErr) {
      console.error('[simulador/revision] email error:', emailErr)
    }

    return Response.json({ revision })
  } catch (err) {
    console.error('[simulador/revision POST]', err)
    return Response.json({ error: 'No se pudo enviar la revisión.' }, { status: 500 })
  }
}
