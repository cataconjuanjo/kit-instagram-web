/**
 * Tests de agregarGraficosSomm (app/lib/graficosSommAgregacion.js).
 * Ejecutar: node --test scripts/graficosSommAgregacion.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { agregarGraficosSomm } from '../app/lib/graficosSommAgregacion.js'

const vinoFila = (over = {}) => ({
  entradas_u: 0, ventas_bot_u: 0, ventas_copa_u: 0, copas_servidas_u: 0,
  otras_salidas_u: 0, ajustes_u: 0, stock_ini: 0, stock_fin: 0,
  coste_teorico_ventas: 0, consumo_real_stock: 0, diferencia_consumo: 0,
  ...over,
})

describe('agregarGraficosSomm', () => {
  it('mes cerrado toma ventas_neto y coste_ventas_teorico del cierre', () => {
    const ctx = {
      meses: [{ mes: '2025-06', estado: 'cerrado', totales: vinoFila({ coste_teorico_ventas: 1000, diferencia_consumo: 50 }) }],
      cierresMap: { '2025-06': { ventas_neto: 10000, coste_ventas_teorico: 3700, resultado: 1500 } },
      historicoMap: { '2025-06': { ingresos: 10000, consumo_mp: 3800 } },
      presupuestoMap: { '2025-06': { objetivo_mp_pct: 37, objetivo_facturacion: 11000 } },
    }
    const [out] = agregarGraficosSomm(ctx)
    assert.strictEqual(out.ventas_neto, 10000)
    assert.strictEqual(out.coste_teorico, 3700)
    assert.strictEqual(out.cogs_pct, 37)
    assert.strictEqual(out.consumo_mp, 3800)
    assert.strictEqual(out.resultado, 1500)
    assert.strictEqual(out.merma_implicita, 50)
    assert.strictEqual(out.objetivo_mp_pct, 37)
    assert.strictEqual(out.objetivo_facturacion, 11000)
  })

  it('mes estimado SIN ventas → ventas/cogs_pct/resultado = null', () => {
    const ctx = {
      meses: [{ mes: '2026-10', estado: 'estimado', totales: vinoFila({ coste_teorico_ventas: 200, diferencia_consumo: 15 }) }],
      cierresMap: {}, historicoMap: {}, presupuestoMap: {},
    }
    const [out] = agregarGraficosSomm(ctx)
    assert.strictEqual(out.ventas_neto, null)
    assert.strictEqual(out.cogs_pct, null)
    assert.strictEqual(out.resultado, null)
    assert.strictEqual(out.consumo_mp, null)
    // Merma implícita sigue devolviéndose (visualmente útil)
    assert.strictEqual(out.merma_implicita, 15)
  })

  it('mes estimado CON ventas (p.ej. mes en curso con partes cerrados) → números, no null', () => {
    const ctx = {
      meses: [{ mes: '2026-10', estado: 'estimado', totales: vinoFila({ coste_teorico_ventas: 400 }) }],
      cierresMap: {},
      historicoMap: { '2026-10': { ingresos: 2000, consumo_mp: 600 } },
      presupuestoMap: {},
    }
    const [out] = agregarGraficosSomm(ctx)
    assert.strictEqual(out.ventas_neto, 2000)
    assert.strictEqual(out.cogs_pct, 20)  // 400/2000 × 100
    assert.strictEqual(out.consumo_mp, 600)
    // Sin cierre.resultado y mes NO cerrado → null (no 0 falso)
    assert.strictEqual(out.resultado, null)
  })

  it('mes cerrado sin resultado publicado → 0 (no null): es un cierre, 0 es dato real', () => {
    const ctx = {
      meses: [{ mes: '2025-03', estado: 'cerrado', totales: vinoFila() }],
      cierresMap: { '2025-03': { ventas_neto: 500, coste_ventas_teorico: 180 } },
      historicoMap: {}, presupuestoMap: {},
    }
    const [out] = agregarGraficosSomm(ctx)
    assert.strictEqual(out.resultado, 0)
    assert.strictEqual(out.cogs_pct, 36)
  })

  it('objetivo_mp_pct opcional: null si no hay presupuesto', () => {
    const ctx = {
      meses: [{ mes: '2025-06', estado: 'cerrado', totales: vinoFila() }],
      cierresMap: { '2025-06': { ventas_neto: 1000, coste_ventas_teorico: 370 } },
      historicoMap: {}, presupuestoMap: {},
    }
    const [out] = agregarGraficosSomm(ctx)
    assert.strictEqual(out.objetivo_mp_pct, null)
    assert.strictEqual(out.objetivo_facturacion, null)
  })

  it('array vacío o sin meses → []', () => {
    assert.deepStrictEqual(agregarGraficosSomm({ meses: [], cierresMap: {}, historicoMap: {}, presupuestoMap: {} }), [])
    assert.deepStrictEqual(agregarGraficosSomm({ meses: undefined }), [])
  })

  it('redondea a 2 decimales', () => {
    const ctx = {
      meses: [{ mes: '2025-06', estado: 'cerrado', totales: vinoFila({ diferencia_consumo: 123.4567 }) }],
      cierresMap: { '2025-06': { ventas_neto: 10000.123, coste_ventas_teorico: 3700.456, resultado: 1500.789 } },
      historicoMap: {}, presupuestoMap: {},
    }
    const [out] = agregarGraficosSomm(ctx)
    assert.strictEqual(out.ventas_neto, 10000.12)
    assert.strictEqual(out.coste_teorico, 3700.46)
    assert.strictEqual(out.resultado, 1500.79)
    assert.strictEqual(out.merma_implicita, 123.46)
  })
})
