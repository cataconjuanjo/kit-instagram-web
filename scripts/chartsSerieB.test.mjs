/**
 * Tests PUROS de las utilidades de serieB extraídas de Bars/Line/BarsLine.
 *
 * `buildTooltip` (BarsLine) y `buildLineTooltip` (Line) se exportan desde
 * los componentes para test; `mesNum`, `serieBToMap` son réplicas 1:1
 * sincronizadas con los helpers internos. `barrasAgrupadas` se importa
 * del módulo puro geometria.js.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildBarsLineTooltip, buildLineTooltip }
  from '../app/components/charts/tooltips.js'
import { barrasAgrupadas }  from '../app/components/charts/geometria.js'
// Alias local para no reescribir los asserts
const buildTooltip = buildBarsLineTooltip

// ── Réplicas (mesNum / serieBToMap): sincronizadas con los componentes ─────

function mesNum(mesStr) {
  if (mesStr == null) return null
  const str = String(mesStr)
  const parts = str.split('-')
  const token = parts.length > 1 ? parts[1] : parts[0]
  if (token == null || token === '' || !/^\d+$/.test(token)) return null
  const n = Number(token)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null
}

function serieBToMap(serieB) {
  const m = new Map()
  if (!serieB) return m
  for (const s of serieB) {
    const raw = s.mes
    let k = null
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 12) k = raw
    else if (typeof raw === 'string') {
      const parts = raw.split('-')
      const n = Number(parts.length > 1 ? parts[1] : parts[0])
      if (Number.isInteger(n) && n >= 1 && n <= 12) k = n
    }
    if (k != null) m.set(k, s)
  }
  return m
}

// ── Formateadores ──────────────────────────────────────────────────────────

const fmtEur = v => (Number(v) || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + ' €'
const fmtPct = v => (Number(v) || 0).toFixed(1) + ' %'

// ── mesNum ─────────────────────────────────────────────────────────────────

describe('mesNum (réplica Bars/Line)', () => {
  it('extrae de "YYYY-MM"', () => {
    assert.strictEqual(mesNum('2026-01'), 1)
    assert.strictEqual(mesNum('2026-12'), 12)
    assert.strictEqual(mesNum('2025-09'), 9)
  })
  it('inválido o fuera de rango → null', () => {
    assert.strictEqual(mesNum(''), null)
    assert.strictEqual(mesNum(null), null)
    assert.strictEqual(mesNum('xx-yy'), null)
    assert.strictEqual(mesNum('2026-13'), null)
  })
})

// ── serieBToMap ────────────────────────────────────────────────────────────

describe('serieBToMap', () => {
  it('alineación por nº mes', () => {
    const map = serieBToMap([{ mes: '2025-01', valor: 100 }, { mes: '2025-05', valor: 500 }])
    assert.strictEqual(map.get(1).valor, 100)
    assert.strictEqual(map.get(5).valor, 500)
    assert.strictEqual(map.has(2), false)
  })
  it('ignora inválidos y fuera 1..12', () => {
    const map = serieBToMap([
      { mes: 'xxx', valor: 1 },
      { mes: '2025-05', valor: 500 },
      { mes: 13, valor: 999 },
    ])
    assert.strictEqual(map.size, 1)
  })
})

// ── barrasAgrupadas ────────────────────────────────────────────────────────

describe('barrasAgrupadas — geometría', () => {
  it('sin serieB: barra única centrada (~55% colW)', () => {
    const r = barrasAgrupadas({ colW: 100, hasSerieB: false })
    assert.strictEqual(r.barW,  55)         // 100 * 0.55
    assert.strictEqual(r.xActual, 22.5)      // (100 - 55) / 2
    assert.strictEqual(r.xPrev, null)
  })

  it('con serieB: dos barras side-by-side ~42% colW + gap central ~4%', () => {
    const r = barrasAgrupadas({ colW: 100, hasSerieB: true })
    assert.strictEqual(r.barW,  42)          // 100 * 0.42
    assert.strictEqual(r.xPrev,  6)          // (100 - (42+4+42)) / 2 = 6
    assert.strictEqual(r.xActual, 52)         // 6 + 42 + 4
    // Prev siempre a la IZQUIERDA, actual a la DERECHA
    assert.ok(r.xPrev < r.xActual, 'prev debe ir antes que actual')
    // Las dos barras no se solapan
    assert.ok(r.xPrev + r.barW <= r.xActual, 'no overlap')
    // Padding simétrico a los lados
    const padIzq = r.xPrev
    const padDer = 100 - (r.xActual + r.barW)
    assert.strictEqual(padIzq, padDer)
  })

  it('ancho mínimo de barra: 4 px cuando colW es muy pequeña', () => {
    // Sin serieB: colW=5 → 5*0.55=2.75 → min 4
    const r1 = barrasAgrupadas({ colW: 5, hasSerieB: false })
    assert.strictEqual(r1.barW, 4)
    // Con serieB: colW=5 → 5*0.42=2.1 → min 4
    const r2 = barrasAgrupadas({ colW: 5, hasSerieB: true })
    assert.strictEqual(r2.barW, 4)
    // Con colW=9 también aplica min (9*0.42=3.78 → 4)
    const r3 = barrasAgrupadas({ colW: 9, hasSerieB: true })
    assert.strictEqual(r3.barW, 4)
  })

  it('gap mínimo central: >= 1 px siempre', () => {
    // Varios tamaños: en todos el gap entre barras es al menos 1 px
    for (const colW of [8, 10, 20, 50, 100]) {
      const r = barrasAgrupadas({ colW, hasSerieB: true })
      const gap = r.xActual - (r.xPrev + r.barW)
      assert.ok(gap >= 1, `gap ${gap} < 1 para colW=${colW}`)
    }
  })

  it('colW grande (p.ej. 50 px/mes, 12 meses y chart 600 px) → barW ≈ 21', () => {
    const r = barrasAgrupadas({ colW: 50, hasSerieB: true })
    assert.strictEqual(r.barW, 21)           // 50 * 0.42
    assert.strictEqual(r.xPrev, 3)           // (50 - (21+2+21))/2 = 3
    assert.strictEqual(r.xActual, 26)        // 3 + 21 + 2
  })
})

// ── Tooltip de BarsLine (nuevo formato con etiquetas) ──────────────────────

describe('buildTooltip (BarsLine) — formato con etiquetas', () => {
  it('sin serieB: formato clásico "Mar: 10.653 € · 22.510 €"', () => {
    const r = buildTooltip({
      mes: '2026-03', bar: 10653, linea: 22510,
      formatBar: fmtEur, formatLine: fmtEur,
      estimado: false, esComparable: false, tieneSerieB: false,
    })
    assert.match(r, /Mar: 10\.653 € · 22\.510 €/)
    assert.ok(!/Ventas /.test(r),   'sin serieB NO lleva etiqueta "Ventas"')
    assert.ok(!/Resultado /.test(r), 'sin serieB NO lleva etiqueta "Resultado"')
  })

  it('con serieB + comparable: "Mar: Ventas X (2025: Y, +Δ%) · Resultado Z (2025: W)"', () => {
    const r = buildTooltip({
      mes: '2026-03', bar: 100653, linea: 22510,
      barPrev: 90543, lineaPrev: 19290,
      formatBar: fmtEur, formatLine: fmtEur,
      estimado: false, esComparable: true, tieneSerieB: true,
      anioPrevLabel: '2025',
    })
    assert.match(r, /Mar: Ventas 100\.653 €/)
    assert.match(r, /\(2025: 90\.543 €, \+11\.2 %\)/)
    assert.match(r, /· Resultado 22\.510 €/)
    assert.match(r, /\(2025: 19\.290 €\)/)
  })

  it('con serieB NO comparable (mes abierto): muestra prev sin Δ%', () => {
    const r = buildTooltip({
      mes: '2026-10', bar: 50000, linea: null,
      barPrev: 48000, lineaPrev: null,
      formatBar: fmtEur, formatLine: fmtEur,
      estimado: true, esComparable: false, tieneSerieB: true,
      anioPrevLabel: '2025',
    })
    assert.match(r, /Oct: Ventas 50\.000 €/)
    assert.match(r, /\(2025: 48\.000 €\)/)
    assert.ok(!/\+?\d+\.\d+ %\)/.test(r), 'no Δ% si no es comparable')
    assert.match(r, /\(estimado\)/)
  })

  it('con serieB + comparable + prev == 0: Δ "—"', () => {
    const r = buildTooltip({
      mes: '2026-01', bar: 500, barPrev: 0, linea: null,
      formatBar: fmtEur, formatLine: fmtEur,
      estimado: false, esComparable: true, tieneSerieB: true,
      anioPrevLabel: '2025',
    })
    assert.match(r, /\(2025: 0 €, Δ —\)/)
  })

  it('con serieB + comparable + prev null: no se muestra bloque prev', () => {
    const r = buildTooltip({
      mes: '2026-01', bar: 500, barPrev: null, linea: null,
      formatBar: fmtEur, formatLine: fmtEur,
      estimado: false, esComparable: true, tieneSerieB: true,
      anioPrevLabel: '2025',
    })
    // No incluye "(2025: …)" porque prev es null
    assert.ok(!/\(2025:/.test(r))
    assert.match(r, /Mar|Ene|Feb/)    // sanity
  })

  it('prev negativo preserva signo con |prev|', () => {
    const r = buildTooltip({
      mes: '2026-01', bar: 100, barPrev: -200, linea: null,
      formatBar: fmtEur, formatLine: fmtEur,
      estimado: false, esComparable: true, tieneSerieB: true,
      anioPrevLabel: '2025',
    })
    // delta=300, dPct = 300/200*100 = +150.0 %
    assert.match(r, /\+150\.0 %/)
  })

  it('añade " YYYY" al mes solo si es enero', () => {
    const rEne = buildTooltip({
      mes: '2026-01', bar: 1000, linea: null,
      formatBar: fmtEur, formatLine: fmtEur,
      estimado: false, esComparable: false, tieneSerieB: false,
    })
    const rFeb = buildTooltip({
      mes: '2026-02', bar: 1000, linea: null,
      formatBar: fmtEur, formatLine: fmtEur,
      estimado: false, esComparable: false, tieneSerieB: false,
    })
    assert.match(rEne, /Ene 2026:/)
    assert.match(rFeb, /^Feb: /)
  })
})

// ── Tooltip de Line (nuevo formato "Mar: 37,7 % (2025: 37,6 %, +0,1 pp)") ──

describe('buildLineTooltip (Line) — formato con etiquetas', () => {
  it('sin serieB: "Mar: 37,7 %"', () => {
    const r = buildLineTooltip({
      mes: '2026-03', valor: 37.7, formatValor: fmtPct,
      estimado: false, esComparable: false, tieneSerieB: false,
      tipoVariacion: 'ratio',
    })
    assert.match(r, /Mar: 37\.7 %/)
    assert.ok(!/\(2025:/.test(r))
  })

  it('ratio comparable: "(2025: 37,6 %, +0,1 pp)"', () => {
    const r = buildLineTooltip({
      mes: '2026-03', valor: 37.7, valorPrev: 37.6,
      formatValor: fmtPct, estimado: false, esComparable: true,
      tieneSerieB: true, tipoVariacion: 'ratio', anioPrevLabel: '2025',
    })
    assert.match(r, /Mar: 37\.7 %/)
    assert.match(r, /\(2025: 37\.6 %, \+0\.1 pp\)/)
  })

  it('importe comparable: Δ en %', () => {
    const r = buildLineTooltip({
      mes: '2026-03', valor: 12000, valorPrev: 10000,
      formatValor: fmtEur, estimado: false, esComparable: true,
      tieneSerieB: true, tipoVariacion: 'importe', anioPrevLabel: '2025',
    })
    assert.match(r, /\(2025: 10\.000 €, \+20\.0 %\)/)
  })

  it('no comparable con prev: muestra prev sin Δ', () => {
    const r = buildLineTooltip({
      mes: '2026-10', valor: 37.5, valorPrev: 37.8,
      formatValor: fmtPct, estimado: true, esComparable: false,
      tieneSerieB: true, tipoVariacion: 'ratio', anioPrevLabel: '2025',
    })
    assert.match(r, /\(2025: 37\.8 %\)/)
    assert.ok(!/pp\)/.test(r))
    assert.match(r, /\(estimado\)/)
  })

  it('prev null: no muestra bloque prev', () => {
    const r = buildLineTooltip({
      mes: '2026-03', valor: 37.7, valorPrev: null,
      formatValor: fmtPct, estimado: false, esComparable: true,
      tieneSerieB: true, tipoVariacion: 'ratio', anioPrevLabel: '2025',
    })
    assert.ok(!/\(2025:/.test(r))
  })

  it('ratio con prev 0: delta en pp funciona (0 es dato real)', () => {
    const r = buildLineTooltip({
      mes: '2026-03', valor: 5, valorPrev: 0,
      formatValor: fmtPct, estimado: false, esComparable: true,
      tieneSerieB: true, tipoVariacion: 'ratio', anioPrevLabel: '2025',
    })
    assert.match(r, /\+5\.0 pp/)
  })

  it('importe con prev 0: Δ "—"', () => {
    const r = buildLineTooltip({
      mes: '2026-03', valor: 1000, valorPrev: 0,
      formatValor: fmtEur, estimado: false, esComparable: true,
      tieneSerieB: true, tipoVariacion: 'importe', anioPrevLabel: '2025',
    })
    assert.match(r, /Δ —/)
  })

  it('sin anioPrevLabel usa fallback "ant."', () => {
    const r = buildLineTooltip({
      mes: '2026-03', valor: 37.7, valorPrev: 37.6,
      formatValor: fmtPct, estimado: false, esComparable: true,
      tieneSerieB: true, tipoVariacion: 'ratio',
    })
    assert.match(r, /\(ant\.: /)
  })
})

// ── Exclusión del mes abierto en comparables ───────────────────────────────

describe('comparables: mes abierto NO se incluye', () => {
  it('mes 10 ∉ [1..9] → BarsLine tooltip sin Δ%', () => {
    const r = buildTooltip({
      mes: '2026-10', bar: 5000, barPrev: 4800, linea: null,
      formatBar: fmtEur, formatLine: fmtEur,
      estimado: true, esComparable: false, tieneSerieB: true,
      anioPrevLabel: '2025',
    })
    assert.ok(!/\+?\d+\.\d+ %\)/.test(r))
  })
  it('mes 10 ∉ [1..9] → Line tooltip sin pp', () => {
    const r = buildLineTooltip({
      mes: '2026-10', valor: 37.5, valorPrev: 37.8,
      formatValor: fmtPct, estimado: true, esComparable: false,
      tieneSerieB: true, tipoVariacion: 'ratio', anioPrevLabel: '2025',
    })
    assert.ok(!/pp\)/.test(r))
  })
})
