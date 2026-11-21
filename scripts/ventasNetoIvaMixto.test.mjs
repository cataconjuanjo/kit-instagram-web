/**
 * Fase F-2 — IVA por vino propagado a los TOTALES.
 *
 * `_agruparLineas` ahora expone:
 *   - resumen.ingresos_venta_neto_pl   (suma línea a línea)
 *   - iva_mixto                        (bool)
 *   - canal.botella.ingresos_neto      (per-line, siempre poblado)
 *   - canal.copa.ingresos_neto         (per-line, siempre poblado)
 *
 * `calcularMesBodega` (no testeado aquí — requiere supabase) usa
 * `iva_mixto` para decidir si recalcular `ventas_neto` por línea
 * o mantener la fórmula global.
 *
 * Cubre:
 *   1. Sin iva_pct propio → iva_mixto=false; resumen e ingresos son
 *      idénticos al comportamiento previo.
 *   2. Un vino al 21 %, otros al 10 % global → iva_mixto=true; la
 *      suma por línea refleja ambos IVAs.
 *   3. Todos al 21 % → iva_mixto=true (!=global).
 *   4. Todos al 10 % (= global) explícito → iva_mixto=false.
 *   5. Un vino al 0 % → iva_mixto=true; su neto = su bruto.
 *   6. Invariante de consistencia: Σ por_vino.ingresos_neto de
 *      venta_botella+venta_copa ≈ ventas_neto_pl de botella+copa,
 *      tolerancia de 1 céntimo por línea agregada.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { _agruparLineas } from '../app/lib/agregarPeriodoBodega.js'

const CONFIG = { copas_por_botella: 5, merma_copa_pct: 0, iva_venta_pct: 10 }

function linea({ tipo = 'venta_botella', vino_id, vino, cantidad = 0, copas = 0, precio = 0 }) {
  return { tipo, vino_id, vino, cantidad, copas_vendidas: copas, precio_unitario: precio }
}

describe('iva_mixto — señalización', () => {
  it('sin iva_pct en ningún vino → iva_mixto=false', () => {
    const v = { id: 'A', nombre: 'A', coste_medio_pmp: 5, coste_compra: null }
    const r = _agruparLineas([linea({ vino_id: 'A', vino: v, cantidad: 10, precio: 30 })], CONFIG)
    assert.equal(r.iva_mixto, false)
  })

  it('un vino con iva_pct=10 explícito (= global) → iva_mixto=false', () => {
    const v = { id: 'A', nombre: 'A', coste_medio_pmp: 5, coste_compra: null, iva_pct: 10 }
    const r = _agruparLineas([linea({ vino_id: 'A', vino: v, cantidad: 10, precio: 30 })], CONFIG)
    assert.equal(r.iva_mixto, false)
  })

  it('un vino con iva_pct=21 → iva_mixto=true', () => {
    const v = { id: 'A', nombre: 'A', coste_medio_pmp: 5, coste_compra: null, iva_pct: 21 }
    const r = _agruparLineas([linea({ vino_id: 'A', vino: v, cantidad: 10, precio: 30 })], CONFIG)
    assert.equal(r.iva_mixto, true)
  })

  it('un vino con iva_pct=0 → iva_mixto=true (distinto del global 10)', () => {
    const v = { id: 'A', nombre: 'A', coste_medio_pmp: 5, coste_compra: null, iva_pct: 0 }
    const r = _agruparLineas([linea({ vino_id: 'A', vino: v, cantidad: 10, precio: 30 })], CONFIG)
    assert.equal(r.iva_mixto, true)
  })

  it('iva_pct propio pero solo en invitaciones/rotura NO activa iva_mixto (no es venta)', () => {
    const v = { id: 'A', nombre: 'A', coste_medio_pmp: 5, coste_compra: null, iva_pct: 21 }
    const r = _agruparLineas([
      linea({ tipo: 'invitacion_botella', vino_id: 'A', vino: v, cantidad: 1 }),
      linea({ tipo: 'rotura',             vino_id: 'A', vino: v, cantidad: 1 }),
    ], CONFIG)
    assert.equal(r.iva_mixto, false,
      'iva_pct distinto solo cuenta si hay líneas de venta_*')
  })
})

describe('ventas neto per-line (ingresos_venta_neto_pl)', () => {
  it('sin IVA mixto: pl ≈ bruto/(1+global/100)', () => {
    // 10 bot × 30 = 300 bruto; neto global = 300/1.10 = 272.73
    const v = { id: 'A', nombre: 'A', coste_medio_pmp: 5, coste_compra: null }
    const r = _agruparLineas([linea({ vino_id: 'A', vino: v, cantidad: 10, precio: 30 })], CONFIG)
    assert.equal(r.resumen.ingresos_venta, 300)
    assert.equal(r.resumen.ingresos_venta_neto_pl, 272.73)
    assert.equal(r.iva_mixto, false)
  })

  it('con IVA mixto: la suma refleja los IVAs distintos', () => {
    // Rioja 10 bot × 30 = 300 bruto → 10 % → 272.73 neto
    // Cava  5 bot × 40 = 200 bruto → 21 % → 165.29 neto
    const vinoRio  = { id: 'R', nombre: 'Rioja', coste_medio_pmp: 10, coste_compra: null }
    const vinoCava = { id: 'C', nombre: 'Cava',  coste_medio_pmp: 10, coste_compra: null, iva_pct: 21 }
    const r = _agruparLineas([
      linea({ vino_id: 'R', vino: vinoRio,  cantidad: 10, precio: 30 }),
      linea({ vino_id: 'C', vino: vinoCava, cantidad:  5, precio: 40 }),
    ], CONFIG)
    assert.equal(r.resumen.ingresos_venta, 500)
    // 272.73 + 165.29 = 438.02
    assert.equal(r.resumen.ingresos_venta_neto_pl, 438.02)
    assert.equal(r.iva_mixto, true)
  })

  it('TODOS al 21 %: iva_mixto=true y neto per-line = bruto/1.21', () => {
    const v1 = { id: 'A', nombre: 'A', coste_medio_pmp: 5, coste_compra: null, iva_pct: 21 }
    const v2 = { id: 'B', nombre: 'B', coste_medio_pmp: 5, coste_compra: null, iva_pct: 21 }
    const r = _agruparLineas([
      linea({ vino_id: 'A', vino: v1, cantidad: 10, precio: 30 }),  // 300 bruto
      linea({ vino_id: 'B', vino: v2, cantidad:  5, precio: 40 }),  // 200 bruto
    ], CONFIG)
    assert.equal(r.iva_mixto, true)
    // (300 + 200) / 1.21 = 413.22 (aprox); pero per-line: 300/1.21=247.93 + 200/1.21=165.29 = 413.22
    assert.equal(r.resumen.ingresos_venta_neto_pl, 413.22)
  })

  it('un vino al 0 %: su línea neta = bruta (sin IVA)', () => {
    const vFree = { id: 'F', nombre: 'Exento', coste_medio_pmp: 5, coste_compra: null, iva_pct: 0 }
    const r = _agruparLineas([linea({ vino_id: 'F', vino: vFree, cantidad: 10, precio: 30 })], CONFIG)
    assert.equal(r.resumen.ingresos_venta, 300)
    assert.equal(r.resumen.ingresos_venta_neto_pl, 300)   // 0 % → neto = bruto
    assert.equal(r.iva_mixto, true)
  })
})

describe('canal.botella.ingresos_neto y canal.copa.ingresos_neto', () => {
  it('siempre poblados, consistentes con per-line', () => {
    const vRio  = { id: 'R', nombre: 'Rioja', coste_medio_pmp: 10, coste_compra: null }
    const vCava = { id: 'C', nombre: 'Cava',  coste_medio_pmp: 10, coste_compra: null, iva_pct: 21 }
    const r = _agruparLineas([
      linea({ tipo: 'venta_botella', vino_id: 'R', vino: vRio,  cantidad: 10, precio: 30 }),
      linea({ tipo: 'venta_copa',    vino_id: 'R', vino: vRio,  copas: 20, precio: 5 }),
      linea({ tipo: 'venta_botella', vino_id: 'C', vino: vCava, cantidad:  5, precio: 40 }),
    ], CONFIG)
    // canal.botella: 10×30 (10 %) + 5×40 (21 %) = 300→272.73 + 200→165.29 = 438.02
    assert.equal(r.por_canal.botella.ingresos, 500)
    assert.equal(r.por_canal.botella.ingresos_neto, 438.02)
    // canal.copa: 20 copas × 5 € (10 %) = 100 → 90.91
    assert.equal(r.por_canal.copa.ingresos, 100)
    assert.equal(r.por_canal.copa.ingresos_neto, 90.91)
  })

  it('invariante de consistencia: Σ por_vino.ingresos_neto (ventas) ≈ Σ canal.{bot,copa}.ingresos_neto', () => {
    const vRio  = { id: 'R', nombre: 'Rioja', coste_medio_pmp: 10, coste_compra: null }
    const vCava = { id: 'C', nombre: 'Cava',  coste_medio_pmp: 10, coste_compra: null, iva_pct: 21 }
    const r = _agruparLineas([
      linea({ tipo: 'venta_botella', vino_id: 'R', vino: vRio,  cantidad: 10, precio: 30 }),
      linea({ tipo: 'venta_copa',    vino_id: 'R', vino: vRio,  copas: 20, precio: 5 }),
      linea({ tipo: 'venta_botella', vino_id: 'C', vino: vCava, cantidad: 5,  precio: 40 }),
    ], CONFIG)
    const totalVino = r.por_vino.reduce((s, v) => s + (v.ingresos_neto || 0), 0)
    const totalCanal = r.por_canal.botella.ingresos_neto + r.por_canal.copa.ingresos_neto
    // Tolerancia 1 céntimo por línea agregada (3 líneas → 3 ct).
    assert.ok(Math.abs(totalVino - totalCanal) < 0.03,
      `discrepancia por_vino (${totalVino}) vs canal (${totalCanal})`)
  })
})

// ── INVARIANCIA BIT-IDÉNTICA: nada cambia sin IVA mixto ──────────────

describe('invariancia — sin iva_pct propio, cifras BIT-IDÉNTICAS a Fase F-1', () => {
  // Fixture replica de scripts/porVinoEnriquecido.test.mjs:
  function lineasFase1() {
    const A = { id: 'A', nombre: 'Rioja',    coste_medio_pmp: 10, coste_compra: null }
    const B = { id: 'B', nombre: 'Albariño', coste_medio_pmp:  8, coste_compra: null }
    return [
      linea({ tipo: 'venta_botella', vino_id: 'A', vino: A, cantidad: 10, precio: 30 }),
      linea({ tipo: 'venta_copa',    vino_id: 'A', vino: A, copas: 20, precio: 5 }),
      linea({ tipo: 'venta_botella', vino_id: 'B', vino: B, cantidad: 5,  precio: 40 }),
    ]
  }
  const r = _agruparLineas(lineasFase1(), CONFIG)

  it('resumen.ingresos_venta = 600 (10×30 + 20×5 + 5×40)', () => {
    assert.equal(r.resumen.ingresos_venta, 600)
  })
  it('iva_mixto = false', () => {
    assert.equal(r.iva_mixto, false)
  })
  it('por_canal.botella.ingresos = 500 (bruto, tal cual antes)', () => {
    assert.equal(r.por_canal.botella.ingresos, 500)
  })
  it('por_canal.copa.ingresos = 100 (bruto, tal cual antes)', () => {
    assert.equal(r.por_canal.copa.ingresos, 100)
  })
  it('por_canal.botella.coste = 140 (bruto en coste, fase D intacto)', () => {
    // 10 × 10 + 5 × 8 = 140
    assert.equal(r.por_canal.botella.coste, 140)
  })
})
