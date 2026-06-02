import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

export async function POST(req) {
  try {
    const { restaurante_id, pin } = await req.json()
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const pinLimpio = String(pin || '').trim()
    if (!/^\d{4,12}$/.test(pinLimpio)) {
      return Response.json({ error: 'Usa entre 4 y 12 dígitos.' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.rpc('configurar_pin_camarero', {
      p_restaurante_id: restaurante_id,
      p_pin: pinLimpio,
    })
    if (error) throw error

    return Response.json({ ok: true })
  } catch (error) {
    console.error('[configurar-pin]', error)
    return Response.json({ error: 'No se pudo guardar el PIN.' }, { status: 500 })
  }
}
