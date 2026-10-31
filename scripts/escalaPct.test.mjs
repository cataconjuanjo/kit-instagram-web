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

  it('reproduce la preview CoGS% del cierre: valores 37.4..39.2 + null, objetivos 35.4..37.2', () => {
    // Serie real que producía Y: -5..45 porque Number(null)=0 colaba.
    // Tras el fix, escalaPct NO ve ningún 0 falso: solo recibe los
    // valores finitos pre-filtrados por Line.js. Comprobamos aquí
    // directamente la función con la unión de valores + objetivos.
    const valores   = [39.22, 38.98, 38.74, 38.11, 37.67, 38.42, 38.95, 39.08, 37.70, null]
    const objetivos = [37.20, 36.95, 36.70, 36.08, 35.65, 36.40, 36.93, 37.06, 35.70, 35.70]
    const union = []
    for (const v of valores)   if (v != null && Number.isFinite(Number(v))) union.push(Number(v))
    for (const o of objetivos) if (o != null && Number.isFinite(Number(o))) union.push(Number(o))
    // Verifica que el pre-filtro no deja ningún 0 colado por Number(null)
    assert.ok(!union.includes(0), 'union no debe contener 0 (sería Number(null) colado)')
    const r = escalaPct(union)
    // dMin≈35.65, dMax≈39.22, span≈3.57, pad≈0.357
    // min=floor((35.65-0.357)/5)*5=35, max=ceil((39.22+0.357)/5)*5=40
    assert.ok(r.min >= 30, `min esperado >=30, got ${r.min}`)
    assert.ok(r.max <= 45, `max esperado <=45, got ${r.max}`)
    assert.ok(r.min <= 35.65, `min debe envolver dMin=35.65, got ${r.min}`)
    assert.ok(r.max >= 39.22, `max debe envolver dMax=39.22, got ${r.max}`)
    assert.ok(r.max - r.min >= 10)
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
