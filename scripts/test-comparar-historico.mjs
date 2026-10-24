import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararHistoricoConflicto } from '../app/lib/compararHistoricoConflicto.js'

// Caso 1: sin diferencias → null
test('sin diferencias devuelve null', () => {
  const payload = { ingresos: 1000, consumo_mp: 300, gastos_fijos: 200, stock_final_valor: 500 }
  const fila    = { ingresos: 1000, consumo_mp: 300, gastos_fijos: 200, valor_stock_bodega: 500 }
  assert.equal(compararHistoricoConflicto(payload, fila), null)
})

// Caso 2: un campo numérico difiere → conflicto reportado
test('consumo_mp difiere → conflicto con auto y manual', () => {
  const payload = { ingresos: 1000, consumo_mp: 350, gastos_fijos: 200, stock_final_valor: 500 }
  const fila    = { ingresos: 1000, consumo_mp: 300, gastos_fijos: 200, valor_stock_bodega: 500 }
  const result  = compararHistoricoConflicto(payload, fila)
  assert.deepEqual(result, { consumo_mp: { auto: 350, manual: 300 } })
})

// Caso 3: valor_stock_bodega=0 (fila antigua sin el campo) → no reporta stock_final_valor
test('valor_stock_bodega=0 no genera conflicto de stock', () => {
  const payload = { ingresos: 1000, consumo_mp: 300, gastos_fijos: 200, stock_final_valor: 500 }
  const fila    = { ingresos: 1000, consumo_mp: 300, gastos_fijos: 200, valor_stock_bodega: 0 }
  assert.equal(compararHistoricoConflicto(payload, fila), null)
})
