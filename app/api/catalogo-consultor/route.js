import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { puedeUsar } from '../../lib/plans'
import { calcularPreciosSugeridos, copasVendiblesEscalonado } from '../../lib/pricingUtils'

function pvpCopaDesdeBottella(pvpBotella) {
  if (!pvpBotella || pvpBotella <= 0) return 0
  const divisor = copasVendiblesEscalonado(pvpBotella)
  return Math.round((pvpBotella / divisor) * 2) / 2
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = String(searchParams.get('restaurante_id') || '').trim().slice(0, 80)

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

    const { data: providers, error: provError } = await supabaseAdmin
      .from('proveedores_vino')
      .select('id, nombre, contacto, email, telefono, zona')
      .eq('visible_restaurantes', true)

    if (provError) throw provError
    if (!providers?.length) return Response.json({ vinos: [] })

    const providerIds = providers.map(p => p.id)
    const providerMap = Object.fromEntries(providers.map(p => [p.id, p]))

    const { data: vinos, error: vinosError } = await supabaseAdmin
      .from('proveedor_catalogo_vinos')
      .select('id, nombre, bodega, tipo, region, uva, anada, referencia, formato, coste_estimado, pvp_recomendado, pvp_copa, proveedor_id')
      .eq('favorito', true)
      .eq('activo', true)
      .in('proveedor_id', providerIds)
      .order('nombre')

    if (vinosError) throw vinosError

    const result = (vinos || []).map(v => {
      const coste = Number(v.coste_estimado) || 0
      const calc = coste > 0 ? calcularPreciosSugeridos(coste, {}) : null
      const pvpBotella = calc?.botella || 0
      return {
        ...v,
        pvp_recomendado: pvpBotella,
        pvp_copa: pvpCopaDesdeBottella(pvpBotella),
        proveedor: providerMap[v.proveedor_id] || null,
      }
    })

    return Response.json({ vinos: result })
  } catch (err) {
    console.error('[catalogo-consultor]', err)
    return Response.json({ error: 'No se pudo cargar el catálogo.' }, { status: 500 })
  }
}
