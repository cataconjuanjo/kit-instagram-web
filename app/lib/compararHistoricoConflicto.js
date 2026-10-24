/**
 * Compara un payload 'auto' con una fila manual de historico_mensual.
 * Devuelve un objeto con los campos en conflicto, o null si no hay diferencias.
 *
 * stock_final_valor se omite del diff cuando valor_stock_bodega === 0 porque eso
 * indica que la fila manual se creó antes de que existiera ese campo (falso conflicto).
 */
export function compararHistoricoConflicto(payload, filaExistente) {
  const conflicto = {}

  const CAMPOS = ['ingresos', 'consumo_mp', 'gastos_fijos']
  for (const c of CAMPOS) {
    const auto   = payload[c] ?? 0
    const manual = Number(filaExistente[c]) ?? 0
    if (Math.abs(auto - manual) > 0.01) {
      conflicto[c] = { auto, manual }
    }
  }

  const autoStock   = payload.stock_final_valor ?? 0
  const manualStock = Number(filaExistente.valor_stock_bodega) ?? 0
  if (manualStock > 0 && Math.abs(autoStock - manualStock) > 0.01) {
    conflicto.stock_final_valor = { auto: autoStock, manual: manualStock }
  }

  return Object.keys(conflicto).length > 0 ? conflicto : null
}
