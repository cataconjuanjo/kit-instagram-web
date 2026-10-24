/**
 * Clasifica cierres de bodega en reconstruibles (tienen snapshot.vinos_stock)
 * y no-reconstruibles, para usarse en el backfill de stock_mensual_bodega.
 */
export function clasificarCierresParaBackfill(cierres) {
  const lista = cierres || []
  const reconstruibles = lista.filter(
    c => Array.isArray(c.snapshot?.vinos_stock) && c.snapshot.vinos_stock.length > 0,
  )
  const noReconstruibles = lista
    .filter(c => !Array.isArray(c.snapshot?.vinos_stock) || c.snapshot.vinos_stock.length === 0)
    .map(c => c.mes)
  return { reconstruibles, noReconstruibles }
}
