import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../lib/plans'

// POST /api/simulador/publicar
// Body: { restaurante_id }
// Invoca la función Postgres publicar_simulacion() en una sola transacción:
//   1. Desactiva vinos marcados 'fuera'
//   2. Inserta en vinos los referenciados como 'nuevo' (desde catálogo consultor)
//   3. Elimina las líneas 'fuera' y 'nuevo' del borrador
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

    const { data, error } = await supabaseAdmin.rpc('publicar_simulacion', {
      p_restaurante_id: restauranteId,
    })

    if (error) throw error

    return Response.json({ ok: true, ...(data || {}) })
  } catch (err) {
    console.error('[simulador/publicar POST]', err)
    return Response.json({ error: 'No se pudo publicar la carta.' }, { status: 500 })
  }
}
