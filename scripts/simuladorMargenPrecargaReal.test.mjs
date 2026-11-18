/**
 * Fase C-2 — precarga con snapshot real + sello de periodo.
 *
 *   1. La precarga + comparación usan la shape EXACTA del agregador
 *      (`por_canal` con `invitacion {botella_coste, copa_coste}`, rotura,
 *      cocina, cata; `resumen.ventas_neto` y `coste_ventas_teorico`).
 *   2. Si falta el snapshot (p. ej. mes sin cierre y sin partes),
 *      roturas/ventas/margen real salen null → la UI muestra
 *      "Sin dato", nunca 0.
 *   3. `datosParaPeriodo` (ya probado en canalesSalidas) descarta
 *      cualquier cache que no coincida con el periodo pedido — la
 *      base del sello de periodo que evita mezclar datos de meses.
 *
 * Ejecutar: node --test scripts/simuladorMargenPrecargaReal.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularSimuladorMargen,
  compararConReal,
  precargarDesdeSnapshot,
} from '../app/lib/simuladorMargen.js'
import { datosParaPeriodo } from '../app/lib/canalesSalidas.js'

// Snapshot "realista" tal cual sale de calcularMesBodega / cierres-mes.
function snapshotCasaMarisma() {
  return {
    periodo: '2026-10',
    resumen: {
      ventas_neto:          4768.18,
      coste_ventas_teorico: 1560,
      ingresos_venta:       5245,     // bruto; no lo usamos aquí
    },
    por_canal: {
      botella:    { uds: 60, ingresos: 3245, coste: 980 },
      copa:       { uds: 0, copas: 420, ingresos: 2000, coste: 580 },
      invitacion: { uds: 0, botella_uds: 2, copa_uds: 10, botella_coste: 60, copa_coste: 30 },
      cocina:     { uds: 1, coste: 25 },
      cata:       { uds: 2, coste: 90 },
      rotura:     { uds: 1, coste: 45 },
    },
  }
}

describe('precarga real con snapshot de cierres-mes', () => {
  it('cablea roturas+invitaciones+cocina+cata desde por_canal', () => {
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes: snapshotCasaMarisma(),
      parametros: {
        total_personal: 3000, total_alquiler: 800,
        imputacion_pct: { personal: 100, alquileres: 100 },
      },
    })
    // 45 (rotura) + 60 (inv botella) + 30 (inv copa) + 25 (cocina) + 90 (cata) = 250
    assert.equal(valores.roturas_invitaciones, 250)
    assert.match(origen.roturas_invitaciones, /rotura\+invitacion\+cocina\+cata/)
    assert.match(origen.roturas_invitaciones, /2026-10/)
  })

  it('ventas_previstas = ventas_neto del mes', () => {
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes: snapshotCasaMarisma(),
      parametros: null,
    })
    assert.equal(valores.ventas_previstas, 4768.18)
    assert.match(origen.ventas_previstas, /ventas_neto/)
  })

  it('personal y alquiler aplican imputación a bodega', () => {
    const { valores } = precargarDesdeSnapshot({
      snapshotMes: snapshotCasaMarisma(),
      parametros: {
        total_personal: 6000, total_alquiler: 1600,
        imputacion_pct: { personal: 50, alquileres: 50 },
      },
    })
    assert.equal(valores.personal, 3000)
    assert.equal(valores.alquiler, 800)
  })

  it('comparación con la realidad: margen bruto real y % materia prima real', () => {
    const snap = snapshotCasaMarisma()
    const sim = calcularSimuladorMargen({
      gastos: {
        personal: 3000, alquiler: 800, roturas_invitaciones: 250,
        materiales: 20, suministros: 40, otros: 0,
      },
      beneficio_objetivo: 500,
      ventas_previstas:   4768.18,
    })
    const cmp = compararConReal({ simulacion: sim, snapshotMes: snap })
    // margen = 4768.18 − 1560 = 3208.18
    assert.equal(cmp.margen_bruto_real, 3208.18)
    // %MP = 1560 / 4768.18 ≈ 32.72
    assert.equal(cmp.pct_materia_prima_real, 32.72)
    // cmp.diferencia_vs_minimo debe estar definida
    assert.ok(cmp.diferencia_vs_minimo !== null)
    // cubre = margen_real (3208.18) ≥ margen_necesario (sim.margen_bruto_necesario)
    assert.equal(cmp.diferencia_vs_minimo.cubre,
      cmp.margen_bruto_real >= sim.margen_bruto_necesario)
  })
})

describe('sin snapshot del mes → Sin dato, nunca 0', () => {
  it('si snapshotMes es null, roturas_invitaciones queda null y origen = manual', () => {
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes: null,
      parametros: null,
    })
    assert.equal(valores.roturas_invitaciones, null)
    assert.equal(valores.ventas_previstas, null)
    assert.equal(origen.roturas_invitaciones, 'manual')
    assert.equal(origen.ventas_previstas, 'manual')
  })

  it('comparativa.diferencia_vs_minimo es null si falta ventas_neto', () => {
    const sim = calcularSimuladorMargen({
      gastos: { personal: 500 }, ventas_previstas: 2000, beneficio_objetivo: 0,
    })
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: { resumen: { ventas_neto: 0, coste_ventas_teorico: 0 } },
    })
    assert.equal(cmp.margen_bruto_real, null)
    assert.equal(cmp.pct_materia_prima_real, null)
    assert.equal(cmp.diferencia_vs_minimo, null)
  })

  it('snapshot con ventas_neto=0 y coste=0 NO devuelve valores inventados', () => {
    const { valores } = precargarDesdeSnapshot({
      snapshotMes: {
        periodo: '2026-11',
        resumen: { ventas_neto: 0, coste_ventas_teorico: 0 },
        por_canal: {},
      },
      parametros: null,
    })
    assert.equal(valores.ventas_previstas, null)
    // El por_canal vacío sí da roturas = 0 (es una suma vacía legítima).
    assert.equal(valores.roturas_invitaciones, 0)
  })
})

describe('sello de periodo — datosParaPeriodo descarta cache de otro mes', () => {
  // Cuando el usuario cambia de mes, la petición al endpoint puede
  // llegar tarde con datos del mes anterior. El patrón canónico de
  // la app (datosParaPeriodo) descarta cualquier cache cuyo `mes`
  // no coincida con el periodo pedido. Repasamos sus invariantes:
  const snap = snapshotCasaMarisma()  // tiene periodo='2026-10' internamente

  it('cache del mes correcto → devuelve los datos', () => {
    const cache = { mes: '2026-10', datos: snap }
    assert.deepEqual(datosParaPeriodo(cache, '2026-10'), snap)
  })

  it('cache del mes anterior → descartado (no contamina otro periodo)', () => {
    const cache = { mes: '2026-10', datos: snap }
    assert.equal(datosParaPeriodo(cache, '2026-11'), null)
  })

  it('cache null → null (no inventa datos cuando aún no ha llegado)', () => {
    assert.equal(datosParaPeriodo(null, '2026-11'), null)
  })

  it('al cambiar de mes antes de que llegue el fetch, la precarga parte de null', () => {
    // Simulamos el flujo:
    //   1) Montamos para '2026-10', llega cache { mes: '2026-10', datos }.
    //   2) Usuario cambia a '2026-11' antes del fetch nuevo.
    //   3) datosParaPeriodo(cache, '2026-11') debe dar null →
    //      precargarDesdeSnapshot(null) devuelve todo manual con null.
    const cache = { mes: '2026-10', datos: snap }
    const snapshotCorriente = datosParaPeriodo(cache, '2026-11')
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes: snapshotCorriente,
      parametros: null,
    })
    assert.equal(snapshotCorriente, null)
    assert.equal(valores.roturas_invitaciones, null)
    assert.equal(valores.ventas_previstas, null)
    assert.equal(origen.roturas_invitaciones, 'manual')
    assert.equal(origen.ventas_previstas, 'manual')
  })
})

describe('invariante — el ejemplo exacto de la hoja sigue en verde', () => {
  it('9.060 € / 60,40 % / 39,60 % / 2,53 (Grand Cru Academy)', () => {
    const r = calcularSimuladorMargen({
      gastos: {
        personal: 3000, roturas_invitaciones: 200, materiales: 20,
        suministros: 40, alquiler: 800, otros: 0,
      },
      beneficio_objetivo: 5000,
      ventas_previstas: 15000,
    })
    assert.equal(r.margen_bruto_necesario, 9060)
    assert.equal(r.pct_margen_minimo, 60.4)
    assert.equal(r.pct_materia_prima_max, 39.6)
    assert.equal(r.multiplicador_minimo, 2.53)
  })
})

describe('multiplicador medio real: catálogo en lugar de ventas-por-vino', () => {
  // Patrón que usa el componente: sin uds por vino, media simple
  // (unidades=1 en cada fila → peso idéntico).
  it('media simple del catálogo (sin ponderar por ventas)', () => {
    const sim = calcularSimuladorMargen({
      gastos: { personal: 500 }, ventas_previstas: 2000, beneficio_objetivo: 0,
    })
    const catalogo = [
      // mult = (30/1.10) / 10 = 2.7272…
      { pvp: 30, iva_pct: 10, coste: 10, unidades: 1 },
      // mult = (40/1.10) / 20 = 1.818…
      { pvp: 40, iva_pct: 10, coste: 20, unidades: 1 },
    ]
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: { resumen: { ventas_neto: 2000, coste_ventas_teorico: 600 } },
      catalogo,
    })
    // Σ pvpNeto / Σ coste = (27.27 + 36.36) / (10 + 20) = 2.12
    assert.ok(cmp.multiplicador_medio_real > 2.1 && cmp.multiplicador_medio_real < 2.15,
      `multiplicador fuera de rango: ${cmp.multiplicador_medio_real}`)
  })

  it('catálogo vacío → Sin dato (nulla, no 0)', () => {
    const sim = calcularSimuladorMargen({
      gastos: { personal: 500 }, ventas_previstas: 2000, beneficio_objetivo: 0,
    })
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: { resumen: { ventas_neto: 2000, coste_ventas_teorico: 600 } },
      catalogo: [],
    })
    assert.equal(cmp.multiplicador_medio_real, null)
  })
})
