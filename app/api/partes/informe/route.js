import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { agregarPeriodoBodega } from '../../../lib/agregarPeriodoBodega'

function texto(v, max = 80) { return String(v || '').trim().slice(0, max) }

function semanaAnterior(desde) {
  const d = new Date(desde)
  d.setDate(d.getDate() - 7)
  const hasta = new Date(d)
  hasta.setDate(d.getDate() + 6)
  return { desde: d.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) }
}

// GET /api/partes/informe?restaurante_id=&desde=&hasta=
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restaurante_id = texto(searchParams.get('restaurante_id'))
    const desde = texto(searchParams.get('desde'), 10)
    const hasta = texto(searchParams.get('hasta'), 10)

    if (!restaurante_id || !desde || !hasta) {
      return Response.json({ error: 'restaurante_id, desde y hasta son obligatorios' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const [informe, informeAnterior] = await Promise.all([
      agregarPeriodoBodega({ restaurante_id, desde, hasta, supabase: supabaseAdmin }),
      agregarPeriodoBodega({ restaurante_id, ...semanaAnterior(desde), supabase: supabaseAdmin }),
    ])

    return Response.json({ informe, semana_anterior: informeAnterior })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
