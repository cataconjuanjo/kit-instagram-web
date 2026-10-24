// Función pura: deriva el payload de historico_mensual a partir del snapshot
// de un cierre de bodega. Sin efectos secundarios ni llamadas a BD.
// consumo_mp = método inventario: stock_inicial + compras - stock_final

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100 }

export function historicoPayloadDesdeCierre({
  restaurante_id,
  mes,
  snapshot,
  stock_inicial_valor = 0,
  compras_total = 0,
}) {
  if (!restaurante_id) {
    throw new Error('historicoPayloadDesdeCierre: restaurante_id es obligatorio')
  }
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    throw new Error('historicoPayloadDesdeCierre: mes debe tener formato YYYY-MM')
  }
  const [anioStr, mesStr] = mes.split('-')
  const s               = snapshot || {}
  const ingresos        = r2(s.ventas_neto)
  const stock_final_val = r2(s.stock_final)
  const ini             = r2(stock_inicial_valor)
  const comp            = r2(compras_total)
  const consumo_mp      = r2(ini + comp - stock_final_val)
  const pct_mp          = ingresos > 0 ? r2(consumo_mp / ingresos * 100) : 0
  return {
    restaurante_id,
    anio:                parseInt(anioStr, 10),
    mes:                 parseInt(mesStr, 10),
    ingresos,
    consumo_mp,
    pct_mp,
    gastos_fijos:        r2(s.gastos_total),
    stock_inicial_valor: ini,
    stock_final_valor:   stock_final_val,
    compras_total:       comp,
    valor_stock_bodega:  stock_final_val,  // alias backward-compat
    origen:              'auto',
  }
}
