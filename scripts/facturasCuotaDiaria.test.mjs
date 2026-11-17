/**
 * Unit tests for app/lib/facturasCuotaDiaria.js
 * Ejecutar: node --test scripts/facturasCuotaDiaria.test.mjs
 *
 * Comprueba el cálculo del día natural en Europe/Madrid (incluido el
 * cambio de hora) y la decisión del límite diario.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  FACTURAS_ENDPOINT,
  MENSAJE_LIMITE_FACTURAS,
  inicioDiaMadrid,
  inicioDiaMadridISO,
  limiteDiarioFacturas,
  superaLimiteDiarioFacturas,
} from '../app/lib/facturasCuotaDiaria.js'

describe('constantes públicas', () => {
  it('endpoint y mensaje literal son los acordados', () => {
    assert.equal(FACTURAS_ENDPOINT, '/api/facturas/extraer')
    assert.equal(
      MENSAJE_LIMITE_FACTURAS,
      'Has alcanzado el límite diario de facturas leídas con IA. Vuelve mañana o regístrala a mano.',
    )
  })
})

describe('inicioDiaMadrid — invierno (CET = UTC+1)', () => {
  it('UTC 10:00 del 15-ene-2026 → 2026-01-14T23:00:00Z (medianoche de Madrid)', () => {
    const d = new Date('2026-01-15T10:00:00Z')
    assert.equal(inicioDiaMadridISO(d), '2026-01-14T23:00:00.000Z')
  })
  it('UTC 00:30 del 15-ene-2026 (ya es día 15 en Madrid: 01:30) → 23:00 del 14', () => {
    const d = new Date('2026-01-15T00:30:00Z')
    assert.equal(inicioDiaMadridISO(d), '2026-01-14T23:00:00.000Z')
  })
})

describe('inicioDiaMadrid — verano (CEST = UTC+2)', () => {
  it('UTC 10:00 del 15-jul-2026 → 2026-07-14T22:00:00Z (medianoche de Madrid)', () => {
    const d = new Date('2026-07-15T10:00:00Z')
    assert.equal(inicioDiaMadridISO(d), '2026-07-14T22:00:00.000Z')
  })
})

describe('inicioDiaMadrid — días de cambio horario', () => {
  it('spring-forward: 2026-03-29 (domingo, Madrid salta 02→03h) a las 10:00 UTC', () => {
    // Antes de las 01:00 UTC seguía siendo CET (+1). La medianoche
    // local del día 29 cae en 2026-03-28T23:00:00Z.
    const d = new Date('2026-03-29T10:00:00Z')
    assert.equal(inicioDiaMadridISO(d), '2026-03-28T23:00:00.000Z')
  })
  it('fall-back: 2026-10-25 (domingo, Madrid retrocede 03→02h) a las 10:00 UTC', () => {
    // La medianoche local del día 25 también cae a las 22:00 UTC del 24,
    // porque el cambio DST ocurre más tarde ese mismo día.
    const d = new Date('2026-10-25T10:00:00Z')
    assert.equal(inicioDiaMadridISO(d), '2026-10-24T22:00:00.000Z')
  })
})

describe('inicioDiaMadrid — defensivo', () => {
  it('lanza para Date inválido', () => {
    assert.throws(() => inicioDiaMadrid(new Date('not-a-date')), /inválido/)
    assert.throws(() => inicioDiaMadrid('2026-11-17'), /inválido/)
  })
  it('es Date y es válido', () => {
    const r = inicioDiaMadrid(new Date('2026-11-17T12:00:00Z'))
    assert.ok(r instanceof Date)
    assert.ok(!Number.isNaN(r.getTime()))
  })
})

describe('limiteDiarioFacturas', () => {
  it('sin variable de entorno → 20 por defecto', () => {
    assert.equal(limiteDiarioFacturas({}), 20)
    assert.equal(limiteDiarioFacturas({ FACTURAS_IA_LIMITE_DIARIO: undefined }), 20)
    assert.equal(limiteDiarioFacturas({ FACTURAS_IA_LIMITE_DIARIO: '' }), 20)
    assert.equal(limiteDiarioFacturas({ FACTURAS_IA_LIMITE_DIARIO: null }), 20)
  })
  it('respeta el valor cuando es entero >= 1', () => {
    assert.equal(limiteDiarioFacturas({ FACTURAS_IA_LIMITE_DIARIO: '5' }), 5)
    assert.equal(limiteDiarioFacturas({ FACTURAS_IA_LIMITE_DIARIO: '1' }), 1)
    assert.equal(limiteDiarioFacturas({ FACTURAS_IA_LIMITE_DIARIO: '100' }), 100)
  })
  it('descarta valores inválidos y cae al default', () => {
    assert.equal(limiteDiarioFacturas({ FACTURAS_IA_LIMITE_DIARIO: 'abc' }), 20)
    assert.equal(limiteDiarioFacturas({ FACTURAS_IA_LIMITE_DIARIO: '0' }), 20)
    assert.equal(limiteDiarioFacturas({ FACTURAS_IA_LIMITE_DIARIO: '-3' }), 20)
    assert.equal(limiteDiarioFacturas({ FACTURAS_IA_LIMITE_DIARIO: 'NaN' }), 20)
  })
  it('redondea hacia abajo para decimales positivos', () => {
    assert.equal(limiteDiarioFacturas({ FACTURAS_IA_LIMITE_DIARIO: '5.9' }), 5)
  })
})

describe('superaLimiteDiarioFacturas', () => {
  it('justo debajo del límite → false', () => {
    assert.equal(superaLimiteDiarioFacturas(19, 20), false)
  })
  it('igual al límite → true (ya consumidas 20, no entra la nº 21)', () => {
    assert.equal(superaLimiteDiarioFacturas(20, 20), true)
  })
  it('por encima del límite → true', () => {
    assert.equal(superaLimiteDiarioFacturas(21, 20), true)
    assert.equal(superaLimiteDiarioFacturas(100, 20), true)
  })
  it('valores no numéricos → false (no bloquear por error de conteo)', () => {
    assert.equal(superaLimiteDiarioFacturas(NaN, 20), false)
    assert.equal(superaLimiteDiarioFacturas(5, NaN), false)
    assert.equal(superaLimiteDiarioFacturas(null, 20), false)
  })
})
