export function añadirVinosStockAlSnapshot(snapshot, vinos) {
  const vinos_stock = (vinos || []).map(v => ({
    vino_id:     v.id,
    stock_uds:   Math.max(0, Math.floor(Number(v.stock) || 0)),
    coste_medio: Number(v.coste_medio_pmp) || Number(v.coste_compra) || 0,
  }))
  // Compute stock_final (valor inventario) so consumo_mp = stock_ini + compras - stock_final
  // is correct for months without a conteo_inventario.
  const stock_final = Math.round(
    vinos_stock.reduce((s, v) => s + v.stock_uds * v.coste_medio, 0) * 100
  ) / 100
  return {
    ...snapshot,
    vinos_stock,
    stock_final,
  }
}

export async function insertarStockMensualBodega(supabase, { restaurante_id, mes, vinos_stock }) {
  if (!vinos_stock?.length) return { error: null }
  const filas = vinos_stock.map(v => ({
    restaurante_id,
    mes,
    vino_id:          v.vino_id,
    stock_final_real: v.stock_uds,
    coste_medio:      v.coste_medio,
  }))
  const { error } = await supabase
    .from('stock_mensual_bodega')
    .upsert(filas, { onConflict: 'restaurante_id,mes,vino_id', ignoreDuplicates: true })
  return { error: error || null }
}
