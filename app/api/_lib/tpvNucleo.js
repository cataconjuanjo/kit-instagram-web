import { supabaseAdmin } from '../../lib/supabaseAdmin'

/**
 * Resuelve el restaurante dado el (fuente, local_id) del TPV.
 * Devuelve { restaurante_id, tpv_movimientos_activo } o null.
 * Si hay ambigüedad (>1 fila) devuelve null y loguea.
 */
export async function resolveRestaurantePorLocalId(fuente, localId) {
  if (!fuente || !localId) return null

  const { data, error } = await supabaseAdmin
    .from('restaurant_economic_settings')
    .select('restaurante_id, tpv_movimientos_activo')
    .eq('tpv_fuente', fuente)
    .eq('tpv_local_id', localId)

  if (error) throw new Error(`resolveRestaurantePorLocalId: ${error.message}`)
  if (!data || data.length === 0) return null
  if (data.length > 1) {
    console.error(
      `[tpv-nucleo] fuente=${fuente} local_id=${localId} ambiguo: ${data.length} restaurantes — skipping`
    )
    return null
  }
  return data[0]
}

/**
 * Consulta tpv_vino_map para los product IDs dados.
 * Devuelve un Map<producto_externo_id, { vino_id, formato_venta, estado }>.
 */
export async function lookupVinoMap(restauranteId, fuente, productoIds) {
  if (!productoIds.length) return new Map()

  const { data, error } = await supabaseAdmin
    .from('tpv_vino_map')
    .select('producto_externo_id, vino_id, formato_venta, estado')
    .eq('restaurante_id', restauranteId)
    .eq('fuente', fuente)
    .in('producto_externo_id', productoIds)

  if (error) throw new Error(`lookupVinoMap: ${error.message}`)
  const map = new Map()
  for (const row of data || []) map.set(row.producto_externo_id, row)
  return map
}

/**
 * Llama al RPC registrar_ventas_tpv (service_role).
 * pLines: array de objetos con campos del contrato del RPC.
 */
export async function registrarVentasTPV(restauranteId, fuente, paymentId, paymentDate, pLines) {
  const { data, error } = await supabaseAdmin.rpc('registrar_ventas_tpv', {
    p_restaurante_id: restauranteId,
    p_payment_id:     paymentId,
    p_payment_date:   paymentDate,
    p_lines:          pLines,
    p_fuente:         fuente,
  })
  if (error) throw new Error(`registrar_ventas_tpv: ${error.message}`)
  return Array.isArray(data) ? data : []
}

/**
 * Llama al RPC asignar_lineas_tpv (service_role).
 */
export async function asignarLineasTPV({
  restauranteId,
  fuente,
  productoExternoId,
  vinoId,
  formatoVenta,
  accion,
  lineaId = null,
}) {
  const { data, error } = await supabaseAdmin.rpc('asignar_lineas_tpv', {
    p_restaurante_id:      restauranteId,
    p_fuente:              fuente,
    p_producto_externo_id: productoExternoId,
    p_vino_id:             vinoId || null,
    p_formato_venta:       formatoVenta || null,
    p_accion:              accion,
    p_linea_id:            lineaId,
  })
  if (error) throw new Error(`asignar_lineas_tpv: ${error.message}`)
  return data
}
