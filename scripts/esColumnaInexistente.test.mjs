/**
 * Fase F — helper `esColumnaInexistente`.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { esColumnaInexistente, esRelacionInexistente } from '../app/lib/eventosBodega.js'

describe('esColumnaInexistente', () => {
  it('reconoce 42703 (undefined_column)', () => {
    assert.equal(esColumnaInexistente({ code: '42703', message: 'column "iva_pct" does not exist' }), true)
  })
  it('reconoce PGRST204 (postgrest)', () => {
    assert.equal(esColumnaInexistente({ code: 'PGRST204' }), true)
  })
  it('reconoce mensaje "column ... does not exist" sin código', () => {
    assert.equal(esColumnaInexistente({ message: 'Column "iva_pct" does not exist' }), true)
  })
  it('reconoce "could not find the column" (postgrest schema cache)', () => {
    assert.equal(esColumnaInexistente({ message: 'Could not find the "iva_pct" column of "vinos" in the schema cache' }), true)
  })
  it('null / {} / undefined → false', () => {
    assert.equal(esColumnaInexistente(null), false)
    assert.equal(esColumnaInexistente({}), false)
    assert.equal(esColumnaInexistente(undefined), false)
  })
  it('RLS 42501 → false (es error real)', () => {
    assert.equal(esColumnaInexistente({ code: '42501', message: 'permission denied' }), false)
  })
  it('42P01 (relación inexistente) NO lo captura: ése es `esRelacionInexistente`', () => {
    const err = { code: '42P01', message: 'relation "simulador_margen_bodega" does not exist' }
    assert.equal(esColumnaInexistente(err), false,
      'columna != tabla: relation != column')
    assert.equal(esRelacionInexistente(err), true,
      'y el otro helper SÍ lo captura (comportamiento complementario)')
  })
  it('mensajes genéricos sin "column" → false', () => {
    assert.equal(esColumnaInexistente({ message: 'something went wrong' }), false)
    assert.equal(esColumnaInexistente({ message: 'network error' }), false)
  })
})
