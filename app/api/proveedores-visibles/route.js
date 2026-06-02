import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

function texto(value, limite = 80) {
  return String(value || '').trim().slice(0, limite)
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'))
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await supabaseAdmin
      .from('proveedores_vino')
      .select('nombre')
      .eq('visible_restaurantes', true)
      .order('nombre')

    if (error) throw error
    return Response.json({ proveedores: (data || []).map(item => item.nombre).filter(Boolean) })
  } catch (error) {
    console.error('[proveedores-visibles] leer:', error)
    return Response.json({ error: 'No se pudieron cargar los proveedores.' }, { status: 500 })
  }
}
