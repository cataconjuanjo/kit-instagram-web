/**
 * Unit tests for construirFilasHistoricoPrevYear (en app/lib/excelSomm.js).
 * Ejecutar: node --test scripts/excelSommHistoricoPrevYear.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { construirFilasHistoricoPrevYear } from '../app/lib/excelSomm.js'

describe('construirFilasHistoricoPrevYear — sin dato', () => {
  it('fila null → []', () => {
    assert.deepEqual(construirFilasHistoricoPrevYear('2026-07', null), [])
  })
  it('fila con los 4 extras a 0 → 3 filas "Sin dato"', () => {
    const filas = construirFilasHistoricoPrevYear('2026-07', {
      valor_stock_bodega: 0, stock_inicial_valor: 0,
      stock_final_valor: 0,  compras_total: 0,
      consumo_mp: 450, ingresos: 1000,
    })
    assert.equal(filas.length, 3)
    assert.ok(filas[0].concepto.startsWith('Histórico 2025-07'))
    assert.equal(filas[0].valor, 'Sin dato')
    assert.equal(filas[1].valor, 'Sin dato')
    assert.equal(filas[2].valor, 'Sin dato')
  })
  it('mesActual inválido → []', () => {
    assert.deepEqual(construirFilasHistoricoPrevYear('', { stock_inicial_valor: 100 }), [])
    assert.deepEqual(construirFilasHistoricoPrevYear('mal', { stock_inicial_valor: 100 }), [])
  })
})

describe('construirFilasHistoricoPrevYear — con dato', () => {
  it('con extras completos → 3 ratios numéricos', () => {
    const filas = construirFilasHistoricoPrevYear('2026-07', {
      valor_stock_bodega: 900,
      stock_inicial_valor: 1000,
      stock_final_valor: 800,
      compras_total: 500,
      consumo_mp: 450,
    })
    assert.equal(filas.length, 3)
    // Rotación = 450 / 900 = 0.5
    assert.equal(filas[0].valor, 0.5)
    // Cobertura = 800 × 31 / 450 ≈ 55.111
    assert.ok(Math.abs(Number(filas[1].valor) - 55.111) < 0.01)
    // Consumo/compras = 450 / 500 = 0.9
    assert.equal(filas[2].valor, 0.9)
  })

  it('ninguna fila empieza por "=" (texto plano, no fórmulas)', () => {
    const filas = construirFilasHistoricoPrevYear('2026-07', {
      stock_inicial_valor: 100,
      stock_final_valor: 100,
      compras_total: 50,
      consumo_mp: 50,
    })
    for (const f of filas) {
      const v = String(f.valor ?? '')
      assert.ok(!v.startsWith('='), `fila "${f.concepto}" no debe empezar por "=": "${v}"`)
      const c = String(f.concepto ?? '')
      assert.ok(!c.startsWith('='), `concepto no debe empezar por "=": "${c}"`)
    }
  })

  it('con solo stock final + consumo → sólo cobertura es numérica; las otras "Sin dato"', () => {
    const filas = construirFilasHistoricoPrevYear('2026-07', {
      stock_final_valor: 800,
      consumo_mp: 400,
    })
    assert.equal(filas[0].valor, 'Sin dato')             // rotación
    assert.equal(typeof filas[1].valor, 'number')         // cobertura sí
    assert.equal(filas[2].valor, 'Sin dato')             // consumo/compras
  })
})
