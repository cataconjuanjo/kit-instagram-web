import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { calcularPreciosSugeridos } from '../../../lib/pricingUtils'

// POST /api/simulador/recalcular-copa-catalogo
// Body: { restaurante_id }
//
// Recalcula pvp_copa_catalogo para todas las filas de carta_simulacion
// de este restaurante que tienen catalogo_vino_id, usando el divisor
// copasVendibles(econConfig) del restaurante (copas_por_botella × merma).
//
// SOLO toca pvp_copa_catalogo. Nunca modifica precio_copa,
// pvp_recomendado_catalogo, ofrecido_por_copa ni estado.
export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim().slice(0, 80)

    if (!restauranteId) {
      return Response.json({ error: 'restaurante_id obligatorio' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    // Config económica del restaurante (copas_por_botella, merma, iva…)
    const { data: econSettings } = await supabaseAdmin
      .from('restaurant_economic_settings')
      .select('copas_por_botella, merma_copa_pct, iva_venta_pct, pvp_incluye_iva, coste_incluye_iva')
      .eq('restaurante_id', restauranteId)
      .maybeSingle()
    const econConfig = econSettings || {}

    // Filas de carta_simulacion con vínculo de catálogo
    const { data: lineas, error: lineasError } = await supabaseAdmin
      .from('carta_simulacion')
      .select('id, catalogo_vino_id')
      .eq('restaurante_id', restauranteId)
      .not('catalogo_vino_id', 'is', null)

    if (lineasError) throw lineasError
    if (!lineas?.length) return Response.json({ actualizados: 0 })

    // Costes del catálogo
    const catalogoIds = [...new Set(lineas.map(l => l.catalogo_vino_id))]
    const { data: catalogoRows, error: catError } = await supabaseAdmin
      .from('proveedor_catalogo_vinos')
      .select('id, coste_estimado')
      .in('id', catalogoIds)

    if (catError) throw catError
    const costes = Object.fromEntries((catalogoRows || []).map(r => [r.id, Number(r.coste_estimado) || 0]))

    // Calcular y actualizar fila a fila
    let actualizados = 0
    for (const linea of lineas) {
      const coste = costes[linea.catalogo_vino_id]
      if (!coste) continue
      const calc = calcularPreciosSugeridos(coste, econConfig)
      const pvpCopa = calc.copa || null
      if (!pvpCopa) continue

      const { error: updError } = await supabaseAdmin
        .from('carta_simulacion')
        .update({ pvp_copa_catalogo: pvpCopa })
        .eq('id', linea.id)
        .not('catalogo_vino_id', 'is', null)

      if (!updError) actualizados++
    }

    return Response.json({ actualizados })
  } catch (err) {
    console.error('[recalcular-copa-catalogo POST]', err)
    return Response.json({ error: 'Error al recalcular precios de copa.' }, { status: 500 })
  }
}
