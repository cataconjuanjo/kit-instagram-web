import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

async function resolverRestauranteDeConteo(conteoId) {
  const { data } = await supabaseAdmin
    .from('conteos_inventario')
    .select('restaurante_id, tipo, estado')
    .eq('id', conteoId)
    .single()
  return data
}

// GET /api/conteos/[id]
export async function GET(req, { params }) {
  try {
    const { id } = await params
    const conteo = await resolverRestauranteDeConteo(id)
    if (!conteo) return Response.json({ error: 'Conteo no encontrado' }, { status: 404 })

    const auth = await requireRestaurantAccess(req, supabaseAdmin, conteo.restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const [{ data: cabecera }, { data: lineas }] = await Promise.all([
      supabaseAdmin
        .from('conteos_inventario')
        .select('*')
        .eq('id', id)
        .single(),
      supabaseAdmin
        .from('conteos_inventario_lineas')
        .select('*, vino:vinos(nombre, bodega, stock)')
        .eq('conteo_id', id),
    ])

    const lineasOrdenadas = (lineas || []).sort((a, b) =>
      (a.vino?.nombre || '').localeCompare(b.vino?.nombre || '', 'es')
    )

    return Response.json({ conteo: cabecera, lineas: lineasOrdenadas })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
