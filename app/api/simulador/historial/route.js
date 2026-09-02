import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../lib/plans'

// GET /api/simulador/historial?restaurante_id=...
// Devuelve las últimas 20 instantáneas de cartas publicadas, sin el vinos_snapshot
// (solo metadatos) para no saturar el payload de la lista.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = String(searchParams.get('restaurante_id') || '').trim().slice(0, 80)

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: restaurante, error: restError } = await supabaseAdmin
      .from('restaurantes')
      .select('plan, subscription_status')
      .eq('id', restauranteId)
      .single()

    if (restError || !restaurante) {
      return Response.json({ error: 'Restaurante no encontrado' }, { status: 404 })
    }

    if (!puedeUsar(restaurante, 'catalogo_consultor')) {
      return Response.json({ error: 'Plan no incluye el simulador de carta' }, { status: 403 })
    }

    const { data: snapshots, error } = await supabaseAdmin
      .from('carta_historial')
      .select('id, published_at, published_by, total_vinos')
      .eq('restaurante_id', restauranteId)
      .order('published_at', { ascending: false })
      .limit(20)

    if (error) throw error

    return Response.json({ snapshots: snapshots || [] })
  } catch (err) {
    console.error('[simulador/historial GET]', err)
    return Response.json({ error: 'No se pudo cargar el historial.' }, { status: 500 })
  }
}
