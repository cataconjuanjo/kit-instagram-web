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

const CAMPOS = 'id, restaurante_id, fecha_servicio, eventos_revisados, cerrado, cerrado_por_email, notas, pasos, created_at, updated_at'

const PASOS_VALIDOS = new Set(['validar_recomendaciones', 'resolver_incidencias', 'decidir_ventas', 'revisar_dudas', 'cerrar_turno'])

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

    // Precomputa las entradas nuevas para pasos si vienen en el body.
    // No lee la fila actual — la fusión con el valor existente la hace el SQL.
    const pasosCambio = body.pasos_cambio && typeof body.pasos_cambio === 'object' && !Array.isArray(body.pasos_cambio)
      ? body.pasos_cambio
      : null
    let nuevasEntradas = null
    if (pasosCambio) {
      const nombre = String(
        auth.user.user_metadata?.full_name ||
        auth.user.user_metadata?.name ||
        (auth.user.email || '').split('@')[0]
      ).slice(0, 80)
      const ahora = new Date().toISOString()
      const entradas = {}
      for (const [id, hecho] of Object.entries(pasosCambio)) {
        if (!PASOS_VALIDOS.has(String(id))) continue
        entradas[id] = hecho
          ? { completado_por_email: (auth.user.email || '').toLowerCase(), completado_por_nombre: nombre, completado_en: ahora }
          : null
      }
      if (Object.keys(entradas).length) nuevasEntradas = entradas
    }

    // Upsert principal — pasos nunca va aquí; se funde atomicamente después vía RPC.
    const { data, error } = await supabaseAdmin
      .from('cierres_servicio')
      .upsert(payload, { onConflict: 'restaurante_id,fecha_servicio' })
      .select(CAMPOS)
      .single()

    if (error) throw error

    // Fusión atómica de pasos: UPDATE SET pasos = pasos || $1 en una sola sentencia SQL.
    if (nuevasEntradas) {
      const { data: pasosMerged, error: pasosErr } = await supabaseAdmin.rpc('merge_cierre_pasos', {
        p_restaurante_id: restauranteId,
        p_fecha_servicio: payload.fecha_servicio,
        p_pasos: nuevasEntradas,
      })
      if (!pasosErr && pasosMerged !== null) data.pasos = pasosMerged
    }

    return Response.json({ cierre: data })
  } catch (error) {
    console.error('[cierres-servicio] guardar:', error)
    return Response.json({ error: 'No se pudo guardar el cierre de servicio.' }, { status: 500 })
  }
}
