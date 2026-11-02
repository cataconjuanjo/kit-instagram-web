/**
 * Tests para app/lib/yoyCierre.js — helpers puros YoY del Cierre mensual.
 * Ejecutar: node --test scripts/yoyCierre.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  deltaMetrica,
  esComparable,
  metricaPorKey,
  colorDelta,
  METRICAS_CIERRE_YOY,
  MOTIVOS_TEXTO,
  COLOR_VERDE, COLOR_ROJO,
} from '../app/lib/yoyCierre.js'

// ── deltaMetrica ────────────────────────────────────────────────────────────

describe('deltaMetrica — importe', () => {
  it('valores positivos: delta y deltaPct correctos', () => {
    assert.deepEqual(deltaMetrica(100, 80, 'importe'), { delta: 20, deltaPct: 25 })
    assert.deepEqual(deltaMetrica(10306.36, 9509.09, 'importe'),
      { delta: 797.27, deltaPct: Math.round(797.27 / 9509.09 * 100) })
  })

  it('prev=0 → deltaPct null (evita +∞%)', () => {
    assert.deepEqual(deltaMetrica(100, 0, 'importe'), { delta: 100, deltaPct: null })
    assert.deepEqual(deltaMetrica(0, 0, 'importe'),   { delta: 0,   deltaPct: null })
  })

  it('prev negativo: deltaPct usa |prev|', () => {
    assert.deepEqual(deltaMetrica(-50, 100, 'importe'), { delta: -150, deltaPct: -150 })
    assert.deepEqual(deltaMetrica(-50, -100, 'importe'),
      { delta: 50, deltaPct: 50 })
  })

  it('null / undefined / NaN → ambos null', () => {
    assert.deepEqual(deltaMetrica(null, 100, 'importe'),      { delta: null, deltaPct: null })
    assert.deepEqual(deltaMetrica(100, null, 'importe'),      { delta: null, deltaPct: null })
    assert.deepEqual(deltaMetrica(undefined, 100, 'importe'), { delta: null, deltaPct: null })
    assert.deepEqual(deltaMetrica(NaN, 100, 'importe'),       { delta: null, deltaPct: null })
  })
})

describe('deltaMetrica — ratio (puntos porcentuales)', () => {
  it('delta en pp, deltaPct siempre null', () => {
    // margen_pct 63 vs 61 → +2 pp
    assert.deepEqual(deltaMetrica(63, 61, 'ratio'), { delta: 2, deltaPct: null })
    // 61 vs 63 → -2 pp
    assert.deepEqual(deltaMetrica(61, 63, 'ratio'), { delta: -2, deltaPct: null })
  })

  it('ratio con prev=0: delta sigue siendo valor, deltaPct null', () => {
    assert.deepEqual(deltaMetrica(5, 0, 'ratio'), { delta: 5, deltaPct: null })
  })

  it('ratio con un decimal: redondeo a 1 decimal', () => {
    assert.deepEqual(deltaMetrica(63.21, 61.47, 'ratio'), { delta: 1.7, deltaPct: null })
  })
})

// ── METRICAS_CIERRE_YOY + metricaPorKey ─────────────────────────────────────

describe('METRICAS_CIERRE_YOY — lista cerrada', () => {
  it('contiene las claves oro del Cierre', () => {
    const keys = METRICAS_CIERRE_YOY.map(m => m.key)
    for (const k of ['ventas_bruto', 'ventas_neto', 'coste_ventas_teorico',
                     'margen_bruto', 'margen_pct', 'compras_netas',
                     'salidas_no_venta', 'merma_copa_eur', 'stock_final',
                     'gastos_total', 'resultado']) {
      assert.ok(keys.includes(k), `falta ${k}`)
    }
  })

  it('direcciones semánticas correctas', () => {
    const dirs = Object.fromEntries(METRICAS_CIERRE_YOY.map(m => [m.key, m.dir]))
    assert.equal(dirs.ventas_neto,  'up-good', 'ventas: subir es bueno')
    assert.equal(dirs.margen_pct,   'up-good', 'margen: subir es bueno')
    assert.equal(dirs.resultado,    'up-good', 'resultado: subir es bueno')
    assert.equal(dirs.merma_copa_eur, 'up-bad', 'merma: subir es malo')
    assert.equal(dirs.gastos_total,   'up-bad', 'gastos: subir es malo')
    assert.equal(dirs.coste_ventas_teorico, 'up-bad', 'coste: subir es malo')
    assert.equal(dirs.compras_netas,  'up-bad', 'compras: subir es malo')
    assert.equal(dirs.salidas_no_venta, 'up-bad', 'salidas: subir es malo')
    assert.equal(dirs.stock_final,  'up-good', 'stock final: subir es bueno')
    assert.equal(dirs.devoluciones, 'up-good', 'devoluciones (menos coste): subir es bueno')
  })

  it('rendimiento_copa está marcada sinYoY', () => {
    const m = metricaPorKey('rendimiento_copa')
    assert.ok(m)
    assert.equal(m.sinYoY, true)
  })

  it('metricaPorKey devuelve null para desconocidas', () => {
    assert.equal(metricaPorKey('foo'),       null)
    assert.equal(metricaPorKey(''),          null)
    assert.equal(metricaPorKey(undefined),   null)
  })
})

// ── esComparable ─────────────────────────────────────────────────────────────

describe('esComparable', () => {
  const snapActual = { ventas_neto: 10306, merma_copa_eur: 282.76, stock_final: 6830 }
  const snapPrev   = { ventas_neto: 9509,  merma_copa_eur: 0,      stock_final: 6190 }

  it('ok cuando ambos tienen valor y prev != 0', () => {
    assert.equal(esComparable(snapActual, snapPrev, 'ventas_neto', { prevCerrado: true }), 'ok')
    assert.equal(esComparable(snapActual, snapPrev, 'stock_final', { prevCerrado: true }), 'ok')
  })

  it('sin-cierre-prev si flags.prevCerrado === false', () => {
    assert.equal(esComparable(snapActual, snapPrev, 'ventas_neto', { prevCerrado: false }),
      'sin-cierre-prev')
  })

  it('metrica-no-util para rendimiento_copa', () => {
    assert.equal(esComparable(snapActual, snapPrev, 'rendimiento_copa', { prevCerrado: true }),
      'metrica-no-util')
  })

  it('prev-cero cuando merma 2025 es 0 (artefacto seed) y 2026 > 0', () => {
    assert.equal(esComparable(snapActual, snapPrev, 'merma_copa_eur', { prevCerrado: true }),
      'prev-cero')
  })

  it('prev-cero también cuando ambos son 0 (comparación simétrica trivial)', () => {
    const a = { merma_copa_eur: 0 }
    const b = { merma_copa_eur: 0 }
    assert.equal(esComparable(a, b, 'merma_copa_eur', { prevCerrado: true }), 'prev-cero')
  })

  it('metrica-ausente-prev si el prev no tiene el campo', () => {
    const a = { stock_final: 100 }
    const b = {}  // sin stock_final
    assert.equal(esComparable(a, b, 'stock_final', { prevCerrado: true }), 'metrica-ausente-prev')
  })

  it('ambos-null si ninguno tiene el campo', () => {
    assert.equal(esComparable({}, {}, 'stock_final', { prevCerrado: true }), 'ambos-null')
  })

  it('metrica-desconocida para keys fuera de la lista', () => {
    assert.equal(esComparable({ foo: 1 }, { foo: 2 }, 'foo', { prevCerrado: true }),
      'metrica-desconocida')
  })

  it('cada motivo tiene texto humano en MOTIVOS_TEXTO', () => {
    for (const motivo of ['sin-cierre-prev','metrica-no-util','ambos-null',
                           'metrica-ausente-prev','prev-cero','metrica-desconocida']) {
      assert.ok(typeof MOTIVOS_TEXTO[motivo] === 'string' && MOTIVOS_TEXTO[motivo].length > 0,
        `MOTIVOS_TEXTO.${motivo} falta`)
    }
    assert.equal(MOTIVOS_TEXTO.ok, '')
  })
})

// ── colorDelta (color por dirección) ────────────────────────────────────────

describe('colorDelta', () => {
  it('up-good: delta>0 verde, delta<0 rojo', () => {
    assert.equal(colorDelta(100,  'up-good'), COLOR_VERDE)
    assert.equal(colorDelta(-100, 'up-good'), COLOR_ROJO)
  })

  it('up-bad: delta>0 rojo, delta<0 verde', () => {
    assert.equal(colorDelta(100,  'up-bad'), COLOR_ROJO)
    assert.equal(colorDelta(-100, 'up-bad'), COLOR_VERDE)
  })

  it('delta null / 0 / sin dir → null (sin color)', () => {
    assert.equal(colorDelta(null, 'up-good'), null)
    assert.equal(colorDelta(0,    'up-good'), null)
    assert.equal(colorDelta(100,  null),      null)
    assert.equal(colorDelta(100,  undefined), null)
  })

  it('fix del bug previo: merma subir no debe pintar verde', () => {
    // Antes CierreMensual.js:78 pintaba cualquier delta>0 en verde.
    // Para una métrica up-bad como merma, subir debe ser rojo.
    const merma = metricaPorKey('merma_copa_eur')
    assert.equal(colorDelta(50, merma.dir), COLOR_ROJO,
      'subir la merma debe pintar ROJO, no verde')
  })
})
