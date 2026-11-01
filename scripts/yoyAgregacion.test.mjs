/**
 * Tests del helper puro app/lib/yoyAgregacion.js.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  mesesComparables,
  calcularYoY,
} from '../app/lib/yoyAgregacion.js'

const metricasBasicas = [
  { key: 'ingresos',    tipo: 'importe' },
  { key: 'consumo_mp',  tipo: 'importe' },
  { key: 'pct_mp',      tipo: 'ratio'   },
]

function row(anio, mes, over = {}) {
  return { anio, mes, ingresos: 1000, consumo_mp: 400, pct_mp: 40, ...over }
}

// ── mesesComparables ────────────────────────────────────────────────────────

describe('mesesComparables', () => {
  it('intersección simple sin mes en curso', () => {
    const actual = [row(2026, 1), row(2026, 2), row(2026, 3)]
    const prev   = [row(2025, 1), row(2025, 2), row(2025, 3)]
    const r = mesesComparables(actual, prev, { mesActualHoy: { anio: 2027, mes: 1 } })
    assert.deepStrictEqual(r, [1, 2, 3])
  })

  it('excluye el mes en curso del año actual', () => {
    const actual = [row(2026, 1), row(2026, 2), row(2026, 10)]
    const prev   = [row(2025, 1), row(2025, 2), row(2025, 10)]
    // Hoy = Oct 2026 → el 10 queda fuera
    const r = mesesComparables(actual, prev, { mesActualHoy: { anio: 2026, mes: 10 } })
    assert.deepStrictEqual(r, [1, 2])
  })

  it('NO excluye el mes 10 si estamos ya en noviembre', () => {
    const actual = [row(2026, 1), row(2026, 10)]
    const prev   = [row(2025, 1), row(2025, 10)]
    const r = mesesComparables(actual, prev, { mesActualHoy: { anio: 2026, mes: 11 } })
    assert.deepStrictEqual(r, [1, 10])
  })

  it('año anterior ausente → []', () => {
    const actual = [row(2026, 1), row(2026, 2)]
    const r = mesesComparables(actual, [], { mesActualHoy: { anio: 2027, mes: 1 } })
    assert.deepStrictEqual(r, [])
  })

  it('huecos en el año anterior se omiten', () => {
    const actual = [row(2026, 1), row(2026, 2), row(2026, 3)]
    const prev   = [row(2025, 1),               row(2025, 3)]  // falta feb
    const r = mesesComparables(actual, prev, { mesActualHoy: { anio: 2027, mes: 1 } })
    assert.deepStrictEqual(r, [1, 3])
  })

  it('historicoActual vacío → []', () => {
    assert.deepStrictEqual(mesesComparables([], [row(2025, 1)]), [])
    assert.deepStrictEqual(mesesComparables(null, null), [])
  })

  it('anioActual se infiere de la primera fila si no se pasa', () => {
    const actual = [row(2026, 1), row(2026, 10)]
    const prev   = [row(2025, 1), row(2025, 10)]
    const r = mesesComparables(actual, prev, { mesActualHoy: { anio: 2026, mes: 10 } })
    assert.deepStrictEqual(r, [1])
  })
})

// ── calcularYoY — básico ────────────────────────────────────────────────────

describe('calcularYoY — básico', () => {
  it('YTD suma solo meses comparables', () => {
    const actual = [
      row(2026, 1, { ingresos: 1000 }),
      row(2026, 2, { ingresos: 2000 }),
      row(2026, 3, { ingresos: 500 }),   // sin prev → excluido del YTD
    ]
    const prev = [
      row(2025, 1, { ingresos: 800 }),
      row(2025, 2, { ingresos: 1600 }),
    ]
    const r = calcularYoY({
      actual, prev, metricas: [{ key: 'ingresos' }],
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    assert.deepStrictEqual(r.meses, [1, 2])
    assert.strictEqual(r.ytd.ingresos.valor,     3000)
    assert.strictEqual(r.ytd.ingresos.valorPrev, 2400)
    assert.strictEqual(r.ytd.ingresos.delta,     600)
    assert.strictEqual(r.ytd.ingresos.deltaPct,  25)
  })

  it('porMes incluye TODOS los meses del año actual (incluso sin prev)', () => {
    const actual = [row(2026, 1, { ingresos: 1000 }), row(2026, 3, { ingresos: 500 })]
    const prev   = [row(2025, 1, { ingresos: 800 })]
    const r = calcularYoY({
      actual, prev, metricas: [{ key: 'ingresos' }],
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    assert.ok(r.porMes.ingresos[1])
    assert.ok(r.porMes.ingresos[3])
    assert.strictEqual(r.porMes.ingresos[3].valorPrev, null)
    assert.strictEqual(r.porMes.ingresos[3].delta,     null)
    assert.strictEqual(r.porMes.ingresos[3].deltaPct,  null)
  })
})

// ── calcularYoY — casos borde ───────────────────────────────────────────────

describe('calcularYoY — casos borde', () => {
  it('prev == 0 → deltaPct es null (no divide por cero)', () => {
    const actual = [row(2026, 1, { ingresos: 1000 })]
    const prev   = [row(2025, 1, { ingresos: 0 })]
    const r = calcularYoY({
      actual, prev, metricas: [{ key: 'ingresos' }],
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    assert.strictEqual(r.ytd.ingresos.deltaPct,         null)
    assert.strictEqual(r.porMes.ingresos[1].deltaPct,   null)
    // El delta sigue siendo 1000 (dato útil aunque no haya %)
    assert.strictEqual(r.ytd.ingresos.delta,            1000)
  })

  it('prev negativo preserva el signo correcto en Δ%', () => {
    // actual=10, prev=-20 → delta=30, deltaPct = 30/|−20|×100 = +150
    const actual = [row(2026, 1, { ingresos: 10 })]
    const prev   = [row(2025, 1, { ingresos: -20 })]
    const r = calcularYoY({
      actual, prev, metricas: [{ key: 'ingresos' }],
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    assert.strictEqual(r.ytd.ingresos.delta,    30)
    assert.strictEqual(r.ytd.ingresos.deltaPct, 150)
  })

  it('actual ausente para la métrica → valor null, delta/deltaPct null', () => {
    const actual = [{ anio: 2026, mes: 1 }]   // sin "ingresos"
    const prev   = [row(2025, 1, { ingresos: 500 })]
    const r = calcularYoY({
      actual, prev, metricas: [{ key: 'ingresos' }],
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    assert.strictEqual(r.porMes.ingresos[1].valor,    null)
    assert.strictEqual(r.porMes.ingresos[1].valorPrev, 500)
    assert.strictEqual(r.porMes.ingresos[1].delta,    null)
  })

  it('mes abierto EXCLUIDO del YTD; sí aparece en porMes', () => {
    const actual = [
      row(2026, 1,  { ingresos: 1000 }),
      row(2026, 10, { ingresos: 500 }),   // mes en curso
    ]
    const prev = [
      row(2025, 1,  { ingresos: 800 }),
      row(2025, 10, { ingresos: 400 }),
    ]
    const r = calcularYoY({
      actual, prev, metricas: [{ key: 'ingresos' }],
      mesActualHoy: { anio: 2026, mes: 10 },
    })
    assert.deepStrictEqual(r.meses, [1])
    assert.strictEqual(r.ytd.ingresos.valor, 1000)         // no incluye 500
    assert.ok(r.porMes.ingresos[10])                        // sí visible por-mes
    assert.strictEqual(r.porMes.ingresos[10].valor, 500)
  })
})

// ── calcularYoY — ratios ────────────────────────────────────────────────────

describe('calcularYoY — ratios en puntos porcentuales', () => {
  it('ratio: delta = diff en pp, deltaPct = null', () => {
    const actual = [row(2026, 1, { pct_mp: 37.5 }), row(2026, 2, { pct_mp: 38.0 })]
    const prev   = [row(2025, 1, { pct_mp: 35.0 }), row(2025, 2, { pct_mp: 36.0 })]
    const r = calcularYoY({
      actual, prev, metricas: [{ key: 'pct_mp', tipo: 'ratio' }],
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    // promedio actual = 37.75, prev = 35.5 → delta = 2.25 pp
    assert.strictEqual(r.ytd.pct_mp.valor,     37.75)
    assert.strictEqual(r.ytd.pct_mp.valorPrev, 35.5)
    assert.strictEqual(r.ytd.pct_mp.delta,     2.25)
    assert.strictEqual(r.ytd.pct_mp.deltaPct,  null)  // sin %/% confuso
    assert.strictEqual(r.ytd.pct_mp.tipo,      'ratio')
  })

  it('ratio por mes: también en pp, deltaPct null', () => {
    const actual = [row(2026, 1, { pct_mp: 37.5 })]
    const prev   = [row(2025, 1, { pct_mp: 35.0 })]
    const r = calcularYoY({
      actual, prev, metricas: [{ key: 'pct_mp', tipo: 'ratio' }],
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    assert.strictEqual(r.porMes.pct_mp[1].delta,    2.5)
    assert.strictEqual(r.porMes.pct_mp[1].deltaPct, null)
  })
})

// ── calcularYoY — año anterior inexistente ──────────────────────────────────

describe('calcularYoY — sin año anterior', () => {
  it('prev vacío → ytd.valorPrev null, delta null, deltaPct null; sin errores', () => {
    const actual = [row(2026, 1, { ingresos: 1000 }), row(2026, 2, { ingresos: 2000 })]
    const r = calcularYoY({
      actual, prev: [], metricas: metricasBasicas,
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    assert.deepStrictEqual(r.meses, [])
    assert.strictEqual(r.ytd.ingresos.valor,     null)  // tengoAct=false si meses está vacío
    assert.strictEqual(r.ytd.ingresos.valorPrev, null)
    assert.strictEqual(r.ytd.ingresos.delta,     null)
    assert.strictEqual(r.ytd.ingresos.deltaPct,  null)
    // Pero porMes del año actual sigue mostrándose aunque sin prev
    assert.strictEqual(r.porMes.ingresos[1].valor,     1000)
    assert.strictEqual(r.porMes.ingresos[1].valorPrev, null)
    assert.strictEqual(r.porMes.ingresos[1].delta,     null)
  })
})
