import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { puedeUsar } from '../../lib/plans'
import { calcularPreciosSugeridos } from '../../lib/pricingUtils'
import { agruparOfertasCatalogo, costePorBotella, resumenAgrupacionCatalogo } from '../../lib/catalogoGrouping.mjs'

const CATALOGO_PAGE_SIZE = 1000

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
    if (!providers?.length) {
      const trazabilidad = resumenAgrupacionCatalogo([])
      console.info('[catalogo-consultor] sin proveedores visibles', JSON.stringify(trazabilidad))
      return Response.json({ vinos: [], trazabilidad })
    }

    const providerIds = providers.map(p => p.id)
    const providerMap = Object.fromEntries(providers.map(p => [p.id, p]))

    // Supabase limita las respuestas grandes aunque no se indique un range.
    // Paginar explícitamente evita perder favoritos a partir de la fila 1.000.
    const vinos = []
    for (let desde = 0; ; desde += CATALOGO_PAGE_SIZE) {
      const { data: pagina, error: vinosError } = await supabaseAdmin
        .from('proveedor_catalogo_vinos')
        .select('id, nombre, bodega, tipo, region, uva, anada, referencia, formato, coste_estimado, pvp_recomendado, pvp_copa, disponibilidad, proveedor_id, created_at, updated_at')
        .eq('favorito', true)
        .eq('activo', true)
        .in('proveedor_id', providerIds)
        .order('nombre')
        .order('id')
        .range(desde, desde + CATALOGO_PAGE_SIZE - 1)

      if (vinosError) throw vinosError
      vinos.push(...(pagina || []))
      if (!pagina || pagina.length < CATALOGO_PAGE_SIZE) break
    }

    const { data: econSettings } = restauranteId
      ? await supabaseAdmin
          .from('restaurant_economic_settings')
          .select('copas_por_botella, merma_copa_pct, iva_venta_pct, pvp_incluye_iva, coste_incluye_iva')
          .eq('restaurante_id', restauranteId)
          .maybeSingle()
      : { data: null }
    const econConfig = econSettings || {}

    // Detectar favoritos con precio potencialmente desactualizado:
    // buscar hermanos no-favoritos del mismo proveedor con distinto coste_estimado.
    function normTexto(v) {
      return String(v || '').toLocaleLowerCase('es-ES').normalize('NFD')
        .replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
    }

    const hermanos = []
    for (let desde = 0; ; desde += CATALOGO_PAGE_SIZE) {
      const { data: pagina, error: hErr } = await supabaseAdmin
        .from('proveedor_catalogo_vinos')
        .select('nombre, bodega, formato, coste_estimado, proveedor_id')
        .or('favorito.is.null,favorito.eq.false')
        .eq('activo', true)
        .in('proveedor_id', providerIds)
        .order('nombre')
        .order('id')
        .range(desde, desde + CATALOGO_PAGE_SIZE - 1)
      if (hErr) throw hErr
      hermanos.push(...(pagina || []))
      if (!pagina || pagina.length < CATALOGO_PAGE_SIZE) break
    }

    const hermanosMap = new Map()
    for (const h of hermanos) {
      const key = [h.proveedor_id, normTexto(h.nombre), normTexto(h.bodega), normTexto(h.formato)].join('||')
      if (!hermanosMap.has(key)) hermanosMap.set(key, new Set())
      hermanosMap.get(key).add(Number(h.coste_estimado) || 0)
    }

    const result = (vinos || []).map(v => {
      const coste = costePorBotella(v)
      const calc = coste > 0 ? calcularPreciosSugeridos(coste, econConfig) : null
      const pvpBotella = calc?.botella || 0
      const fKey = [v.proveedor_id, normTexto(v.nombre), normTexto(v.bodega), normTexto(v.formato)].join('||')
      const siblingsCoste = hermanosMap.get(fKey)
      const costeActual = Number(v.coste_estimado) || 0
      const precio_potencialmente_desactualizado = siblingsCoste
        ? [...siblingsCoste].some(c => c !== costeActual)
        : false
      return {
        ...v,
        pvp_recomendado_origen: v.pvp_recomendado,
        pvp_copa_origen: v.pvp_copa,
        pvp_recomendado: pvpBotella,
        pvp_copa: calc?.copa || 0,
        proveedor: providerMap[v.proveedor_id] || null,
        precio_potencialmente_desactualizado,
      }
    })

    const grupos = agruparOfertasCatalogo(result)
    const trazabilidad = resumenAgrupacionCatalogo(result, grupos)
    console.info('[catalogo-consultor] carga completa', JSON.stringify({
      restauranteId,
      proveedoresConsultados: providers.length,
      lineasOriginales: result.length,
      gruposCreados: grupos.length,
      grupos: trazabilidad.grupos,
      generadoEn: trazabilidad.generadoEn,
    }))

    return Response.json({ vinos: result, trazabilidad })
  } catch (err) {
    console.error('[catalogo-consultor]', err)
    return Response.json({ error: 'No se pudo cargar el catálogo.' }, { status: 500 })
  }
}
