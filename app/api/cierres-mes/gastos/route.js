import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

function texto(v, max = 200) { return String(v || '').trim().slice(0, max) }

// PATCH /api/cierres-mes/gastos  { restaurante_id, mes, gastos: [{concepto, importe}] }
export async function PATCH(req) {
  try {
    const body = await req.json()
    const restaurante_id = texto(body.restaurante_id, 80)
    const mes = texto(body.mes, 7)
    const gastos = Array.isArray(body.gastos) ? body.gastos : []

    if (!restaurante_id || !mes) {
      return Response.json({ error: 'restaurante_id y mes son obligatorios' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return Response.json({ error: 'mes debe tener formato YYYY-MM' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: settings } = await supabaseAdmin
      .from('restaurant_economic_settings')
      .select('gastos_mensuales')
      .eq('restaurante_id', restaurante_id)
      .single()

    const actualArr  = Array.isArray(settings?.gastos_mensuales) ? settings.gastos_mensuales : []
    const otrosMeses = actualArr.filter(g => g.mes !== mes)
    const nuevosGastos = gastos
      .filter(g => g.concepto && Number(g.importe) > 0)
      .map(g => ({
        mes,
        concepto: texto(g.concepto, 100),
        importe:  Math.round(Number(g.importe) * 100) / 100,
      }))
    const nuevoArr = [...otrosMeses, ...nuevosGastos]

    const { error } = await supabaseAdmin
      .from('restaurant_economic_settings')
      .update({ gastos_mensuales: nuevoArr })
      .eq('restaurante_id', restaurante_id)

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true, gastos: nuevosGastos })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
