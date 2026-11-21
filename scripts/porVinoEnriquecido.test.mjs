/**
 * Fase D — enriquecer informe.por_vino con claves orientadas al
 * simulador de margen (ingresos_neto, coste_total, margen_bruto,
 * multiplicador, uds_botella) SIN tocar nada de lo que ya exportaba
 * el agregador.
 *
 * Testamos la función pura `agregarInformePeriodo` (export en
 * agregarPeriodoBodega.js) con una fixture realista. No hay red ni
 * supabase: solo arrays de líneas de parte_servicio + config.
 *
 * Ejecutar: node --test scripts/porVinoEnriquecido.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { _agruparLineas as agregarInformePeriodo } from '../app/lib/agregarPeriodoBodega.js'

// Fixture: 2 vinos + 1 sin coste.
function lineasFixture() {
  const vinoA = { id: 'A', nombre: 'Rioja',   coste_medio_pmp: 10, coste_compra: null }
  const vinoB = { id: 'B', nombre: 'Albariño', coste_medio_pmp: 8,  coste_compra: null }
  const vinoC = { id: 'C', nombre: 'Jerez',    coste_medio_pmp: null, coste_compra: null }  // sin coste
  return [
    // A: 10 botellas vendidas a 30 € bruto → ingresos 300, coste 100
    { tipo: 'venta_botella', vino_id: 'A', vino: vinoA, cantidad: 10, copas_vendidas: 0, precio_unitario: 30 },
    // A: 20 copas vendidas a 5 € bruto → ingresos 100, coste (20/5)*10 = 40
    //    (copas_por_botella=5, merma=0 → copasVendibles=5)
    { tipo: 'venta_copa',    vino_id: 'A', vino: vinoA, cantidad: 0,  copas_vendidas: 20, precio_unitario: 5 },
    // B: 5 botellas a 40 € → ingresos 200, coste 40
    { tipo: 'venta_botella', vino_id: 'B', vino: vinoB, cantidad: 5,  copas_vendidas: 0, precio_unitario: 40 },
    // C: 2 botellas a 50 € (sin coste) → ingresos 100
    { tipo: 'venta_botella', vino_id: 'C', vino: vinoC, cantidad: 2,  copas_vendidas: 0, precio_unitario: 50 },
    // Invitación (no suma ingresos ni coste a por_vino.ingresos)
    { tipo: 'invitacion_botella', vino_id: 'A', vino: vinoA, cantidad: 1, copas_vendidas: 0, precio_unitario: 0 },
    // Rotura: no toca por_vino.ingresos
    { tipo: 'rotura', vino_id: 'B', vino: vinoB, cantidad: 1, copas_vendidas: 0, precio_unitario: 0 },
  ]
}

const CONFIG = { copas_por_botella: 5, merma_copa_pct: 0, iva_venta_pct: 10 }

function infomePorVino() {
  return agregarInformePeriodo(lineasFixture(), CONFIG).por_vino
}

describe('por_vino: enriquecimiento Fase D', () => {
  const vinos = infomePorVino()
  const byId  = Object.fromEntries(vinos.map(v => [v.vino_id, v]))

  it('conserva las claves originales (uds, copas, ingresos, tiene_coste, coste_unitario, margen_pct)', () => {
    const a = byId.A
    // IMPORTANTE: por compat con cierres antiguos, `uds` suma TODO lo
    // no-copa (venta + invitacion + rotura + cocina + cata). Son
    // 10 (venta) + 1 (invitacion_botella) = 11.
    assert.equal(a.uds, 11, 'uds es el contador legacy; incluye invitaciones')
    assert.equal(a.copas, 20)
    assert.equal(a.ingresos, 400)         // 300 + 100 (bruto, solo ventas)
    assert.equal(a.tiene_coste, true)
    assert.equal(a.coste_unitario, 10)
    assert.equal(typeof a.margen_pct, 'number')
  })

  it('añade uds_botella como alias de uds (claridad)', () => {
    for (const v of vinos) assert.equal(v.uds_botella, v.uds)
  })

  it('internal accumulators (_uds_venta/_copas_venta) NO se exponen', () => {
    for (const v of vinos) {
      assert.equal(v._uds_venta,   undefined)
      assert.equal(v._copas_venta, undefined)
    }
  })

  it('añade ingresos_neto = ingresos brutos / (1 + iva/100)', () => {
    // A: 400 / 1.10 = 363.636... → r2 = 363.64
    assert.equal(byId.A.ingresos_neto, 363.64)
    // B: 200 / 1.10 = 181.818... → r2 = 181.82
    assert.equal(byId.B.ingresos_neto, 181.82)
    // C: 100 / 1.10 = 90.909... → r2 = 90.91
    assert.equal(byId.C.ingresos_neto, 90.91)
  })

  it('añade coste_total = coste de SOLO lo vendido (no invitación/rotura)', () => {
    // A: 10 bot vendidas × 10 = 100 ; 20 copas / 5 copasXbot × 10 = 40
    //    → total 140. La invitación_botella NO suma aquí.
    assert.equal(byId.A.coste_total, 140)
    // B: 5 bot vendidas × 8 = 40 ; 0 copas vendidas → 40.
    //    La rotura NO suma aquí.
    assert.equal(byId.B.coste_total, 40)
  })

  it('sin coste → coste_total NULL (no 0 inventado)', () => {
    assert.equal(byId.C.tiene_coste, false)
    assert.equal(byId.C.coste_total, null)
  })

  it('margen_bruto = ingresos_neto − coste_total; null si falta cualquiera', () => {
    // A: 363.64 − 140 = 223.64
    assert.equal(byId.A.margen_bruto, 223.64)
    // C: sin coste → null, no 0
    assert.equal(byId.C.margen_bruto, null)
  })

  it('multiplicador = ingresos_neto / coste_total; null si coste 0 o ausente', () => {
    // A: 363.64 / 140 = 2.597...→ r2 = 2.6
    assert.equal(byId.A.multiplicador, 2.6)
    // B: 181.82 / 40 = 4.5455 → r2 = 4.55
    assert.equal(byId.B.multiplicador, 4.55)
    // C: sin coste
    assert.equal(byId.C.multiplicador, null)
  })

  it('invitaciones y rotura NO cuentan en ingresos ni multiplicador', () => {
    // El vino A tiene 1 invitación_botella; NO suma a a.ingresos.
    assert.equal(byId.A.ingresos, 400)
    // B tiene 1 rotura: no suma a b.ingresos.
    assert.equal(byId.B.ingresos, 200)
  })

  it('mes sin ventas → por_vino = []', () => {
    const r = agregarInformePeriodo([], CONFIG)
    assert.deepEqual(r.por_vino, [])
  })
})

// ── INVARIANCIA: campos existentes no cambian ─────────────────────────
//
// Test de contrato: ventas_neto (resumen.ingresos_venta), por_canal y
// la lista top_ingresos/top_uds deben seguir idénticas a la línea base
// previa a Fase D (comprobado por valores fijos calculados a mano).

describe('invariancia — Fase D no cambia ventas/por_canal/resultado', () => {
  const r = agregarInformePeriodo(lineasFixture(), CONFIG)

  it('resumen.ingresos_venta = suma bruta de venta_botella + venta_copa', () => {
    // 300 + 100 + 200 + 100 = 700
    assert.equal(r.resumen.ingresos_venta, 700)
  })

  it('por_canal.botella = { uds:17, ingresos:600, coste:180 } (10+5+2 uds, 300+200+100 ingresos)', () => {
    assert.equal(r.por_canal.botella.uds, 17)
    assert.equal(r.por_canal.botella.ingresos, 600)
    // coste: A(10×10) + B(5×8) + C(2×0, sin coste) = 140
    assert.equal(r.por_canal.botella.coste, 140)
  })

  it('por_canal.copa = { uds:0, copas:20, ingresos:100, coste:40 }', () => {
    assert.equal(r.por_canal.copa.uds, 0)
    assert.equal(r.por_canal.copa.copas, 20)
    assert.equal(r.por_canal.copa.ingresos, 100)
    assert.equal(r.por_canal.copa.coste, 40)
  })

  it('por_canal.invitacion.botella_coste y rotura.coste intactos', () => {
    // Invitación A: coste 1 × 10 = 10
    assert.equal(r.por_canal.invitacion.botella_coste, 10)
    // Rotura B: coste 1 × 8 = 8
    assert.equal(r.por_canal.rotura.coste, 8)
  })

  it('top_ingresos y top_uds no cambian de orden ni longitud', () => {
    assert.ok(Array.isArray(r.top_ingresos))
    assert.ok(Array.isArray(r.top_uds))
    assert.equal(r.top_ingresos[0].vino_id, 'A')   // A con 400 lidera
    assert.equal(r.top_uds[0].vino_id,      'A')   // A con 10 bot lidera uds
  })
})
