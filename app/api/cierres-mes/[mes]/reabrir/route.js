import { requireRestaurantAccess } from '../../../_lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

function texto(v, max = 200) { return String(v || '').trim().slice(0, max) }

// POST /api/cierres-mes/[mes]/reabrir  { restaurante_id }
export async function POST(req, { params }) {
  try {
    const { mes } = await params
    const body = await req.json()
    const restaurante_id = texto(body.restaurante_id, 80)

    if (!restaurante_id) {
      return Response.json({ error: 'restaurante_id obligatorio' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { error } = await supabaseAdmin
      .from('cierres_mensuales_bodega')
      .delete()
      .eq('restaurante_id', restaurante_id)
      .eq('mes', mes)

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
