import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

function str(v, max = 200) {
  return String(v ?? '').trim().slice(0, max)
}

export async function POST(req) {
  try {
    const body          = await req.json()
    const restauranteId = str(body.restaurante_id, 80)
    const vinoId        = str(body.vino_id, 80)
    const accion        = str(body.accion, 20)
    const motivo        = str(body.motivo || '', 500) || null

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    if (!restauranteId || !vinoId) {
      return Response.json({ error: 'restaurante_id y vino_id son obligatorios.' }, { status: 400 })
    }
    if (accion !== 'cerrar') {
      return Response.json({ error: 'Acción no válida. Solo se admite: cerrar.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.rpc('gestionar_botella_copa', {
      p_restaurante_id: restauranteId,
      p_vino_id:        vinoId,
      p_accion:         accion,
      p_motivo:         motivo,
    })

    if (error) {
      if (error.message?.includes('no_botella_abierta')) {
        return Response.json({ error: 'No hay botella abierta para este vino.' }, { status: 404 })
      }
      if (error.message?.includes('vino_no_por_copa')) {
        return Response.json({ error: 'El vino no está marcado para servir por copa.' }, { status: 400 })
      }
      if (error.message?.includes('vino_no_encontrado')) {
        return Response.json({ error: 'Vino no encontrado.' }, { status: 404 })
      }
      throw error
    }

    return Response.json({ ok: true, ...data })
  } catch (err) {
    console.error('[copas/gestionar-botella]', err)
    return Response.json({ error: 'No se pudo gestionar la botella.' }, { status: 500 })
  }
}
