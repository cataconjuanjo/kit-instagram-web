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

// ── calcularYoY — ratio PONDERADO con num/den ───────────────────────────────

describe('calcularYoY — ratio ponderado Σ(num)/Σ(den)', () => {
  it('ponderación corrige el sesgo de media simple cuando los meses pesan distinto', () => {
    // Enero: ventas pequeñas con % MP alto. Agosto: ventas grandes con % MP bajo.
    // Media simple inflaría el % anual; ponderado da el verdadero % anual.
    const actual = [
      { anio: 2026, mes: 1, ingresos: 1000, consumo_mp: 500 },   // pct_mp = 50%
      { anio: 2026, mes: 8, ingresos: 9000, consumo_mp: 2700 },  // pct_mp = 30%
    ]
    const prev = [
      { anio: 2025, mes: 1, ingresos: 800,  consumo_mp: 400 },   // 50%
      { anio: 2025, mes: 8, ingresos: 8000, consumo_mp: 2400 },  // 30%
    ]
    // Media simple ambos años: (50+30)/2 = 40% → delta 0 pp (engañoso)
    // Ponderado 2026: (500+2700)/(1000+9000)*100 = 3200/10000*100 = 32%
    // Ponderado 2025: (400+2400)/(800 +8000)*100 = 2800/8800 *100 = 31.82%
    // Delta = +0.18 pp
    const r = calcularYoY({
      actual, prev,
      metricas: [{ key: 'pct_mp', tipo: 'ratio', num: 'consumo_mp', den: 'ingresos', escala: 100 }],
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    assert.strictEqual(r.ytd.pct_mp.valor,     32)
    assert.strictEqual(r.ytd.pct_mp.valorPrev, 31.82)
    assert.strictEqual(r.ytd.pct_mp.delta,     0.18)
    assert.strictEqual(r.ytd.pct_mp.deltaPct,  null)
    assert.strictEqual(r.ytd.pct_mp.tipo,      'ratio')
  })

  it('ponderado != media simple con la MISMA entrada', () => {
    const actual = [
      { anio: 2026, mes: 1, pct_mp: 50, ingresos: 1000, consumo_mp: 500 },
      { anio: 2026, mes: 8, pct_mp: 30, ingresos: 9000, consumo_mp: 2700 },
    ]
    const prev = [
      { anio: 2025, mes: 1, pct_mp: 50, ingresos: 800,  consumo_mp: 400 },
      { anio: 2025, mes: 8, pct_mp: 30, ingresos: 8000, consumo_mp: 2400 },
    ]
    const simple = calcularYoY({
      actual, prev,
      metricas: [{ key: 'pct_mp', tipo: 'ratio' }],  // sin num/den → simple
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    const ponder = calcularYoY({
      actual, prev,
      metricas: [{ key: 'pct_mp', tipo: 'ratio', num: 'consumo_mp', den: 'ingresos' }],
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    assert.strictEqual(simple.ytd.pct_mp.valor, 40)      // (50+30)/2
    assert.strictEqual(ponder.ytd.pct_mp.valor, 32)      // Σ/Σ*100
    assert.notStrictEqual(simple.ytd.pct_mp.valor, ponder.ytd.pct_mp.valor)
  })

  it('mes sin num o den: ese mes se excluye del YTD de ese año', () => {
    // 2025 ene tiene consumo_mp pero sin ingresos → se excluye
    const actual = [
      { anio: 2026, mes: 1, ingresos: 1000, consumo_mp: 400 },
      { anio: 2026, mes: 2, ingresos: 2000, consumo_mp: 800 },
    ]
    const prev = [
      { anio: 2025, mes: 1, consumo_mp: 300 },                      // sin ingresos
      { anio: 2025, mes: 2, ingresos: 1800, consumo_mp: 720 },
    ]
    const r = calcularYoY({
      actual, prev,
      metricas: [{ key: 'pct_mp', tipo: 'ratio', num: 'consumo_mp', den: 'ingresos' }],
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    // actual: (400+800)/(1000+2000)*100 = 1200/3000*100 = 40%
    // prev:   solo mes 2  → 720/1800*100 = 40%
    assert.strictEqual(r.ytd.pct_mp.valor,     40)
    assert.strictEqual(r.ytd.pct_mp.valorPrev, 40)
    assert.strictEqual(r.ytd.pct_mp.delta,     0)
  })

  it('prev sin denominador en NINGÚN mes: valorPrev=null, delta=null', () => {
    const actual = [{ anio: 2026, mes: 1, ingresos: 1000, consumo_mp: 400 }]
    const prev   = [{ anio: 2025, mes: 1, consumo_mp: 300 }]        // sin ingresos
    const r = calcularYoY({
      actual, prev,
      metricas: [{ key: 'pct_mp', tipo: 'ratio', num: 'consumo_mp', den: 'ingresos' }],
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    assert.strictEqual(r.ytd.pct_mp.valor,     40)
    assert.strictEqual(r.ytd.pct_mp.valorPrev, null)
    assert.strictEqual(r.ytd.pct_mp.delta,     null)
  })

  it('escala por defecto = 100; otros valores se respetan', () => {
    // Ratio sin ×100 (ej. ratio 0..1): escala=1
    const actual = [{ anio: 2026, mes: 1, num_: 25, den_: 100 }]
    const prev   = [{ anio: 2025, mes: 1, num_: 20, den_: 100 }]
    const r1 = calcularYoY({
      actual, prev,
      metricas: [{ key: 'ratio_1', tipo: 'ratio', num: 'num_', den: 'den_', escala: 1 }],
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    assert.strictEqual(r1.ytd.ratio_1.valor,     0.25)
    assert.strictEqual(r1.ytd.ratio_1.valorPrev, 0.2)
    assert.strictEqual(r1.ytd.ratio_1.delta,     0.05)
  })

  it('valores por mes siguen siendo el ratio propio del mes (porMes[key][mes])', () => {
    const actual = [{ anio: 2026, mes: 1, pct_mp: 42, ingresos: 1000, consumo_mp: 420 }]
    const prev   = [{ anio: 2025, mes: 1, pct_mp: 40, ingresos: 800,  consumo_mp: 320 }]
    const r = calcularYoY({
      actual, prev,
      metricas: [{ key: 'pct_mp', tipo: 'ratio', num: 'consumo_mp', den: 'ingresos' }],
      mesActualHoy: { anio: 2027, mes: 1 },
    })
    assert.strictEqual(r.porMes.pct_mp[1].valor,     42)   // valor del mes, no ponderado
    assert.strictEqual(r.porMes.pct_mp[1].valorPrev, 40)
    assert.strictEqual(r.porMes.pct_mp[1].delta,     2)
    assert.strictEqual(r.porMes.pct_mp[1].deltaPct,  null)
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
