import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

function texto(value, limite = 120) {
  return String(value || '').trim().slice(0, limite)
}

function fechaValida(value) {
  const fecha = texto(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : new Date().toISOString().slice(0, 10)
}

function idsEventos(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(id => texto(id, 80)).filter(Boolean))].slice(0, 1000)
}

const CAMPOS = 'id, restaurante_id, fecha_servicio, eventos_revisados, cerrado, cerrado_por_email, notas, created_at, updated_at'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'), 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const fecha = fechaValida(searchParams.get('fecha'))
    const { data, error } = await supabaseAdmin
      .from('cierres_servicio')
      .select(CAMPOS)
      .eq('restaurante_id', restauranteId)
      .eq('fecha_servicio', fecha)
      .maybeSingle()

    if (error) throw error
    return Response.json({ cierre: data || null })
  } catch (error) {
    console.error('[cierres-servicio] leer:', error)
    return Response.json({ error: 'No se pudo cargar el cierre de servicio.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const payload = {
      restaurante_id: restauranteId,
      fecha_servicio: fechaValida(body.fecha),
      eventos_revisados: idsEventos(body.eventos_revisados),
      cerrado: Boolean(body.cerrado),
      cerrado_por: body.cerrado ? auth.user.id : null,
      cerrado_por_email: body.cerrado ? (auth.user.email || '').toLowerCase() : null,
      notas: texto(body.notas, 1000) || null,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabaseAdmin
      .from('cierres_servicio')
      .upsert(payload, { onConflict: 'restaurante_id,fecha_servicio' })
      .select(CAMPOS)
      .single()

    if (error) throw error
    return Response.json({ cierre: data })
  } catch (error) {
    console.error('[cierres-servicio] guardar:', error)
    return Response.json({ error: 'No se pudo guardar el cierre de servicio.' }, { status: 500 })
  }
}
