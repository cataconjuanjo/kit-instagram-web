import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../lib/plans'
import { calcularPreciosSugeridos } from '../../../lib/pricingUtils'
import { generarSugerencias } from '../../../lib/sugerirCarta'

export const maxDuration = 30

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim().slice(0, 80)
    const lineas = Array.isArray(body.lineas) ? body.lineas : []

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: restaurante, error: restError } = await supabaseAdmin
      .from('restaurantes')
      .select('plan, subscription_status')
      .eq('id', restauranteId)
      .single()

    if (restError || !restaurante) {
      return Response.json({ error: 'Restaurante no encontrado' }, { status: 404 })
    }

    if (!puedeUsar(restaurante, 'catalogo_consultor')) {
      return Response.json({ error: 'Plan no incluye el catálogo de consultor' }, { status: 403 })
    }

    // Parallelise provider + plato queries; vinos depends on providerIds so runs after.
    const [{ data: providers }, { data: platos }] = await Promise.all([
      supabaseAdmin.from('proveedores_vino').select('id').eq('visible_restaurantes', true),
      supabaseAdmin
        .from('platos')
        .select('id, nombre, categoria, descripcion, precio, activo')
        .eq('restaurante_id', restauranteId)
        .eq('activo', true)
        .order('categoria')
        .limit(40),
    ])

    const providerIds = (providers || []).map(p => p.id)
    const catalogo = []

    const { data: econSettings } = await supabaseAdmin
      .from('restaurant_economic_settings')
      .select('copas_por_botella, merma_copa_pct, iva_venta_pct, pvp_incluye_iva, coste_incluye_iva')
      .eq('restaurante_id', restauranteId)
      .maybeSingle()
    const econConfig = econSettings || {}

    if (providerIds.length > 0) {
      const { data: vinos } = await supabaseAdmin
        .from('proveedor_catalogo_vinos')
        .select('id, nombre, bodega, tipo, region, uva, anada, referencia, formato, coste_estimado, pvp_recomendado, pvp_copa, proveedor_id')
        .eq('favorito', true)
        .eq('activo', true)
        .in('proveedor_id', providerIds)
        .order('nombre')
        .limit(300)

      for (const v of (vinos || [])) {
        const coste = Number(v.coste_estimado) || 0
        const calc = coste > 0 ? calcularPreciosSugeridos(coste, econConfig) : null
        const pvpBotella = calc?.botella || 0
        catalogo.push({
          ...v,
          pvp_recomendado: pvpBotella,
          pvp_copa: calc?.copa || 0,
        })
      }
    }

    const resultado = generarSugerencias(lineas, catalogo, platos || [])
    return Response.json(resultado)
  } catch (err) {
    console.error('[sugerir-carta]', err)
    return Response.json({ error: 'No se pudo calcular las sugerencias.' }, { status: 500 })
  }
}
