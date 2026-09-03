import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../lib/plans'
import { calcularPreciosSugeridos } from '../../../lib/pricingUtils'

// POST /api/simulador/sustituir
// Body: { restaurante_id, linea_fuera_id, catalogo_vino_id }
//
// Ejecuta UPDATE+INSERT en una sola transacción Postgres via RPC.
// Si cualquiera de los dos falla, ambos se revierten — sin posibilidad
// de quedar con el vino marcado 'fuera' sin sustituto.
export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId  = String(body.restaurante_id   || '').trim().slice(0, 80)
    const lineaFueraId   = String(body.linea_fuera_id   || '').trim()
    const catalogoVinoId = String(body.catalogo_vino_id || '').trim()
    const origen         = typeof body.origen === 'string' ? body.origen.slice(0, 40) : null

    if (!lineaFueraId || !catalogoVinoId) {
      return Response.json({ error: 'linea_fuera_id y catalogo_vino_id son obligatorios' }, { status: 400 })
    }

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
      return Response.json({ error: 'Plan no incluye el simulador de carta' }, { status: 403 })
    }

    // Cargar datos del vino del catálogo para el snapshot
    const { data: catalogVino, error: catError } = await supabaseAdmin
      .from('proveedor_catalogo_vinos')
      .select('id, nombre, bodega, tipo, region, anada, formato, coste_estimado, pvp_recomendado')
      .eq('id', catalogoVinoId)
      .eq('activo', true)
      .maybeSingle()

    if (catError) throw catError
    if (!catalogVino) {
      return Response.json({ error: 'Referencia de catálogo no encontrada' }, { status: 404 })
    }

    // Calcular precios sugeridos con la misma lógica que anadir-catalogo
    const { data: econSettings } = await supabaseAdmin
      .from('restaurant_economic_settings')
      .select('copas_por_botella, merma_copa_pct, iva_venta_pct, pvp_incluye_iva, coste_incluye_iva')
      .eq('restaurante_id', restauranteId)
      .maybeSingle()
    const econConfig = econSettings || {}
    const coste       = Number(catalogVino.coste_estimado) || 0
    const calc        = coste > 0 ? calcularPreciosSugeridos(coste, econConfig) : null
    const pvpBotella  = calc?.botella || 0
    const pvpCopa     = calc?.copa || 0

    // Llamada atómica: UPDATE 'fuera' + INSERT 'nuevo' en una sola transacción.
    // precio_copa = NULL: el restaurante decide por copa mediante el flujo de decisión.
    // Los snapshots se guardan en pvp_recomendado_catalogo / pvp_copa_catalogo.
    const { data: nuevaLinea, error: rpcError } = await supabaseAdmin.rpc(
      'sustituir_vino_simulacion',
      {
        p_restaurante_id:           restauranteId,
        p_linea_fuera_id:           lineaFueraId,
        p_catalogo_vino_id:         catalogoVinoId,
        p_nombre:                   catalogVino.nombre,
        p_bodega:                   catalogVino.bodega   || null,
        p_tipo:                     catalogVino.tipo     || null,
        p_region:                   catalogVino.region   || null,
        p_anada:                    catalogVino.anada    || null,
        p_formato:                  catalogVino.formato  || null,
        p_precio_botella:           null,
        p_precio_copa:              null,
        p_coste_compra:             coste                || null,
        p_pvp_recomendado_catalogo: pvpBotella           || null,
        p_pvp_copa_catalogo:        pvpCopa              || null,
      }
    )

    // Persiste origen en la nueva línea (follow-up, fuera de la transacción atómica)
    if (!rpcError && origen && nuevaLinea?.id) {
      await supabaseAdmin.from('carta_simulacion').update({ origen }).eq('id', nuevaLinea.id)
    }

    if (rpcError) {
      // 23505 = unique_violation: el vino del catálogo ya está en el borrador
      if (rpcError.code === '23505') {
        return Response.json({ error: 'Este vino ya está en tu simulación' }, { status: 409 })
      }
      // La función lanza EXCEPTION si la línea no existe o no está en 'actual'
      if (rpcError.message?.includes('ya no está en estado actual')) {
        return Response.json({ error: 'El vino ya no está disponible para sustituir' }, { status: 409 })
      }
      throw rpcError
    }

    // Fusionar campos calculados en la respuesta (el RPC devuelve la fila tal cual fue insertada)
    const lineaFinal = {
      ...nuevaLinea,
      precio_botella: null,
      pvp_recomendado_catalogo: pvpBotella || null,
      pvp_copa_catalogo: pvpCopa || null,
      ...(origen ? { origen } : {}),
    }
    return Response.json({ linea: lineaFinal })
  } catch (err) {
    console.error('[simulador/sustituir POST]', err)
    return Response.json({ error: 'No se pudo realizar la sustitución.' }, { status: 500 })
  }
}
