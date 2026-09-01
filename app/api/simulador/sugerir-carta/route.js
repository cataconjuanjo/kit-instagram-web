import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../lib/plans'
import { calcularPreciosSugeridos, copasVendiblesEscalonado } from '../../../lib/pricingUtils'
import { generarSugerencias } from '../../../lib/sugerirCarta'

export const maxDuration = 30

function pvpCopaDesdeBottella(pvpBotella) {
  if (!pvpBotella || pvpBotella <= 0) return 0
  const divisor = copasVendiblesEscalonado(pvpBotella)
  return Math.round((pvpBotella / divisor) * 2) / 2
}

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

    const { data: providers } = await supabaseAdmin
      .from('proveedores_vino')
      .select('id')
      .eq('visible_restaurantes', true)

    const providerIds = (providers || []).map(p => p.id)
    const catalogo = []

    if (providerIds.length > 0) {
      const { data: vinos } = await supabaseAdmin
        .from('proveedor_catalogo_vinos')
        .select('id, nombre, bodega, tipo, region, uva, anada, referencia, formato, coste_estimado, pvp_recomendado, pvp_copa, proveedor_id')
        .eq('favorito', true)
        .eq('activo', true)
        .in('proveedor_id', providerIds)
        .order('nombre')

      for (const v of (vinos || [])) {
        const coste = Number(v.coste_estimado) || 0
        const calc = coste > 0 ? calcularPreciosSugeridos(coste, {}) : null
        const pvpBotella = calc?.botella || 0
        catalogo.push({
          ...v,
          pvp_recomendado: pvpBotella,
          pvp_copa: pvpCopaDesdeBottella(pvpBotella),
        })
      }
    }

    const { data: platos } = await supabaseAdmin
      .from('platos')
      .select('id, nombre, categoria, descripcion, precio, activo')
      .eq('restaurante_id', restauranteId)
      .eq('activo', true)
      .order('categoria')
      .limit(100)

    // Limit plates to keep the O(platos × catalogo) computation under ~10 s
    const platosParaSugerir = (platos || []).slice(0, 40)
    const resultado = generarSugerencias(lineas, catalogo, platosParaSugerir)
    return Response.json(resultado)
  } catch (err) {
    console.error('[sugerir-carta]', err)
    return Response.json({ error: 'No se pudo calcular las sugerencias.' }, { status: 500 })
  }
}
