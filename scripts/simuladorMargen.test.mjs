/**
 * Fase C — Simulador de margen mínimo de bodega.
 *
 * Cubre:
 *   - El ejemplo EXACTO de la hoja de Grand Cru Academy que el
 *     usuario usa como referencia (test de aceptación textual).
 *   - Entrada tolerante: coma decimal es-ES, strings vacías, NaN,
 *     negativos, undefined.
 *   - Casos de borde: ventas 0/negativas, %MP 0 o ≥ 100 %.
 *   - Precarga: imputacion_pct 100/50/0/null, "Sin dato" si falta
 *     snapshot/parametros, origen con etiqueta clara.
 *   - Comparación con la realidad: cubre y no cubre, catálogo
 *     ausente → multiplicador null.
 *
 * Ejecutar: node --test scripts/simuladorMargen.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularSimuladorMargen,
  compararConReal,
  num,
  precargarDesdeSnapshot,
} from '../app/lib/simuladorMargen.js'

describe('num() — entrada tolerante es-ES', () => {
  it('acepta números', () => {
    assert.equal(num(1234.56), 1234.56)
    assert.equal(num(0), 0)
    assert.equal(num(-50), -50)
  })
  it('acepta strings es-ES con coma decimal', () => {
    assert.equal(num('1.234,56'), 1234.56)
    assert.equal(num('0,5'), 0.5)
    assert.equal(num(' 15.000 '), 15000)
  })
  it('vacíos / null / NaN → 0 (no undefined, no NaN)', () => {
    assert.equal(num(null), 0)
    assert.equal(num(undefined), 0)
    assert.equal(num(''), 0)
    assert.equal(num('   '), 0)
    assert.equal(num('abc'), 0)
    assert.equal(num(NaN), 0)
  })
})

describe('calcularSimuladorMargen — ejemplo EXACTO de la hoja', () => {
  // Datos literales de la hoja del usuario.
  const entrada = {
    gastos: {
      personal: 3000,
      roturas_invitaciones: 200,
      materiales: 20,
      suministros: 40,
      alquiler: 800,
      otros: 0,
    },
    beneficio_objetivo: 5000,
    ventas_previstas: 15000,
  }
  const r = calcularSimuladorMargen(entrada)

  it('total gastos = 4.060 €', () => {
    assert.equal(r.total_gastos, 4060)
  })
  it('margen bruto necesario = 9.060 €', () => {
    assert.equal(r.margen_bruto_necesario, 9060)
  })
  it('% margen mínimo = 60,40 %', () => {
    assert.equal(r.pct_margen_minimo, 60.4)
  })
  it('% materia prima máximo = 39,60 %', () => {
    assert.equal(r.pct_materia_prima_max, 39.6)
  })
  it('multiplicador mínimo = 2,53', () => {
    assert.equal(r.multiplicador_minimo, 2.53)
  })
  it('personal / ventas = 20,00 %', () => {
    assert.equal(r.pct_por_concepto.personal, 20)
  })
  it('alquiler / ventas = 5,33 %', () => {
    assert.equal(r.pct_por_concepto.alquiler, 5.33)
  })
  it('beneficio objetivo / ventas = 33,33 %', () => {
    assert.equal(r.pct_por_concepto.beneficio_objetivo, 33.33)
  })
  it('motivo null (hay datos válidos)', () => {
    assert.equal(r.motivo, null)
  })
})

describe('calcularSimuladorMargen — casos de borde', () => {
  it('ventas 0 → resultado null con motivo', () => {
    const r = calcularSimuladorMargen({ gastos: { personal: 1000 }, ventas_previstas: 0 })
    assert.equal(r.motivo, 'ventas_no_validas')
    assert.equal(r.pct_margen_minimo, null)
    assert.equal(r.multiplicador_minimo, null)
    assert.equal(r.total_gastos, 1000)
  })
  it('ventas negativas → motivo ventas_no_validas', () => {
    const r = calcularSimuladorMargen({ gastos: {}, ventas_previstas: -1000 })
    assert.equal(r.motivo, 'ventas_no_validas')
  })
  it('ventas NaN → motivo ventas_no_validas', () => {
    const r = calcularSimuladorMargen({ gastos: {}, ventas_previstas: 'xyz' })
    assert.equal(r.motivo, 'ventas_no_validas')
  })
  it('coma decimal en strings se procesa igual', () => {
    const r = calcularSimuladorMargen({
      gastos: { personal: '3.000', alquiler: '800,00' },
      beneficio_objetivo: '5.000',
      ventas_previstas: '15.000',
    })
    assert.equal(r.margen_bruto_necesario, 8800)
    assert.equal(r.pct_margen_minimo, 58.67)
  })
  it('%MP ≥ 100 % (margen ≤ 0) → multiplicador null', () => {
    const r = calcularSimuladorMargen({
      gastos: { personal: 15000 }, beneficio_objetivo: 0, ventas_previstas: 15000,
    })
    // gastos=15000, margen_necesario=15000, %mínimo=100 → %MP=0
    assert.equal(r.pct_margen_minimo, 100)
    assert.equal(r.pct_materia_prima_max, 0)
    assert.equal(r.multiplicador_minimo, null)
  })
  it('%MP > 100 % (gastos+beneficio > ventas) → multiplicador null', () => {
    const r = calcularSimuladorMargen({
      gastos: { personal: 20000 }, beneficio_objetivo: 0, ventas_previstas: 15000,
    })
    // %mínimo > 100 → %MP < 0 → multiplicador null
    assert.ok(r.pct_margen_minimo > 100)
    assert.ok(r.pct_materia_prima_max < 0)
    assert.equal(r.multiplicador_minimo, null)
  })
  it('entrada completamente vacía: sin gastos, sin ventas → motivo', () => {
    const r = calcularSimuladorMargen({})
    assert.equal(r.motivo, 'ventas_no_validas')
    assert.equal(r.total_gastos, 0)
    assert.equal(r.margen_bruto_necesario, 0)
  })
})

describe('precargarDesdeSnapshot — imputación de personal/alquiler', () => {
  const snapshotMes = {
    periodo: '2026-11',
    resumen: { ventas_neto: 4768.18, coste_ventas_teorico: 1560 },
    por_canal: {
      rotura:     { uds: 2, coste: 45 },
      invitacion: { uds: 0, botella_uds: 1, copa_uds: 4, botella_coste: 30, copa_coste: 12 },
      cocina:     { uds: 1, coste: 25 },
      cata:       { uds: 3, coste: 60 },
    },
  }

  it('imputacion 100 %: personal y alquiler íntegros', () => {
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes,
      parametros: {
        total_personal: 3000, total_alquiler: 800,
        imputacion_pct: { personal: 100, alquileres: 100 },
      },
    })
    assert.equal(valores.personal, 3000)
    assert.equal(valores.alquiler, 800)
    assert.match(origen.personal, /imputación 100%/)
    assert.match(origen.alquiler, /imputación 100%/)
  })

  it('imputacion 50 %: mitad a bodega', () => {
    const { valores } = precargarDesdeSnapshot({
      snapshotMes,
      parametros: {
        total_personal: 3000, total_alquiler: 800,
        imputacion_pct: { personal: 50, alquileres: 50 },
      },
    })
    assert.equal(valores.personal, 1500)
    assert.equal(valores.alquiler, 400)
  })

  it('imputacion 0 %: cero a bodega', () => {
    const { valores } = precargarDesdeSnapshot({
      snapshotMes,
      parametros: {
        total_personal: 3000, total_alquiler: 800,
        imputacion_pct: { personal: 0, alquileres: 0 },
      },
    })
    assert.equal(valores.personal, 0)
    assert.equal(valores.alquiler, 0)
  })

  it('imputacion ausente/null → fallback 100 % (coherente con imputarParametros)', () => {
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes,
      parametros: {
        total_personal: 3000, total_alquiler: 800,
        // imputacion_pct ausente
      },
    })
    assert.equal(valores.personal, 3000)
    assert.equal(valores.alquiler, 800)
    assert.match(origen.personal, /imputación 100%/)
  })

  it('roturas+invitaciones+cocina+cata agrega los costes del snapshot', () => {
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes,
      parametros: null,
    })
    // 45 + 30 + 12 + 25 + 60 = 172
    assert.equal(valores.roturas_invitaciones, 172)
    assert.match(origen.roturas_invitaciones, /rotura\+invitacion\+cocina\+cata/)
  })

  it('ventas_previstas usa ventas_neto si existe', () => {
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes,
      parametros: null,
    })
    assert.equal(valores.ventas_previstas, 4768.18)
    assert.match(origen.ventas_previstas, /ventas_neto/)
  })

  it('sin snapshot ni parametros → todos manuales con valor null', () => {
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes: null, parametros: null,
    })
    assert.equal(valores.personal, null)
    assert.equal(valores.alquiler, null)
    assert.equal(valores.roturas_invitaciones, null)
    assert.equal(valores.ventas_previstas, null)
    for (const k of Object.keys(origen)) {
      assert.equal(origen[k], 'manual', `origen.${k} no es "manual"`)
    }
  })

  it('materiales / suministros / otros / beneficio siempre manuales', () => {
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes,
      parametros: {
        total_personal: 3000, total_alquiler: 800,
        imputacion_pct: { personal: 100, alquileres: 100 },
      },
    })
    assert.equal(valores.materiales, null)
    assert.equal(valores.suministros, null)
    assert.equal(valores.otros, null)
    assert.equal(valores.beneficio_objetivo, null)
    assert.equal(origen.materiales, 'manual')
    assert.equal(origen.suministros, 'manual')
    assert.equal(origen.otros, 'manual')
    assert.equal(origen.beneficio_objetivo, 'manual')
  })

  it('etiqueta de origen con "media de N meses" cuando referencia="media_n"', () => {
    const { origen } = precargarDesdeSnapshot({
      snapshotMes,
      parametros: {
        total_personal: 3000,
        imputacion_pct: { personal: 100 },
      },
      referencia: 'media_n',
      mesesUsados: 3,
    })
    assert.match(origen.personal, /media de 3 meses/)
  })
})

describe('compararConReal — diferencia vs mínimo necesario', () => {
  it('bodega cubre el margen (real ≥ necesario)', () => {
    const sim = calcularSimuladorMargen({
      gastos: { personal: 500 }, beneficio_objetivo: 0, ventas_previstas: 2000,
    })
    // sim.margen_bruto_necesario = 500, pct_minimo = 25
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: { resumen: { ventas_neto: 2000, coste_ventas_teorico: 600 } },
    })
    // Real: margen = 1400, %MP = 30, pctMargen real = 70
    assert.equal(cmp.margen_bruto_real, 1400)
    assert.equal(cmp.pct_materia_prima_real, 30)
    // Veredicto por PUNTOS (ventas previstas 2000 == ventas reales 2000,
    // así que el eur_a_ritmo_real coincide con el diferencial naive):
    assert.equal(cmp.diferencia_vs_minimo.eur_a_ritmo_real, 900)
    assert.equal(cmp.diferencia_vs_minimo.puntos, 45)
    assert.equal(cmp.diferencia_vs_minimo.cubre, true)
  })

  it('bodega NO cubre el margen (real < necesario)', () => {
    const sim = calcularSimuladorMargen({
      gastos: { personal: 1000 }, beneficio_objetivo: 500, ventas_previstas: 2000,
    })
    // margen_necesario = 1500, pct_minimo = 75
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: { resumen: { ventas_neto: 2000, coste_ventas_teorico: 1000 } },
    })
    // Real: margen = 1000, pctMargen real = 50
    assert.equal(cmp.diferencia_vs_minimo.eur_a_ritmo_real, -500)
    assert.equal(cmp.diferencia_vs_minimo.puntos, -25)
    assert.equal(cmp.diferencia_vs_minimo.cubre, false)
  })

  it('sin catálogo → multiplicador_medio_real null (no inventa)', () => {
    const sim = calcularSimuladorMargen({
      gastos: { personal: 500 }, beneficio_objetivo: 0, ventas_previstas: 2000,
    })
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: { resumen: { ventas_neto: 2000, coste_ventas_teorico: 600 } },
      catalogo: null,
    })
    assert.equal(cmp.multiplicador_medio_real, null)
  })

  it('catálogo con pvp_sin_iva y coste → multiplicador medio ponderado por unidades', () => {
    const sim = calcularSimuladorMargen({
      gastos: { personal: 500 }, beneficio_objetivo: 0, ventas_previstas: 2000,
    })
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: { resumen: { ventas_neto: 2000, coste_ventas_teorico: 600 } },
      catalogo: [
        { pvp_sin_iva: 30, coste: 10, unidades: 10 },  // mult 3.0, peso 10 × 10 = 100
        { pvp_sin_iva: 40, coste: 20, unidades: 5 },   // mult 2.0, peso 20 × 5 = 100
      ],
    })
    // numer = 30×10 + 40×5 = 500; denom = 10×10 + 20×5 = 200. Mult = 2.5
    assert.equal(cmp.multiplicador_medio_real, 2.5)
  })

  it('catálogo con pvp (con IVA) + iva_pct → netea antes de calcular', () => {
    const sim = calcularSimuladorMargen({
      gastos: { personal: 500 }, beneficio_objetivo: 0, ventas_previstas: 2000,
    })
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: { resumen: { ventas_neto: 2000, coste_ventas_teorico: 600 } },
      catalogo: [
        { pvp: 33, iva_pct: 10, coste: 10, unidades: 1 }, // pvpNeto = 30
      ],
    })
    assert.equal(cmp.multiplicador_medio_real, 3)
  })

  it('ventas_neto 0 → sin margen real; diferencia null', () => {
    const sim = calcularSimuladorMargen({
      gastos: { personal: 500 }, beneficio_objetivo: 0, ventas_previstas: 2000,
    })
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: { resumen: { ventas_neto: 0, coste_ventas_teorico: 0 } },
    })
    assert.equal(cmp.margen_bruto_real, null)
    assert.equal(cmp.diferencia_vs_minimo, null)
  })
})

describe('integración — precarga + cálculo + comparación (sin red)', () => {
  // Fixture realista con la shape exacta de por_canal (Fase 3 y post-B).
  const snapshotMes = {
    periodo: '2026-11',
    resumen: {
      ventas_neto:          15000,
      coste_ventas_teorico:  5940,   // ~ 39,6 % MP, alineado con el minimo
    },
    por_canal: {
      botella:    { uds: 60, ingresos: 10000, coste: 3500 },
      copa:       { uds: 0, copas: 400, ingresos: 5000, coste: 1800 },
      invitacion: { uds: 0, botella_uds: 2, copa_uds: 10, botella_coste: 60, copa_coste: 30 },
      cocina:     { uds: 1, coste: 20 },
      cata:       { uds: 2, coste: 90 },
      rotura:     { uds: 1, coste: 25 },
    },
  }
  const parametros = {
    total_personal: 6000, total_alquiler: 1600,
    imputacion_pct: { personal: 50, alquileres: 50 },
  }

  it('precarga + cálculo + comparación en un flujo end-to-end', () => {
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes, parametros, referencia: 'mes',
    })
    // Personal 50 % de 6000 = 3000; alquiler 50 % de 1600 = 800
    assert.equal(valores.personal, 3000)
    assert.equal(valores.alquiler, 800)
    // Roturas+invitaciones+cocina+cata = 25 + 60 + 30 + 20 + 90 = 225
    assert.equal(valores.roturas_invitaciones, 225)
    assert.equal(valores.ventas_previstas, 15000)
    assert.match(origen.roturas_invitaciones, /rotura\+invitacion\+cocina\+cata/)

    const sim = calcularSimuladorMargen({
      gastos: {
        personal: valores.personal,
        alquiler: valores.alquiler,
        roturas_invitaciones: valores.roturas_invitaciones,
        materiales: 20,     // manual
        suministros: 40,    // manual
        otros: 0,           // manual
      },
      beneficio_objetivo: 3000,   // manual
      ventas_previstas: valores.ventas_previstas,
    })
    assert.equal(sim.total_gastos, 4085)     // 3000+800+225+20+40
    assert.equal(sim.margen_bruto_necesario, 7085)
    assert.ok(sim.pct_margen_minimo > 0 && sim.pct_margen_minimo < 100)

    const cmp = compararConReal({ simulacion: sim, snapshotMes })
    // Real: margen = 15000-5940 = 9060; %MP real = 39,6
    assert.equal(cmp.margen_bruto_real, 9060)
    assert.equal(cmp.pct_materia_prima_real, 39.6)
    // Cubre: pctMargen real ≥ pct_margen_minimo (puntos ≥ 0)
    assert.equal(cmp.diferencia_vs_minimo.cubre, true)
    assert.ok(cmp.diferencia_vs_minimo.puntos >= 0)
    assert.ok(cmp.diferencia_vs_minimo.eur_a_ritmo_real > 0)
  })
})
