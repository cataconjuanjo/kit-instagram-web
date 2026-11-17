/**
 * Unit tests for app/lib/ratiosCierre.js — foco en cobertura del mes
 * en curso vs mes cerrado.
 *
 * Ejecutar: node --test scripts/ratiosCierreCobertura.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularRatios,
  diasDelMes,
  diasEfectivosCobertura,
} from '../app/lib/ratiosCierre.js'

// Snapshot mínimo: sólo lo imprescindible para que `cobertura_dias`
// pueda calcularse (stock final real + coste de ventas + mes).
function snapshot(mes, { stockFin = 1000, coste = 500 } = {}) {
  return {
    datos: { mes, coste_ventas_teorico: coste },
    desglose: {
      desglose_v: 1,
      stock_final_real: { valor_eur: stockFin },
    },
  }
}

describe('diasDelMes', () => {
  it('30, 31, 28/29 según corresponda', () => {
    assert.equal(diasDelMes('2026-04'), 30)
    assert.equal(diasDelMes('2026-01'), 31)
    assert.equal(diasDelMes('2026-02'), 28)
    assert.equal(diasDelMes('2024-02'), 29)   // año bisiesto
  })
  it('null para entradas inválidas', () => {
    assert.equal(diasDelMes(''), null)
    assert.equal(diasDelMes('2026/04'), null)
    assert.equal(diasDelMes(null), null)
  })
})

describe('diasEfectivosCobertura', () => {
  it('mes pasado → días totales, parcial=false', () => {
    const r = diasEfectivosCobertura('2026-09', new Date(2026, 10, 15))  // noviembre
    assert.deepEqual(r, { dias: 30, parcial: false })
  })

  it('mes futuro → días totales, parcial=false', () => {
    const r = diasEfectivosCobertura('2027-03', new Date(2026, 10, 15))
    assert.deepEqual(r, { dias: 31, parcial: false })
  })

  it('mes en curso → días transcurridos (incluido hoy), parcial=true', () => {
    // 15 de noviembre de 2026
    const r = diasEfectivosCobertura('2026-11', new Date(2026, 10, 15))
    assert.deepEqual(r, { dias: 15, parcial: true })
  })

  it('mes en curso, día 1 → devuelve 1 (no 0)', () => {
    const r = diasEfectivosCobertura('2026-11', new Date(2026, 10, 1))
    assert.deepEqual(r, { dias: 1, parcial: true })
  })

  it('mes en curso, último día → días totales, parcial=true', () => {
    const r = diasEfectivosCobertura('2026-11', new Date(2026, 10, 30))
    assert.deepEqual(r, { dias: 30, parcial: true })
  })
})

describe('calcularRatios · cobertura mes cerrado', () => {
  it('usa días totales del mes', () => {
    // stockFin=1000, coste=500, nov 2026 (30 días)
    // cobertura = 1000 * 30 / 500 = 60 días
    const { datos, desglose } = snapshot('2026-11', { stockFin: 1000, coste: 500 })
    const r = calcularRatios({ datos, desglose, hoy: new Date(2026, 11, 15) })
    assert.equal(r.cobertura_dias, 60)
    assert.equal(r.cobertura_parcial, false)
    assert.equal(r.meta.dias_cobertura, 30)
  })
})

describe('calcularRatios · cobertura mes en curso', () => {
  it('usa días transcurridos como divisor del consumo diario', () => {
    // Mes en curso = noviembre 2026. Hoy = día 15.
    // Con días transcurridos=15: cobertura = 1000 * 15 / 500 = 30 días
    // (si usara los 30 días del mes daría 60, inflada).
    const { datos, desglose } = snapshot('2026-11', { stockFin: 1000, coste: 500 })
    const r = calcularRatios({ datos, desglose, hoy: new Date(2026, 10, 15) })
    assert.equal(r.cobertura_dias, 30)
    assert.equal(r.cobertura_parcial, true)
    assert.equal(r.meta.dias_cobertura, 15)
  })

  it('no inflar cobertura al principio del mes (día 1 → cobertura mínima)', () => {
    const { datos, desglose } = snapshot('2026-11', { stockFin: 1000, coste: 50 })
    const r = calcularRatios({ datos, desglose, hoy: new Date(2026, 10, 1) })
    // 1000 * 1 / 50 = 20 días (en vez de 1000 * 30 / 50 = 600 días)
    assert.equal(r.cobertura_dias, 20)
    assert.equal(r.cobertura_parcial, true)
  })

  it('sin inventario (stock final null) → cobertura null (no 0)', () => {
    const { datos, desglose } = snapshot('2026-11', { stockFin: null, coste: 500 })
    const r = calcularRatios({ datos, desglose, hoy: new Date(2026, 10, 15) })
    assert.equal(r.cobertura_dias, null)
  })

  it('sin coste (0 o null) → cobertura null (no 0, evita división por 0)', () => {
    const r1 = calcularRatios({
      datos: { mes: '2026-11', coste_ventas_teorico: 0 },
      desglose: { desglose_v: 1, stock_final_real: { valor_eur: 1000 } },
      hoy: new Date(2026, 10, 15),
    })
    assert.equal(r1.cobertura_dias, null)

    const r2 = calcularRatios({
      datos: { mes: '2026-11' },
      desglose: { desglose_v: 1, stock_final_real: { valor_eur: 1000 } },
      hoy: new Date(2026, 10, 15),
    })
    assert.equal(r2.cobertura_dias, null)
  })
})
