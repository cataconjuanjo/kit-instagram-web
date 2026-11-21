/**
 * Fase D — multiplicador medio PONDERADO por ventas y lista de vinos
 * por debajo del multiplicador mínimo.
 *
 * Cubre:
 *   - Preferencia de fuente: informe.por_vino > catalogo > sin_dato.
 *   - Snapshot antiguo sin por_vino: cae al catalogo simple.
 *   - Snapshot sin por_vino y sin catalogo: Sin dato.
 *   - Lista bajo mínimo: orden por impacto, "ver todos" al UI,
 *     snapshot antiguo → null para que UI diga "Sin dato".
 *
 * Ejecutar: node --test scripts/simuladorMultiplicadorPonderado.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularSimuladorMargen,
  compararConReal,
  vinosBajoMultiplicador,
} from '../app/lib/simuladorMargen.js'

function snapshotConPorVino() {
  return {
    mes: '2026-10',
    ventas_neto:          1000,
    coste_ventas_teorico:  300,
    margen_bruto:          700,
    informe: {
      por_vino: [
        // Vino A: muy rentable (mult 5), impacto alto si estuviera abajo
        { vino_id: 'A', nombre: 'Rioja',    ingresos_neto: 500, coste_total: 100, multiplicador: 5, uds_botella: 10, copas: 0 },
        // Vino B: mult 2 — por debajo si minimo=3
        { vino_id: 'B', nombre: 'Albariño', ingresos_neto: 300, coste_total: 150, multiplicador: 2, uds_botella: 6,  copas: 0 },
        // Vino C: mult 1,67 — también por debajo si minimo=3; impacto mayor que B porque coste_total mayor
        { vino_id: 'C', nombre: 'Jerez',    ingresos_neto: 200, coste_total: 120, multiplicador: 1.67, uds_botella: 4, copas: 0 },
        // Vino D: sin coste (no cuenta)
        { vino_id: 'D', nombre: 'Sin coste', ingresos_neto: 100, coste_total: 0, multiplicador: null, uds_botella: 2, copas: 0 },
      ],
    },
  }
}

describe('compararConReal — multiplicador PONDERADO por ventas (por_vino)', () => {
  const sim = calcularSimuladorMargen({
    gastos: { personal: 400 }, beneficio_objetivo: 0, ventas_previstas: 1000,
  })

  it('multiplicador ponderado = Σ ingresos_neto / Σ coste_total (solo los con ventas y coste)', () => {
    const cmp = compararConReal({ simulacion: sim, snapshotMes: snapshotConPorVino() })
    // (500 + 300 + 200) / (100 + 150 + 120) = 1000 / 370 = 2,7027... → 2.70
    assert.equal(cmp.multiplicador_medio_real, 2.7)
    assert.equal(cmp.multiplicador_fuente, 'ponderado_ventas_mes')
  })

  it('con catálogo presente pero también por_vino → GANA por_vino (no toca el catálogo)', () => {
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: snapshotConPorVino(),
      catalogo: [
        // Catálogo sugiere un multiplicador DIFERENTE (3,5).
        // No debe usarse mientras haya por_vino.
        { pvp: 100, iva_pct: 10, coste: 25, unidades: 1 }, // mult ~3,64
        { pvp: 120, iva_pct: 10, coste: 30, unidades: 1 },
      ],
    })
    assert.equal(cmp.multiplicador_fuente, 'ponderado_ventas_mes')
    // Y el valor sigue siendo el de por_vino (2,70)
    assert.equal(cmp.multiplicador_medio_real, 2.7)
  })

  it('sin por_vino (cierre antiguo) → cae al catálogo simple', () => {
    const snapSinPorVino = {
      mes: '2025-05',
      ventas_neto: 1000, coste_ventas_teorico: 400, margen_bruto: 600,
      // SIN informe.por_vino
    }
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: snapSinPorVino,
      catalogo: [
        { pvp: 100, iva_pct: 10, coste: 25, unidades: 1 },
        { pvp: 120, iva_pct: 10, coste: 30, unidades: 1 },
      ],
    })
    assert.equal(cmp.multiplicador_fuente, 'media_simple_catalogo')
    assert.ok(cmp.multiplicador_medio_real > 0)
  })

  it('sin por_vino y sin catálogo → Sin dato', () => {
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: { ventas_neto: 1000, coste_ventas_teorico: 300, margen_bruto: 700 },
      catalogo: null,
    })
    assert.equal(cmp.multiplicador_medio_real, null)
    assert.equal(cmp.multiplicador_fuente, 'sin_dato')
  })

  it('por_vino vacío → trata como "sin dato" de por_vino y cae a catálogo', () => {
    const snap = { mes: '2026-10', ventas_neto: 1000, coste_ventas_teorico: 300, margen_bruto: 700,
                   informe: { por_vino: [] } }
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: snap,
      catalogo: [{ pvp: 100, iva_pct: 10, coste: 25, unidades: 1 }],
    })
    assert.equal(cmp.multiplicador_fuente, 'media_simple_catalogo')
  })
})

describe('vinosBajoMultiplicador — lista por impacto', () => {
  it('con minimo=3, B y C quedan por debajo; se ordenan por impacto DESC', () => {
    const lista = vinosBajoMultiplicador(snapshotConPorVino(), 3)
    assert.equal(lista.length, 2)
    // impacto C = (3 − 1,67) × 120 = 159,6
    // impacto B = (3 − 2) × 150     = 150
    assert.equal(lista[0].vino_id, 'C', 'C debería estar primero por mayor impacto')
    assert.equal(lista[0].impacto, 159.6)
    assert.equal(lista[1].vino_id, 'B')
    assert.equal(lista[1].impacto, 150)
  })

  it('A NO aparece (mult 5 ≥ 3); D NO aparece (sin coste)', () => {
    const lista = vinosBajoMultiplicador(snapshotConPorVino(), 3)
    const ids = lista.map(v => v.vino_id)
    assert.ok(!ids.includes('A'))
    assert.ok(!ids.includes('D'))
  })

  it('minimo muy alto → todos por debajo; minimo muy bajo → vacío', () => {
    const todos = vinosBajoMultiplicador(snapshotConPorVino(), 10)
    assert.equal(todos.length, 3) // A, B, C (D sigue excluido por coste 0)
    const ninguno = vinosBajoMultiplicador(snapshotConPorVino(), 0.1)
    assert.equal(ninguno.length, 0)
  })

  it('snapshot antiguo sin por_vino → null (UI dice "Sin dato")', () => {
    const resultado = vinosBajoMultiplicador({ mes: '2025-05', ventas_neto: 1000 }, 3)
    assert.equal(resultado, null)
  })

  it('snapshot con por_vino vacío → [] (no "Sin dato": hay dato, dice "nadie bajo")', () => {
    const resultado = vinosBajoMultiplicador({ informe: { por_vino: [] } }, 3)
    assert.deepEqual(resultado, [])
  })

  it('cada entrada incluye nombre, uds_botella, copas, multiplicador, ingresos_neto, coste_total, impacto', () => {
    const [primero] = vinosBajoMultiplicador(snapshotConPorVino(), 3)
    assert.equal(primero.nombre, 'Jerez')
    assert.equal(typeof primero.uds_botella, 'number')
    assert.equal(typeof primero.copas,       'number')
    assert.equal(typeof primero.multiplicador, 'number')
    assert.equal(typeof primero.ingresos_neto, 'number')
    assert.equal(typeof primero.coste_total,   'number')
    assert.equal(typeof primero.impacto,       'number')
  })

  it('multiplicadorMinimo inválido → [] (sin inventar)', () => {
    assert.deepEqual(vinosBajoMultiplicador(snapshotConPorVino(), 0),    [])
    assert.deepEqual(vinosBajoMultiplicador(snapshotConPorVino(), -1),   [])
    assert.deepEqual(vinosBajoMultiplicador(snapshotConPorVino(), null), [])
  })
})
