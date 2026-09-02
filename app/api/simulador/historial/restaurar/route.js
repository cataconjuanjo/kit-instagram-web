import { requireRestaurantAccess } from '../../../_lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../../lib/plans'

// POST /api/simulador/historial/restaurar
// Body: { restaurante_id, snapshot_id }
// Carga una instantánea del historial como borrador del simulador para revisión.
// No publica automáticamente: el sommelier debe revisar y pulsar "Publicar" de nuevo.
export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim().slice(0, 80)
    const snapshotId    = String(body.snapshot_id    || '').trim().slice(0, 80)

    if (!snapshotId) {
      return Response.json({ error: 'Falta snapshot_id' }, { status: 400 })
    }

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

    const { data, error } = await supabaseAdmin.rpc('restaurar_snapshot', {
      p_restaurante_id: restauranteId,
      p_snapshot_id:    snapshotId,
    })

    if (error) throw error

    return Response.json({ ok: true, ...(data || {}) })
  } catch (err) {
    console.error('[simulador/historial/restaurar POST]', err)
    return Response.json({ error: 'No se pudo restaurar la versión anterior.' }, { status: 500 })
  }
}
