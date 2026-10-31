/**
 * Tests de clampChartWidth (función pura de useChartWidth.js).
 * No requiere DOM; cubre fallback, mínimo, máximo y redondeo.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampChartWidth,
  CHART_WIDTH_MIN,
  CHART_WIDTH_MAX,
} from '../app/components/charts/useChartWidth.js'

describe('clampChartWidth', () => {
  it('rangos sanos pasan tal cual (redondeados)', () => {
    assert.strictEqual(clampChartWidth(640),   640)
    assert.strictEqual(clampChartWidth(1600), 1600)
    assert.strictEqual(clampChartWidth(2399.4), 2399)
    assert.strictEqual(clampChartWidth(640.6),  641)
  })

  it('fallback cuando el valor no es número válido', () => {
    assert.strictEqual(clampChartWidth(null),       600)
    assert.strictEqual(clampChartWidth(undefined),  600)
    assert.strictEqual(clampChartWidth(NaN),        600)
    assert.strictEqual(clampChartWidth('abc'),      600)
    assert.strictEqual(clampChartWidth(''),         600)
  })

  it('fallback cuando el valor es <= 0 (contenedor display:none)', () => {
    assert.strictEqual(clampChartWidth(0),       600)
    assert.strictEqual(clampChartWidth(-10),     600)
    assert.strictEqual(clampChartWidth(-0.0001), 600)
  })

  it('fallback respeta el valor pasado por el llamador', () => {
    assert.strictEqual(clampChartWidth(null, 800), 800)
    assert.strictEqual(clampChartWidth(0,    320), 320)
  })

  it('aplica mínimo cuando el contenedor es más estrecho que 280px', () => {
    assert.strictEqual(CHART_WIDTH_MIN, 280)
    assert.strictEqual(clampChartWidth(100), 280)
    assert.strictEqual(clampChartWidth(279.9), 280)
    assert.strictEqual(clampChartWidth(280), 280)
    assert.strictEqual(clampChartWidth(281), 281)
  })

  it('aplica máximo cuando el contenedor es más ancho que 2400px', () => {
    assert.strictEqual(CHART_WIDTH_MAX, 2400)
    assert.strictEqual(clampChartWidth(2400), 2400)
    assert.strictEqual(clampChartWidth(2500), 2400)
    assert.strictEqual(clampChartWidth(5000), 2400)
  })

  it('coherencia: fallback 600 está en el rango permitido', () => {
    assert.ok(CHART_WIDTH_MIN <= 600 && 600 <= CHART_WIDTH_MAX)
  })
})
