import { requireRestaurantAccess } from '../_lib/auth'
import { crearTokenPruebaCarta } from '../../lib/cartaPruebaToken'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

export async function POST(req) {
  try {
    const { restaurante_id } = await req.json()
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: restaurante, error } = await supabaseAdmin
      .from('restaurantes')
      .select('slug')
      .eq('id', restaurante_id)
      .single()
    if (error || !restaurante) return Response.json({ error: 'Restaurante no encontrado.' }, { status: 404 })

    const token = crearTokenPruebaCarta(restaurante_id)
    return Response.json({
      url: `/carta/${restaurante.slug}?prueba=${encodeURIComponent(token)}`,
      caduca_en_minutos: 60,
    })
  } catch (error) {
    console.error('[prueba-carta]', error)
    return Response.json({ error: 'No se pudo abrir el modo de prueba.' }, { status: 500 })
  }
}
