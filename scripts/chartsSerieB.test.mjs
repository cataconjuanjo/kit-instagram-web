/**
 * Tests PUROS de las utilidades de serieB extraídas de Bars/Line/BarsLine.
 *
 * Los componentes mezclan JSX + hooks → no se pueden importar en node:test
 * sin un runtime de React. Replicamos aquí las funciones puras que
 * conviven dentro de los componentes y las verificamos como contrato
 * compartido: alineación de serieB por número de mes, variación en pp
 * vs %, "—" con prev 0/null, exclusión del mes abierto.
 *
 * Si alguna función se modifica dentro del componente, hay que
 * actualizarla aquí también. Si crece, extraerla a app/components/charts.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ── Replicadas 1:1 de app/components/charts/BarsLine.js y Line.js ───────────

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

/** Tooltip de BarsLine (variación tipo importe → Δ%). */
function buildBarsLineTooltip({ bar, barPrev, formatBar, esComparable, tieneSerieB }) {
  let yoy = ''
  if (tieneSerieB && esComparable) {
    if (barPrev == null) {
      yoy = ' (prev — · Δ —)'
    } else {
      const vp = Number(barPrev)
      if (!Number.isFinite(vp)) yoy = ' (prev — · Δ —)'
      else if (vp === 0) yoy = ` (prev ${formatBar(0)} · Δ —)`
      else {
        const delta = Number(bar) - vp
        const dPct  = delta / Math.abs(vp) * 100
        const sign  = dPct >= 0 ? '+' : ''
        yoy = ` (prev ${formatBar(vp)} · ${sign}${dPct.toFixed(1)}%)`
      }
    }
  }
  return yoy
}

/** Tooltip de Line (importe o ratio=pp). */
function buildLineTooltip({ valor, valorPrev, formatValor, esComparable, tieneSerieB, tipoVariacion }) {
  let yoy = ''
  if (tieneSerieB && esComparable) {
    if (valorPrev == null) {
      yoy = ' (prev — · Δ —)'
    } else {
      const vp = Number(valorPrev)
      if (!Number.isFinite(vp)) yoy = ' (prev — · Δ —)'
      else if (tipoVariacion === 'ratio') {
        const d = valor - vp
        const sign = d >= 0 ? '+' : ''
        yoy = ` (prev ${formatValor(vp)} · ${sign}${d.toFixed(1)} pp)`
      } else if (vp === 0) yoy = ` (prev ${formatValor(0)} · Δ —)`
      else {
        const d    = valor - vp
        const dPct = d / Math.abs(vp) * 100
        const sign = dPct >= 0 ? '+' : ''
        yoy = ` (prev ${formatValor(vp)} · ${sign}${dPct.toFixed(1)}%)`
      }
    }
  }
  return yoy
}

// ── mesNum ──────────────────────────────────────────────────────────────────

describe('mesNum (helper interno Bars/Line/BarsLine)', () => {
  it('extrae de "YYYY-MM"', () => {
    assert.strictEqual(mesNum('2026-01'), 1)
    assert.strictEqual(mesNum('2026-12'), 12)
    assert.strictEqual(mesNum('2025-09'), 9)
  })
  it('string de un solo campo (sin año)', () => {
    assert.strictEqual(mesNum('5'), 5)
  })
  it('inválido → null', () => {
    assert.strictEqual(mesNum(''), null)
    assert.strictEqual(mesNum(null), null)
    assert.strictEqual(mesNum('xx-yy'), null)
  })
})

// ── serieBToMap ─────────────────────────────────────────────────────────────

describe('serieBToMap — alineación por número de mes', () => {
  it('acepta mes como "YYYY-MM"', () => {
    const map = serieBToMap([{ mes: '2025-01', valor: 100 }, { mes: '2025-05', valor: 500 }])
    assert.strictEqual(map.get(1).valor, 100)
    assert.strictEqual(map.get(5).valor, 500)
    assert.strictEqual(map.has(2), false)
  })
  it('acepta mes como número entero 1..12', () => {
    const map = serieBToMap([{ mes: 1, valor: 100 }, { mes: 12, valor: 1200 }])
    assert.strictEqual(map.get(1).valor, 100)
    assert.strictEqual(map.get(12).valor, 1200)
  })
  it('serieB null → map vacío', () => {
    assert.strictEqual(serieBToMap(null).size, 0)
    assert.strictEqual(serieBToMap(undefined).size, 0)
  })
  it('ignora entradas con mes mal formado', () => {
    const map = serieBToMap([
      { mes: 'xxx', valor: 1 },
      { mes: '2025-05', valor: 500 },
      { mes: 13, valor: 999 },     // fuera 1..12 → ignorado
    ])
    assert.strictEqual(map.size, 1)
    assert.strictEqual(map.get(5).valor, 500)
  })
})

