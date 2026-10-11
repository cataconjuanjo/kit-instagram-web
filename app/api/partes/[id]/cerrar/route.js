import { requireRestaurantAccess } from '../../../_lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

async function resolverRestauranteDeParte(parteId) {
  const { data } = await supabaseAdmin
    .from('partes_servicio')
    .select('restaurante_id')
    .eq('id', parteId)
    .single()
  return data
}

// POST /api/partes/[id]/cerrar
export async function POST(req, { params }) {
  try {
    const parte = await resolverRestauranteDeParte(params.id)
    if (!parte) return Response.json({ error: 'Parte no encontrado' }, { status: 404 })

    const auth = await requireRestaurantAccess(req, supabaseAdmin, parte.restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await supabaseAdmin.rpc('cerrar_parte_servicio', {
      p_parte_id:    params.id,
      p_actor_id:    auth.user.id,
      p_actor_email: (auth.user.email || '').toLowerCase(),
    })

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json(data)
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
