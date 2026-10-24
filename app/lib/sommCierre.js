// Función pura: deriva el payload de historico_mensual a partir del snapshot
// de un cierre de bodega. Sin efectos secundarios ni llamadas a BD.

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100 }

/**
 * @param {{ restaurante_id: string, mes: string, snapshot: object }} params
 * @returns {{ restaurante_id, anio, mes, ingresos, consumo_mp, gastos_fijos, valor_stock_bodega, origen }}
 */
export function historicoPayloadDesdeCierre({ restaurante_id, mes, snapshot }) {
  if (!restaurante_id || !/^\d{4}-\d{2}$/.test(mes)) {
    throw new Error('historicoPayloadDesdeCierre: restaurante_id y mes (YYYY-MM) son obligatorios')
  }
  const [anioStr, mesStr] = mes.split('-')
  return {
    restaurante_id,
    anio:               parseInt(anioStr, 10),
    mes:                parseInt(mesStr, 10),
    ingresos:           r2(snapshot?.ventas_neto),
    consumo_mp:         r2(snapshot?.coste_ventas_teorico),
    gastos_fijos:       r2(snapshot?.gastos_total),
    valor_stock_bodega: r2(snapshot?.stock_final),
    origen:             'auto',
  }
}