// ── Variación en tooltips ───────────────────────────────────────────────────

const fmtEur = v => (Number(v) || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + '€'
const fmtPct = v => (Number(v) || 0).toFixed(1) + ' %'

describe('BarsLine tooltip (importe → Δ%)', () => {
  it('comparable + prev > 0: muestra prev y Δ%', () => {
    const r = buildBarsLineTooltip({ bar: 12000, barPrev: 10000, formatBar: fmtEur, esComparable: true, tieneSerieB: true })
    assert.match(r, /prev 10\.000€/)
    assert.match(r, /\+20\.0%/)
  })
  it('comparable + prev == 0: Δ "—"', () => {
    const r = buildBarsLineTooltip({ bar: 500, barPrev: 0, formatBar: fmtEur, esComparable: true, tieneSerieB: true })
    assert.match(r, /Δ —/)
    assert.ok(!/\d+\.\d%/.test(r))
  })
  it('comparable + prev null: Δ "—"', () => {
    const r = buildBarsLineTooltip({ bar: 500, barPrev: null, formatBar: fmtEur, esComparable: true, tieneSerieB: true })
    assert.match(r, /prev —/)
    assert.match(r, /Δ —/)
  })
  it('mes NO comparable: sin bloque YoY', () => {
    const r = buildBarsLineTooltip({ bar: 500, barPrev: 400, formatBar: fmtEur, esComparable: false, tieneSerieB: true })
    assert.strictEqual(r, '')
  })
  it('sin serieB (modo clásico): sin bloque YoY', () => {
    const r = buildBarsLineTooltip({ bar: 500, barPrev: 400, formatBar: fmtEur, esComparable: true, tieneSerieB: false })
    assert.strictEqual(r, '')
  })
  it('prev negativo preserva signo con |prev|', () => {
    const r = buildBarsLineTooltip({ bar: 10000, barPrev: -20000, formatBar: fmtEur, esComparable: true, tieneSerieB: true })
    // delta=30000, dPct = 30000/20000*100 = +150%
    assert.match(r, /\+150\.0%/)
  })
})

describe('Line tooltip (ratio → pp vs importe → %)', () => {
  it('tipoVariacion ratio: delta en PUNTOS PORCENTUALES', () => {
    const r = buildLineTooltip({ valor: 38.0, valorPrev: 35.5, formatValor: fmtPct, esComparable: true, tieneSerieB: true, tipoVariacion: 'ratio' })
    assert.match(r, /\+2\.5 pp/)
    assert.ok(!/%\)/.test(r.replace('35.5 %', ''))) // no termina con %) en el deltaPct
  })
  it('tipoVariacion importe: delta en %', () => {
    const r = buildLineTooltip({ valor: 12000, valorPrev: 10000, formatValor: fmtEur, esComparable: true, tieneSerieB: true, tipoVariacion: 'importe' })
    assert.match(r, /\+20\.0%/)
  })
  it('mes no comparable: sin bloque', () => {
    const r = buildLineTooltip({ valor: 12000, valorPrev: 10000, formatValor: fmtEur, esComparable: false, tieneSerieB: true, tipoVariacion: 'importe' })
    assert.strictEqual(r, '')
  })
  it('ratio con prev 0: delta en pp funciona (0 es dato real, no null)', () => {
    const r = buildLineTooltip({ valor: 5, valorPrev: 0, formatValor: fmtPct, esComparable: true, tieneSerieB: true, tipoVariacion: 'ratio' })
    assert.match(r, /\+5\.0 pp/)
  })
  it('importe con prev null → "—"', () => {
    const r = buildLineTooltip({ valor: 1200, valorPrev: null, formatValor: fmtEur, esComparable: true, tieneSerieB: true, tipoVariacion: 'importe' })
    assert.match(r, /prev —/)
    assert.match(r, /Δ —/)
  })
})

// ── Exclusión del mes abierto en comparables (regla del server) ─────────────

describe('comparables: mes abierto NO se incluye', () => {
  // Aquí verificamos la convención de la UI: si recibe comparables = [1..9]
  // (del servidor) y el mes abierto es 10, el tooltip del mes 10 no tiene
  // bloque YoY.
  it('mes 10 no está en comparables [1..9] → sin yoy', () => {
    const comparables = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const mes = 10
    const esComparable = comparables.has(mes)
    const r = buildBarsLineTooltip({ bar: 500, barPrev: 400, formatBar: fmtEur, esComparable, tieneSerieB: true })
    assert.strictEqual(esComparable, false)
    assert.strictEqual(r, '')
  })
})
