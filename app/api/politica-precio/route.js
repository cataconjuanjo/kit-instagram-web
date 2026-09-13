import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = searchParams.get('restaurante_id')

    const { data: global } = await supabaseAdmin
      .from('politica_precio')
      .select('*')
      .eq('ambito', 'global')
      .is('restaurante_id', null)
      .maybeSingle()

    if (!restauranteId) {
      return Response.json({ politica: global })
    }

    const { data: rest } = await supabaseAdmin
      .from('politica_precio')
      .select('*')
      .eq('ambito', 'restaurante')
      .eq('restaurante_id', restauranteId)
      .maybeSingle()

    const politica = { ...(global || {}), ...(rest || {}) }
    return Response.json({ politica, hereda_global: !rest })
  } catch (err) {
    console.error('[politica-precio GET]', err)
    return Response.json({ error: 'Error al cargar política' }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim()
    if (!restauranteId) return Response.json({ error: 'restaurante_id obligatorio' }, { status: 400 })

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const campos = {}
    if (body.margen_objetivo !== undefined) campos.margen_objetivo = Number(body.margen_objetivo)
    if (body.copas_por_botella !== undefined) campos.copas_por_botella = Number(body.copas_por_botella)
    if (body.merma !== undefined) campos.merma = Number(body.merma)
    if (body.redondeo_botella !== undefined) campos.redondeo_botella = Number(body.redondeo_botella)
    if (body.redondeo_copa !== undefined) campos.redondeo_copa = Number(body.redondeo_copa)
    if (body.copa_min !== undefined) campos.copa_min = Number(body.copa_min)
    if (body.copa_max !== undefined) campos.copa_max = body.copa_max !== null ? Number(body.copa_max) : null

    if (!Object.keys(campos).length) return Response.json({ error: 'Sin campos para actualizar' }, { status: 400 })
    campos.updated_at = new Date().toISOString()

    const { data: existing } = await supabaseAdmin
      .from('politica_precio')
      .select('id')
      .eq('ambito', 'restaurante')
      .eq('restaurante_id', restauranteId)
      .maybeSingle()

    let data, error
    if (existing) {
      ;({ data, error } = await supabaseAdmin
        .from('politica_precio')
        .update(campos)
        .eq('id', existing.id)
        .select()
        .single())
    } else {
      ;({ data, error } = await supabaseAdmin
        .from('politica_precio')
        .insert({ ambito: 'restaurante', restaurante_id: restauranteId, ...campos })
        .select()
        .single())
    }

    if (error) throw error
    return Response.json({ politica: data })
  } catch (err) {
    console.error('[politica-precio PATCH]', err)
    return Response.json({ error: 'Error al guardar política' }, { status: 500 })
  }
}
