/**
 * Fase C-4 — veredicto por puntos de margen (no por euros) y
 * etiquetas sensibles a edición/guardado.
 *
 * Caso exacto del bug reproducido en el preview (Casa Marisma 2026-10):
 *   ventas previstas 15.000, margen mínimo 55,03 %
 *   ventas reales     9.621,82, margen real 57,97 %
 *   necesario 8.254,02 €, real 5.577,70 €
 *   ───────────────────────────────────────────
 *   Diferencia en euros ≈ −2.676 € ← comparando volúmenes distintos
 *   Diferencia en puntos = +2,94 pts ← ÚNICO veredicto válido
 *
 * El veredicto debe ser "cubre" (+2,94 pts). La UI además muestra
 * los dos escenarios en euros (previstas vs al ritmo real) para que
 * el usuario entienda que la "diferencia en euros" solo tiene sentido
 * si se proyecta a un mismo volumen de ventas.
 *
 * Ejecutar: node --test scripts/simuladorMargenVeredicto.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularSimuladorMargen,
  compararConReal,
} from '../app/lib/simuladorMargen.js'

// Mismo caso del bug.
const SIM_CASO = {
  gastos: {
    personal: 7254.02,          // ajustado para que (7254.02+1000)/15000 = 55.03%
    roturas_invitaciones: 0,
    materiales: 0, suministros: 0, alquiler: 0, otros: 1000,
  },
  beneficio_objetivo: 0,
  ventas_previstas: 15000,
}

const SNAP_CASO = {
  mes: '2026-10',
  ventas_neto:          9621.82,
  coste_ventas_teorico: 4044.12,
  margen_bruto:         5577.70,
  margen_pct:           58,
  informe: { por_canal: {} },
}

describe('Veredicto por puntos (no por euros) — caso del preview Casa Marisma 2026-10', () => {
  const sim = calcularSimuladorMargen(SIM_CASO)
  const cmp = compararConReal({ simulacion: sim, snapshotMes: SNAP_CASO })

  it('la simulación da margen mínimo = 55,03 %', () => {
    assert.equal(sim.pct_margen_minimo, 55.03)
  })

  it('la realidad da pct_margen_real = 57,97 %', () => {
    assert.equal(cmp.pct_margen_real, 57.97)
  })

  it('cubre = true porque la diferencia en PUNTOS es ≥ 0', () => {
    assert.equal(cmp.diferencia_vs_minimo.cubre, true)
    assert.equal(cmp.diferencia_vs_minimo.puntos, 2.94)
  })

  it('el "necesario al ritmo real" se proyecta sobre las ventas REALES', () => {
    // 55.03 % de 9621.82 = 5.294,88... → redondeado 5294.89 (sign-aware)
    // Proyección: pct_margen_minimo/100 * ventas_reales.
    const esperado = Math.round(55.03 / 100 * 9621.82 * 100) / 100
    assert.equal(cmp.margen_necesario_a_ritmo_real, esperado)
    // Y a ese ritmo, cubre con holgura:
    assert.ok(cmp.diferencia_vs_minimo.eur_a_ritmo_real > 0)
  })

  it('NO expone "eur" sin matizar — la vieja clave con comparación directa no debe estar', () => {
    assert.equal(cmp.diferencia_vs_minimo.eur, undefined,
      'la clave "eur" (comparación cruda de euros a volúmenes distintos) debe desaparecer: ' +
      'usar "eur_a_ritmo_real", que proyecta el mínimo a las ventas reales del mes.')
  })

  it('ventas_reales y margen_bruto_real salen eco en la comparativa', () => {
    assert.equal(cmp.ventas_reales, 9621.82)
    assert.equal(cmp.margen_bruto_real, 5577.70)
  })
})

describe('Caso contrario — NO cubre', () => {
  it('margen real por debajo del mínimo → puntos < 0 y cubre=false', () => {
    const sim = calcularSimuladorMargen({
      gastos: { personal: 7000 }, beneficio_objetivo: 500, ventas_previstas: 10000,
    })
    // sim.pct_margen_minimo = 75 (7500/10000)
    assert.equal(sim.pct_margen_minimo, 75)
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: {
        mes: '2026-10',
        ventas_neto: 10000, coste_ventas_teorico: 4000, margen_bruto: 6000,
      },
    })
    // pct_margen_real = 60; puntos = -15; NO cubre
    assert.equal(cmp.pct_margen_real, 60)
    assert.equal(cmp.diferencia_vs_minimo.puntos, -15)
    assert.equal(cmp.diferencia_vs_minimo.cubre, false)
    // Y el eur_a_ritmo_real ES coherente (mismo signo que puntos).
    assert.ok(cmp.diferencia_vs_minimo.eur_a_ritmo_real < 0)
  })
})

describe('Invariante — ejemplo EXACTO de la hoja Grand Cru Academy', () => {
  it('9.060 € / 60,40 % / 39,60 % / 2,53 intacto', () => {
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

describe('Formato es-ES de puntos: coma decimal, signo "+" o "−"', () => {
  // Reimplemento la función del componente aquí para no acoplar el
  // test a un render, pero esta misma lógica debe estar en la UI.
  function formatearPuntosEs(n) {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—'
    const v = Number(n)
    const abs = Math.abs(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return (v < 0 ? '−' : '+') + abs
  }
  it('positivo con "+" y coma decimal', () => {
    assert.equal(formatearPuntosEs(2.94), '+2,94')
    assert.equal(formatearPuntosEs(0),    '+0,00')
  })
  it('negativo con "−" (U+2212, no guion) y coma decimal', () => {
    assert.equal(formatearPuntosEs(-2.43), '−2,43')
    assert.equal(formatearPuntosEs(-15),   '−15,00')
  })
  it('null / NaN → "—"', () => {
    assert.equal(formatearPuntosEs(null), '—')
    assert.equal(formatearPuntosEs(NaN),  '—')
    assert.equal(formatearPuntosEs('abc'), '—')
  })
})

// ── Etiquetas sensibles a edición / guardado ──────────────────────────
//
// La lógica vive en el componente (useMemo). El modelo pequeño que
// usamos abajo es exactamente ese: dada la precarga base, los overrides
// y los supuestos guardados, el origen efectivo debe cambiar.

function origenEfectivo(base, overrides, supuestosGuardados) {
  const out = { ...base }
  const guardados = {
    materiales:         supuestosGuardados?.materiales,
    suministros:        supuestosGuardados?.suministros,
    otros:              supuestosGuardados?.otros,
    beneficio_objetivo: supuestosGuardados?.beneficio_objetivo,
    ventas_previstas:   supuestosGuardados?.ventas_previstas_fijo,
  }
  for (const k of Object.keys(out)) {
    if (overrides[k] !== undefined) {
      out[k] = 'manual (editado)'
    } else if (guardados[k] !== undefined && guardados[k] !== null) {
      out[k] = 'manual (guardado)'
    }
  }
  return out
}

describe('Etiquetas de origen — tras edición y tras cambio de mes', () => {
  // Precarga base del mes 2026-10 con ventas calculadas.
  const base_2026_10 = {
    personal:             'calculado del mes 2026-10 · imputado a bodega',
    alquiler:             'calculado del mes 2026-10 · imputado a bodega',
    roturas_invitaciones: 'calculado del mes 2026-10 · rotura+invitacion+cocina+cata',
    ventas_previstas:     'calculado del mes 2026-10 · ventas_neto',
    materiales:  'manual', suministros: 'manual', otros: 'manual',
    beneficio_objetivo: 'manual',
  }

  it('sin edits ni guardados → la etiqueta sigue siendo "calculado del mes X"', () => {
    const o = origenEfectivo(base_2026_10, {}, null)
    assert.equal(o.personal,              'calculado del mes 2026-10 · imputado a bodega')
    assert.equal(o.ventas_previstas,      'calculado del mes 2026-10 · ventas_neto')
    assert.equal(o.materiales,            'manual')
  })

  it('editado → "manual (editado)" (gana sobre precarga Y sobre guardado)', () => {
    const overrides = { personal: '1234', beneficio_objetivo: '500' }
    const supuestos = { beneficio_objetivo: 999 }   // guardado, pero edit manda
    const o = origenEfectivo(base_2026_10, overrides, supuestos)
    assert.equal(o.personal,           'manual (editado)')
    assert.equal(o.beneficio_objetivo, 'manual (editado)')
    // Los no tocados mantienen su precarga:
    assert.equal(o.alquiler, 'calculado del mes 2026-10 · imputado a bodega')
  })

  it('guardado SIN editar → "manual (guardado)"', () => {
    const supuestos = {
      materiales: 20, suministros: 40, beneficio_objetivo: 500,
      ventas_previstas_fijo: 12345.67,
    }
    const o = origenEfectivo(base_2026_10, {}, supuestos)
    assert.equal(o.materiales,         'manual (guardado)')
    assert.equal(o.suministros,        'manual (guardado)')
    assert.equal(o.beneficio_objetivo, 'manual (guardado)')
    // ventas_previstas guardado fijo también sobreescribe:
    assert.equal(o.ventas_previstas,   'manual (guardado)')
  })

  it('al cambiar de mes, los campos NO editados recalculan su etiqueta (nuevo mes)', () => {
    const base_2026_11 = {
      personal:             'calculado del mes 2026-11 · imputado a bodega',
      alquiler:             'calculado del mes 2026-11 · imputado a bodega',
      roturas_invitaciones: 'calculado del mes 2026-11 · rotura+invitacion+cocina+cata',
      ventas_previstas:     'calculado del mes 2026-11 · ventas_neto',
      materiales:  'manual', suministros: 'manual', otros: 'manual',
      beneficio_objetivo: 'manual',
    }
    // El usuario editó personal al mirar octubre:
    const overrides = { personal: '1500' }
    const o = origenEfectivo(base_2026_11, overrides, null)
    // personal: sigue "manual (editado)" (su valor se preserva).
    assert.equal(o.personal, 'manual (editado)')
    // el resto YA habla del mes NUEVO:
    assert.equal(o.alquiler,             'calculado del mes 2026-11 · imputado a bodega')
    assert.equal(o.roturas_invitaciones, 'calculado del mes 2026-11 · rotura+invitacion+cocina+cata')
    assert.equal(o.ventas_previstas,     'calculado del mes 2026-11 · ventas_neto')
  })

  it('"manual (editado)" sobrevive si el usuario después borra el override: no, debe volver a precarga', () => {
    // Simulamos que un override se borró (reset del campo): la
    // etiqueta vuelve a precarga en el siguiente render.
    const o = origenEfectivo(base_2026_10, {}, null)
    assert.equal(o.personal, 'calculado del mes 2026-10 · imputado a bodega')
  })
})
