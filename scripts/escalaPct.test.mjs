/**
 * Tests de escalaPct (app/components/charts/format.js).
 * Eje Y automático para líneas de porcentaje.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { escalaPct } from '../app/components/charts/format.js'

describe('escalaPct', () => {
  it('sin datos → { min: 0, max: 50 }', () => {
    assert.deepStrictEqual(escalaPct([]), { min: 0, max: 50 })
    assert.deepStrictEqual(escalaPct(null), { min: 0, max: 50 })
    assert.deepStrictEqual(escalaPct(undefined), { min: 0, max: 50 })
    assert.deepStrictEqual(escalaPct([null, NaN, undefined, 'x']), { min: 0, max: 50 })
  })

  it('acota a múltiplos de 5 con margen del 10% (rango razonable)', () => {
    // Valores entre 32 y 48: pad = 1.6, min=30.4→30, max=49.6→50
    const r = escalaPct([32, 37, 40, 48])
    assert.strictEqual(r.min, 30)
    assert.strictEqual(r.max, 50)
    assert.ok(r.max - r.min >= 10)
    assert.ok(r.min % 5 === 0, `min ${r.min} no es múltiplo de 5`)
    assert.ok(r.max % 5 === 0, `max ${r.max} no es múltiplo de 5`)
  })

  it('aplica mínimo de rango de 10 puntos cuando los valores están pegados', () => {
    // Todos a 37: span=0 → pad=0 → min=max=35. Fuerza expansión a >=10.
    const r = escalaPct([37, 37, 37])
    assert.ok(r.max - r.min >= 10, `${r.max}-${r.min}=${r.max - r.min}`)
    assert.ok(r.min % 5 === 0, `min ${r.min} no es múltiplo de 5`)
    assert.ok(r.max % 5 === 0, `max ${r.max} no es múltiplo de 5`)
  })

  it('rango mínimo también cuando min y max están a <10 puntos', () => {
    const r = escalaPct([38, 42])
    assert.ok(r.max - r.min >= 10, `${r.max}-${r.min}=${r.max - r.min}`)
    assert.ok(r.min % 5 === 0, `min ${r.min} no es múltiplo de 5`)
    assert.ok(r.max % 5 === 0, `max ${r.max} no es múltiplo de 5`)
  })

  it('ignora valores no-finitos (null, NaN, strings)', () => {
    const r1 = escalaPct([32, null, 48, NaN, 'bad', 40])
    const r2 = escalaPct([32, 48, 40])
    assert.deepStrictEqual(r1, r2)
  })

  it('mezcla valor + objetivo: eje envuelve ambos con margen', () => {
    // Ventana típica cierre: CoGS reales 33-39, objetivo 37.1
    const r = escalaPct([33, 35, 37.1, 38, 39])
    // span=6, pad=0.6 → min=floor((33-0.6)/5)*5=30, max=ceil((39+0.6)/5)*5=40
    assert.strictEqual(r.min, 30)
    assert.strictEqual(r.max, 40)
  })

  it('resiste valores negativos (teórico, por si cambian de signo)', () => {
    const r = escalaPct([-5, 10])
    assert.ok(r.min % 5 === 0, `min ${r.min} no es múltiplo de 5`)
    assert.ok(r.max % 5 === 0, `max ${r.max} no es múltiplo de 5`)
    assert.ok(r.min <= -5)
    assert.ok(r.max >= 10)
    assert.ok(r.max - r.min >= 10)
  })
})
