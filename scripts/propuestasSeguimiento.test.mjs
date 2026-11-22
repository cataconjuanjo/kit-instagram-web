/**
 * FASE K — Bloque 2: helpers puros del seguimiento de propuestas.
 *
 * Ejecuta: node --test scripts/propuestasSeguimiento.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADOS_SEGUIMIENTO,
  TRANSICIONES_VALIDAS,
  puedeTransicionar,
  agregarSeguimiento,
  indiceSeguimiento,
  indiceDePaso,
  PASOS_UI,
} from '../app/lib/propuestasSeguimiento.js'

describe('TRANSICIONES_VALIDAS', () => {
  it('propuesta puede ir a enviada o rechazada', () => {
    assert.ok(puedeTransicionar('propuesta', 'enviada'))
    assert.ok(puedeTransicionar('propuesta', 'rechazada'))
  })
  it('implantar exige aceptada previa (no se puede implantar desde propuesta)', () => {
    assert.equal(puedeTransicionar('propuesta', 'implantada'), false)
    assert.equal(puedeTransicionar('enviada', 'implantada'), false)
    assert.ok(puedeTransicionar('aceptada', 'implantada'))
  })
  it('rechazada e implantada son finales', () => {
    assert.deepEqual(TRANSICIONES_VALIDAS.rechazada, [])
    assert.deepEqual(TRANSICIONES_VALIDAS.implantada, [])
  })
})

describe('agregarSeguimiento', () => {
  it('cuenta por estado y suma importes sólo cuando corresponde', () => {
    const r = agregarSeguimiento([
      { restaurante_id: 'a', estado: 'propuesta', importe_estimado_eur: 100, importe_capturado_eur: 999 },
      { restaurante_id: 'a', estado: 'enviada', importe_estimado_eur: 200 },
      { restaurante_id: 'a', estado: 'aceptada', importe_estimado_eur: 300 },
      { restaurante_id: 'a', estado: 'implantada', importe_estimado_eur: 400, importe_capturado_eur: 150 },
      { restaurante_id: 'a', estado: 'rechazada', importe_estimado_eur: 500 },
    ])
    assert.deepEqual(r.porEstado, { propuesta: 1, enviada: 1, aceptada: 1, implantada: 1, rechazada: 1 })
    assert.equal(r.estimado, 200 + 300 + 400) // enviada + aceptada + implantada
    assert.equal(r.capturado, 150)            // solo implantada
  })

  it('excluye restaurantes demo', () => {
    const r = agregarSeguimiento([
      { restaurante_id: 'demo', estado: 'enviada', importe_estimado_eur: 100 },
      { restaurante_id: 'real', estado: 'enviada', importe_estimado_eur: 200 },
    ], new Set(['demo']))
    assert.equal(r.estimado, 200)
    assert.equal(r.total, 1)
  })

  it('maneja importes null como 0', () => {
    const r = agregarSeguimiento([
      { restaurante_id: 'a', estado: 'enviada', importe_estimado_eur: null },
      { restaurante_id: 'a', estado: 'implantada', importe_capturado_eur: null },
    ])
    assert.equal(r.estimado, 0)
    assert.equal(r.capturado, 0)
  })
})

describe('indiceSeguimiento / indiceDePaso', () => {
  it('indexa por propuesta_id', () => {
    const r = indiceSeguimiento([
      { propuesta_id: 'p1', estado: 'enviada' },
      { propuesta_id: 'p2', estado: 'aceptada' },
    ])
    assert.equal(r.p1.estado, 'enviada')
    assert.equal(r.p2.estado, 'aceptada')
  })

  it('indiceDePaso resuelve el paso correcto en PASOS_UI', () => {
    assert.equal(indiceDePaso('propuesta'), 0)
    assert.equal(indiceDePaso('enviada'), 1)
    assert.equal(indiceDePaso('aceptada'), 2)
    assert.equal(indiceDePaso('implantada'), 3)
    assert.equal(indiceDePaso('cualquier-otro'), 0) // fallback seguro
  })

  it('PASOS_UI son exactamente 4 (rechazada se pinta aparte)', () => {
    assert.equal(PASOS_UI.length, 4)
    assert.deepEqual(PASOS_UI.map(p => p.id), ['propuesta', 'enviada', 'aceptada', 'implantada'])
  })
})

describe('ESTADOS_SEGUIMIENTO', () => {
  it('incluye los 5 esperados', () => {
    assert.deepEqual(ESTADOS_SEGUIMIENTO.sort(), ['aceptada', 'enviada', 'implantada', 'propuesta', 'rechazada'].sort())
  })
})
