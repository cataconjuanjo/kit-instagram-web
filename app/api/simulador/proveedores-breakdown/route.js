import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../lib/plans'
import { agruparOfertasCatalogo, costePorBotella } from '../../../lib/catalogoGrouping.mjs'

// GET /api/simulador/proveedores-breakdown?restaurante_id=...
// Devuelve las líneas del borrador enriquecidas con datos de proveedor.
// Los componentes Concentración (Feature C) y Pedidos (Feature B) usan estos datos.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = String(searchParams.get('restaurante_id') || '').trim().slice(0, 80)

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: restaurante } = await supabaseAdmin
      .from('restaurantes')
      .select('nombre, plan, subscription_status')
      .eq('id', restauranteId)
      .single()

    if (!restaurante || !puedeUsar(restaurante, 'catalogo_consultor')) {
      return Response.json({ error: 'Plan no incluye el simulador de carta' }, { status: 403 })
    }

    // 1. Cargar el borrador
    const { data: simLineas, error: simErr } = await supabaseAdmin
      .from('carta_simulacion')
      .select('id, vino_id, catalogo_vino_id, nombre, bodega, tipo, region, anada, precio_botella, coste_compra, estado, sustituye_a')
      .eq('restaurante_id', restauranteId)
    if (simErr) throw simErr

    const lineas = simLineas || []

    // 2. Enriquecer vinos del catálogo (estado='nuevo') con proveedor estructurado
    const catalogoIds = [...new Set(lineas.filter(l => l.catalogo_vino_id).map(l => l.catalogo_vino_id))]
    let catalogoMap = {}
    let catalogoComparacion = []

    if (catalogoIds.length > 0) {
      const { data: catVinos } = await supabaseAdmin
        .from('proveedor_catalogo_vinos')
        .select('id, nombre, bodega, tipo, region, uva, anada, formato, coste_estimado, disponibilidad, updated_at, proveedor_id, activo, favorito')
        .in('id', catalogoIds)

      const { data: favoritos } = await supabaseAdmin
        .from('proveedor_catalogo_vinos')
        .select('id, nombre, bodega, tipo, region, uva, anada, formato, coste_estimado, disponibilidad, updated_at, proveedor_id')
        .eq('favorito', true)
        .eq('activo', true)

      const ofertasFuente = [
        ...(favoritos || []),
        ...(catVinos || []).filter(oferta => !(favoritos || []).some(favorito => favorito.id === oferta.id)),
      ]
      const provIds = [...new Set(ofertasFuente.map(v => v.proveedor_id).filter(Boolean))]
      let proveedoresMap = {}
      if (provIds.length > 0) {
        const { data: provs } = await supabaseAdmin
          .from('proveedores_vino')
          .select('id, nombre, email, contacto, telefono, visible_restaurantes')
          .in('id', provIds)
        proveedoresMap = Object.fromEntries((provs || []).map(p => [p.id, p]))
      }

      for (const cv of (catVinos || [])) {
        const prov = proveedoresMap[cv.proveedor_id] || null
        catalogoMap[cv.id] = {
          proveedor_id:      prov?.id      || null,
          proveedor_nombre:  prov?.nombre  || 'Proveedor desconocido',
          proveedor_email:   prov?.email   || null,
          proveedor_contacto: prov?.contacto || null,
          proveedor_telefono: prov?.telefono || null,
          proveedor_tipo:    'catalogo',
        }
      }

      catalogoComparacion = ofertasFuente
        .filter(oferta => !oferta.proveedor_id || proveedoresMap[oferta.proveedor_id]?.visible_restaurantes !== false)
        .map(oferta => ({
          ...oferta,
          proveedor: proveedoresMap[oferta.proveedor_id] || null,
        }))
    }

    // 3. Enriquecer vinos de carta propia (estado='actual'/'fuera') con proveedor texto
    const vinoIds = [...new Set(lineas.filter(l => l.vino_id).map(l => l.vino_id))]
    let vinosMap = {}
    if (vinoIds.length > 0) {
      const { data: vinos } = await supabaseAdmin
        .from('vinos')
        .select('id, proveedor')
        .in('id', vinoIds)
      vinosMap = Object.fromEntries((vinos || []).map(v => [v.id, v]))
    }

    // 4. Fusionar
    const gruposComparacion = agruparOfertasCatalogo(catalogoComparacion)
    const grupoPorOfertaId = new Map()
    for (const grupo of gruposComparacion) {
      for (const oferta of grupo.ofertas) grupoPorOfertaId.set(String(oferta.id), grupo)
    }

    const enriquecidas = lineas.map(linea => {
      if (linea.catalogo_vino_id && catalogoMap[linea.catalogo_vino_id]) {
        const grupo = grupoPorOfertaId.get(String(linea.catalogo_vino_id))
        const ofertaSeleccionada = grupo?.ofertas.find(oferta => String(oferta.id) === String(linea.catalogo_vino_id))
        const ofertasComparacion = (grupo?.ofertas || []).map(oferta => ({
          id: oferta.id,
          proveedor_id: oferta.proveedor?.id || oferta.proveedor_id || null,
          proveedor_nombre: oferta.proveedor?.nombre || 'Sin proveedor',
          coste_por_botella: costePorBotella(oferta),
          disponibilidad: oferta.disponibilidad || null,
          updated_at: oferta.updated_at || null,
        }))
        const conPrecio = ofertasComparacion.filter(oferta => oferta.coste_por_botella !== null)
        const mejor = conPrecio.sort((a, b) => a.coste_por_botella - b.coste_por_botella)[0] || null
        const costeSeleccionado = costePorBotella(ofertaSeleccionada) ?? (Number(linea.coste_compra) > 0 ? Number(linea.coste_compra) : null)
        const diferencia = costeSeleccionado !== null && mejor
          ? Math.max(0, costeSeleccionado - mejor.coste_por_botella)
          : 0
        return {
          ...linea,
          ...catalogoMap[linea.catalogo_vino_id],
          ofertas_comparacion: ofertasComparacion,
          mejor_precio_disponible: mejor?.coste_por_botella || null,
          diferencia_mejor_precio: diferencia,
          proveedor_mas_barato: mejor?.proveedor_nombre || null,
          ahorro_potencial: diferencia > 0 ? diferencia * 6 : 0,
        }
      }
      if (linea.vino_id && vinosMap[linea.vino_id]) {
        const v = vinosMap[linea.vino_id]
        return {
          ...linea,
          proveedor_id:      null,
          proveedor_nombre:  v.proveedor || null,
          proveedor_email:   null,
          proveedor_contacto: null,
          proveedor_telefono: null,
          proveedor_tipo:    'carta',
        }
      }
      return {
        ...linea,
        proveedor_id: null, proveedor_nombre: null,
        proveedor_email: null, proveedor_contacto: null,
        proveedor_telefono: null, proveedor_tipo: null,
      }
    })

    return Response.json({ lineas: enriquecidas, restaurante: { nombre: restaurante.nombre } })
  } catch (err) {
    console.error('[proveedores-breakdown]', err)
    return Response.json({ error: 'No se pudo cargar el desglose de proveedores.' }, { status: 500 })
  }
}
