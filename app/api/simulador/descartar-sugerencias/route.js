import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../lib/plans'

// POST /api/simulador/descartar-sugerencias
// Body: { restaurante_id }
//
// Elimina todas las líneas 'nuevo' con origen 'sugerido_*' del borrador.
// Las líneas 'fuera' que fueron reemplazadas por una sugerencia automática
// (identificadas vía sustituye_a) se revierten a 'actual'.
export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim().slice(0, 80)

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

    // Buscar todas las líneas 'nuevo' con origen automático
    const { data: sugeridas, error: fetchError } = await supabaseAdmin
      .from('carta_simulacion')
      .select('id, sustituye_a')
      .eq('restaurante_id', restauranteId)
      .eq('estado', 'nuevo')
      .like('origen', 'sugerido%')

    if (fetchError) throw fetchError
    if (!sugeridas?.length) return Response.json({ ok: true, descartadas: 0 })

    // IDs de líneas 'fuera' que fueron reemplazadas por sugerencias automáticas
    const reactivarIds = sugeridas.filter(l => l.sustituye_a).map(l => l.sustituye_a)

    // Eliminar las líneas sugeridas
    const { error: deleteError } = await supabaseAdmin
      .from('carta_simulacion')
      .delete()
      .eq('restaurante_id', restauranteId)
      .eq('estado', 'nuevo')
      .like('origen', 'sugerido%')

    if (deleteError) throw deleteError

    // Reactivar las líneas 'fuera' cuyo sustituto automático acaba de borrarse
    if (reactivarIds.length > 0) {
      const { error: reactivarError } = await supabaseAdmin
        .from('carta_simulacion')
        .update({ estado: 'actual' })
        .in('id', reactivarIds)
        .eq('restaurante_id', restauranteId)

      if (reactivarError) throw reactivarError
    }

    return Response.json({ ok: true, descartadas: sugeridas.length })
  } catch (err) {
    console.error('[simulador/descartar-sugerencias POST]', err)
    return Response.json({ error: 'No se pudieron descartar las sugerencias.' }, { status: 500 })
  }
}
