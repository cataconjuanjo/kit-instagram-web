import { fetchSquareOrder } from './squareSync'
import {
  resolveRestaurantePorLocalId,
  lookupVinoMap,
  registrarVentasTPV,
} from './tpvNucleo'

const FUENTE = 'square'

export async function syncBodegaForPayment(payment, locationId, squareToken) {
  if (!payment.order_id) return { skipped: 'no_order_id' }

  const settings = await resolveRestaurantePorLocalId(FUENTE, locationId)
  if (!settings?.tpv_movimientos_activo) return { skipped: true }

  const { restaurante_id } = settings

  const order = await fetchSquareOrder(payment.order_id, squareToken)
  const allItems = order?.line_items || []

  const items = allItems.filter(li => li.item_type === 'ITEM')

  const sinCatalogId = items.filter(li => !li.catalog_object_id)
  if (sinCatalogId.length > 0) {
    console.log(
      `[bodega-sync] payment_id=${payment.id}: ${sinCatalogId.length} línea(s) sin catalog_object_id ` +
      `(${sinCatalogId.map(li => li.name || '(sin nombre)').join(', ')}) — no encolar`
    )
  }

  const lineItems = items.filter(li => {
    if (!li.catalog_object_id) return false
    if (!li.uid) {
      console.warn(`[bodega-sync] payment_id=${payment.id} item "${li.name}": sin uid — saltando`)
      return false
    }
    return true
  })

  if (!lineItems.length) return { ok: true, processed: 0 }

  const catalogIds = lineItems.map(li => li.catalog_object_id)
  const vinoMap = await lookupVinoMap(restaurante_id, FUENTE, catalogIds)

  const pLines = lineItems.map(li => {
    const map  = vinoMap.get(li.catalog_object_id)
    const qty  = parseFloat(li.quantity) || 0
    // base_price_money es POR UNIDAD → precio_unitario_bruto = base / 100 (sin dividir por qty)
    // total_discount_money es de la LÍNEA COMPLETA → descuento_unitario = disc / qty / 100
    const base = li.base_price_money?.amount  || 0
    const disc = li.total_discount_money?.amount || 0
    return {
      uid:                   li.uid,
      producto_externo_id:   li.catalog_object_id,
      nombre_producto:       li.name || null,
      vino_id:               map?.vino_id    || null,
      formato_venta:         map?.formato_venta || null,
      estado_mapeo:          map?.estado     || null,
      cantidad:              qty,
      precio_unitario_bruto: base / 100,
      descuento_unitario:    qty > 0 ? Math.round(disc / qty) / 100 : null,
      importe_bruto_iva:     (li.total_money?.amount || 0) / 100,
    }
  })

  const paymentDate = payment.created_at || payment.updated_at || new Date().toISOString()
  const result = await registrarVentasTPV(restaurante_id, FUENTE, payment.id, paymentDate, pLines)

  const nOk   = result.filter(l => l.status === 'ok').length
  const nCola = result.filter(l => !['ok', 'already_applied', 'ignorado'].includes(l.status)).length
  console.log(
    `[bodega-sync] payment_id=${payment.id} restaurante=${restaurante_id}: ` +
    `${nOk} movimiento(s), ${nCola} en cola`
  )

  return { ok: true, restaurante_id, lineas: result }
}
