import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../lib/plans'
import { calcularPreciosSugeridos } from '../../../lib/pricingUtils'
import { agruparOfertasCatalogo, costePorBotella } from '../../../lib/catalogoGrouping.mjs'

// PATCH /api/simulador/seleccionar-oferta
// Cambia la oferta del proveedor sobre la misma línea del borrador.
// catalogo_vino_id es, deliberadamente, el identificador de la oferta elegida.
export async function PATCH(req) {
  try {
    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim().slice(0, 80)
    const lineaId = String(body.linea_id || '').trim()
    const ofertaId = String(body.catalogo_vino_id || '').trim()

    if (!lineaId || !ofertaId) {
      return Response.json({ error: 'linea_id y catalogo_vino_id son obligatorios' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: restaurante, error: restError } = await supabaseAdmin
      .from('restaurantes')
      .select('plan, subscription_status')
      .eq('id', restauranteId)
      .single()
    if (restError || !restaurante) return Response.json({ error: 'Restaurante no encontrado' }, { status: 404 })
    if (!puedeUsar(restaurante, 'catalogo_consultor')) {
      return Response.json({ error: 'Plan no incluye el simulador de carta' }, { status: 403 })
    }

    const [{ data: linea, error: lineaError }, { data: oferta, error: ofertaError }] = await Promise.all([
      supabaseAdmin
        .from('carta_simulacion')
        .select('id, estado, catalogo_vino_id, nombre, bodega, tipo, region, anada, formato, coste_compra, precio_botella, precio_copa, pvp_recomendado_catalogo, pvp_copa_catalogo')
        .eq('id', lineaId)
        .eq('restaurante_id', restauranteId)
        .maybeSingle(),
      supabaseAdmin
        .from('proveedor_catalogo_vinos')
        .select('id, nombre, bodega, tipo, region, uva, anada, formato, coste_estimado, pvp_recomendado, pvp_copa, disponibilidad, proveedor_id')
        .eq('id', ofertaId)
        .eq('favorito', true)
        .eq('activo', true)
        .maybeSingle(),
    ])

    if (lineaError) throw lineaError
    if (ofertaError) throw ofertaError
    if (!linea) return Response.json({ error: 'Línea no encontrada' }, { status: 404 })
    if (linea.estado !== 'nuevo' || !linea.catalogo_vino_id) {
      return Response.json({ error: 'Solo se puede cambiar el proveedor de una referencia nueva del catálogo' }, { status: 422 })
    }
    if (!oferta) return Response.json({ error: 'La oferta no está disponible entre los favoritos del consultor' }, { status: 404 })
    if (String(linea.catalogo_vino_id) === ofertaId) {
      return Response.json({ linea, oferta_seleccionada_id: ofertaId })
    }

    const identidadActual = {
      id: linea.catalogo_vino_id,
      nombre: linea.nombre,
      bodega: linea.bodega,
      tipo: linea.tipo,
      region: linea.region,
      anada: linea.anada,
      formato: linea.formato,
      coste_estimado: linea.coste_compra,
    }
    const grupos = agruparOfertasCatalogo([identidadActual, oferta])
    if (grupos.length !== 1 || grupos[0].confianza === 'ambiguous') {
      return Response.json({ error: 'La oferta seleccionada no representa el mismo vino. Se mantiene la línea original.' }, { status: 422 })
    }

    const { data: otrasLineas, error: otrasLineasError } = await supabaseAdmin
      .from('carta_simulacion')
      .select('id, catalogo_vino_id, nombre, bodega, tipo, region, anada, formato, coste_compra')
      .eq('restaurante_id', restauranteId)
      .eq('estado', 'nuevo')
      .neq('id', lineaId)
    if (otrasLineasError) throw otrasLineasError

    for (const otra of (otrasLineas || []).filter(item => item.catalogo_vino_id)) {
      const otroGrupo = agruparOfertasCatalogo([
        { id: otra.catalogo_vino_id, nombre: otra.nombre, bodega: otra.bodega, tipo: otra.tipo, region: otra.region, anada: otra.anada, formato: otra.formato, coste_estimado: otra.coste_compra },
        oferta,
      ])
      if (otroGrupo.length === 1 && otroGrupo[0].confianza !== 'ambiguous') {
        return Response.json({ error: 'Ese vino ya tiene otra oferta en el borrador. Cambia la oferta sobre la línea existente.' }, { status: 409 })
      }
    }

    const { data: econSettings } = await supabaseAdmin
      .from('restaurant_economic_settings')
      .select('copas_por_botella, merma_copa_pct, iva_venta_pct, pvp_incluye_iva, coste_incluye_iva')
      .eq('restaurante_id', restauranteId)
      .maybeSingle()
    const coste = costePorBotella(oferta)
    const calc = coste !== null ? calcularPreciosSugeridos(coste, econSettings || {}) : null

    const cambios = {
      catalogo_vino_id: ofertaId,
      coste_compra: coste,
      pvp_recomendado_catalogo: calc?.botella || null,
      pvp_copa_catalogo: calc?.copa || null,
      updated_at: new Date().toISOString(),
    }
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('carta_simulacion')
      .update(cambios)
      .eq('id', lineaId)
      .eq('restaurante_id', restauranteId)
      .eq('estado', 'nuevo')
      .select()
      .single()
    if (updateError) throw updateError

    return Response.json({
      linea: updated,
      oferta_seleccionada_id: ofertaId,
      coste_por_botella: coste,
    })
  } catch (err) {
    console.error('[simulador/seleccionar-oferta PATCH]', err)
    return Response.json({ error: 'No se pudo cambiar la oferta seleccionada.' }, { status: 500 })
  }
}
