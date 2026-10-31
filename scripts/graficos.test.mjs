/**
 * Tests de las funciones puras de app/components/charts/format.js.
 * Ejecutar: node --test scripts/graficos.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fmtEur, fmtPct, fmtMes, nicemax } from '../app/components/charts/format.js'

describe('fmtEur', () => {
  it('formato es-ES con separador de miles', () => {
    assert.strictEqual(fmtEur(1234567), '1.234.567€')
    assert.strictEqual(fmtEur(0), '0€')
  })
  it('decimales opcionales', () => {
    assert.strictEqual(fmtEur(12345.56, 2), '12.345,56€')
    assert.strictEqual(fmtEur(12345.56, 0), '12.346€')
  })
  it('no numéricos → "—"', () => {
    assert.strictEqual(fmtEur(null), '—')
    assert.strictEqual(fmtEur(undefined), '—')
    assert.strictEqual(fmtEur(NaN), '—')
    assert.strictEqual(fmtEur('abc'), '—')
  })
  it('negativos', () => {
    assert.strictEqual(fmtEur(-12345), '-12.345€')
  })
})

describe('fmtPct', () => {
  it('con decimales por defecto', () => {
    assert.strictEqual(fmtPct(37.1), '37,1%')
    assert.strictEqual(fmtPct(0), '0,0%')
  })
  it('sin decimales', () => {
    assert.strictEqual(fmtPct(37.1, 0), '37%')
    assert.strictEqual(fmtPct(37.9, 0), '38%')
  })
  it('no numéricos → "—"', () => {
    assert.strictEqual(fmtPct(null), '—')
    assert.strictEqual(fmtPct(undefined), '—')
  })
})

describe('fmtMes', () => {
  it('YYYY-MM → mes es', () => {
    assert.strictEqual(fmtMes('2026-01'), 'Ene')
    assert.strictEqual(fmtMes('2026-07'), 'Jul')
    assert.strictEqual(fmtMes('2026-12'), 'Dic')
  })
  it('entrada inválida → fallback', () => {
    assert.strictEqual(fmtMes(null), '')
    assert.strictEqual(fmtMes('xx'), 'xx')
    assert.strictEqual(fmtMes(''), '')
  })
})

describe('nicemax', () => {
  it('redondea a múltiplos nice', () => {
    assert.strictEqual(nicemax(37), 50)
    assert.strictEqual(nicemax(120), 200)
    assert.strictEqual(nicemax(1500), 2000)
    assert.strictEqual(nicemax(500), 500)
  })
  it('límites', () => {
    assert.strictEqual(nicemax(0), 1)
    assert.strictEqual(nicemax(-5), 1)
    assert.strictEqual(nicemax(1), 1)
  })
  it('coherencia con escalas típicas de cierre', () => {
    // Ventas típicas 5000-15000€/mes → debe dar máx fácil de leer
    const nx = nicemax(13496.82)
    assert.ok(nx >= 13496.82 && nx <= 20000, `nicemax=${nx}`)
  })
})
