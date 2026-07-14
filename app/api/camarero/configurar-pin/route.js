import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

export async function POST(req) {
  try {
    const { restaurante_id, pin, habilitado = true } = await req.json()
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    if (habilitado === false) {
      const { error } = await supabaseAdmin
        .from('restaurantes')
        .update({
          camarero_pin_requerido: false,
          camarero_pin_bloqueo_activo: false,
          camarero_pin_hash: null,
          camarero_pin: null,
        })
        .eq('id', restaurante_id)
      if (error) throw error
      return Response.json({ ok: true, habilitado: false })
    }

    const pinLimpio = String(pin || '').trim()
    if (!/^\d{4,12}$/.test(pinLimpio)) {
      return Response.json({ error: 'Usa entre 4 y 12 dígitos.' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.rpc('configurar_pin_camarero', {
      p_restaurante_id: restaurante_id,
      p_pin: pinLimpio,
    })
    if (error) throw error

    return Response.json({ ok: true, habilitado: true })
  } catch (error) {
    console.error('[configurar-pin]', error)
    return Response.json({ error: 'No se pudo guardar el PIN.' }, { status: 500 })
  }
}
