import { requireRestaurantAccess } from '../../../_lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

async function resolverRestauranteDeConteo(conteoId) {
  const { data } = await supabaseAdmin
    .from('conteos_inventario')
    .select('restaurante_id, tipo, estado')
    .eq('id', conteoId)
    .single()
  return data
}

// POST /api/conteos/[id]/cerrar
export async function POST(req, { params }) {
  try {
    const { id } = await params
    const conteo = await resolverRestauranteDeConteo(id)
    if (!conteo) return Response.json({ error: 'Conteo no encontrado' }, { status: 404 })

    const auth = await requireRestaurantAccess(req, supabaseAdmin, conteo.restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await supabaseAdmin.rpc('cerrar_conteo_inventario', {
      p_conteo_id: id,
    })

    if (error) return Response.json({ error: error.message }, { status: 500 })

    return Response.json(data)
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
